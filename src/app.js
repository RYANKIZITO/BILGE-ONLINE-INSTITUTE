import "./config/load-env.js";
import express from "express";
import path from "path";
import prisma from "./lib/prisma.js";
import authRouter from "./modules/auth/auth.routes.js";
import websiteRouter, { showWebsite404 } from "./modules/website/website.routes.js";
import appRouter from "./routes.js";
import sessionMiddleware from "./config/session.js";
import { DEFAULT_LANGUAGE_PREFERENCE } from "./utils/language.js";
import { syncConfiguredSuperAdmins } from "./bootstrap/super-admin-sync.js";

const app = express();
app.set("trust proxy", 1);
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(process.cwd(), "public");
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const FAVICON_PATH = path.join(PUBLIC_DIR, "images", "branding", "favicon.png");
const ROBOTS_PATH = path.join(PUBLIC_DIR, "robots.txt");
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const BOT_SCAN_PATTERNS = [
  /^\/wp-admin(?:\/|$)/i,
  /^\/wordpress(?:\/|$)/i,
  /^\/xmlrpc\.php$/i,
  /^\/phpmyadmin(?:\/|$)/i,
  /^\/\.composer(?:\/|$)/i,
  /^\/\.config(?:\/|$)/i,
  /^\/\.env(?:$|\.)/i,
  /^\/\.git(?:\/|$)/i,
  /^\/cgi-bin(?:\/|$)/i,
  /^\/config\/git-credentials$/i,
  /^\/config\.json$/i,
  /^\/boaform/i,
];

function isLikelyBotScan(requestUrl) {
  const pathname = String(requestUrl || "").split("?")[0];
  return BOT_SCAN_PATTERNS.some((pattern) => pattern.test(pathname));
}

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));

// Static files
app.use("/public", express.static(PUBLIC_DIR));
app.use(
  "/uploads",
  express.static(UPLOADS_DIR, {
    acceptRanges: true,
    setHeaders: (res, filePath) => {
      res.setHeader("X-Content-Type-Options", "nosniff");

      if (/\.(mp4|m4v)$/i.test(filePath)) {
        res.setHeader("Content-Type", "video/mp4");
      } else if (/\.webm$/i.test(filePath)) {
        res.setHeader("Content-Type", "video/webm");
      } else if (/\.mov$/i.test(filePath)) {
        res.setHeader("Content-Type", "video/quicktime");
      }
    },
  })
);

app.get("/favicon.ico", (req, res) => {
  res.sendFile(FAVICON_PATH);
});

app.get("/robots.txt", (req, res) => {
  res.type("text/plain").sendFile(ROBOTS_PATH);
});

// Basic production-safe security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (req.secure) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  next();
});

// Body parsers
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Simple request logger
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;

    if (IS_PRODUCTION && res.statusCode === 404 && isLikelyBotScan(req.originalUrl)) {
      return;
    }

    const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`;
    console.log(line);
  });
  next();
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    name: "BILGE ONLINE INSTITUTE",
    ts: new Date().toISOString(),
  });
});

app.get("/health/db", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: "connected" });
  } catch {
    res.status(500).json({ ok: false, db: "error" });
  }
});

// Session
app.use(sessionMiddleware);

// Inject user into all EJS views
app.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  res.locals.themePreference = req.session?.user?.themePreference || "light";
  res.locals.languagePreference = req.session?.user?.languagePreference || null;
  res.locals.isAuthenticated = Boolean(req.session?.user);
  next();
});

app.use((req, res, next) => {
  const originalRender = res.render.bind(res);
  const dashboardLanguageViews = new Set([
    "student/dashboard",
    "instructor/dashboard",
    "admin/dashboard",
    "super-admin/dashboard",
  ]);

  res.render = (view, options, callback) => {
    let renderOptions = options;
    let renderCallback = callback;

    if (typeof renderOptions === "function") {
      renderCallback = renderOptions;
      renderOptions = undefined;
    }

    return originalRender(view, renderOptions, (err, html) => {
      if (err) {
        if (typeof renderCallback === "function") {
          return renderCallback(err);
        }

        return next(err);
      }

      const liveNavigationScript =
        '<script src="/public/js/live-get.js" defer data-live-navigation></script>';
      const localDateTimeScript =
        '<script src="/public/js/local-datetime.js" defer data-local-datetime-script></script>';
      const isWebsiteView = String(view || "").startsWith("website/");
      const isDashboardLanguageView = dashboardLanguageViews.has(String(view || ""));
      const languageBootstrap =
        !isWebsiteView &&
        isDashboardLanguageView &&
        !html.includes("data-bilge-language-bootstrap")
          ? `<link rel="stylesheet" href="/public/css/language-selector.css" data-bilge-language-style />
<script data-bilge-language-bootstrap>
  (function () {
    try {
      var storageKey = "bilge-language-preference";
      var legacyStorageKey = "bilge-website-language";
      var translationCookieKey = "googtrans";
      var languageParamKey = "__bilge_lang";
      var normalizeLanguage = function (languageCode) {
        var value = String(languageCode || "").trim();
        if (!value) {
          return "${DEFAULT_LANGUAGE_PREFERENCE}";
        }
        if (/^zh-cn$/i.test(value)) return "zh-CN";
        if (/^zh-tw$/i.test(value)) return "zh-TW";
        return value.split("-")[0].toLowerCase();
      };
      var serverLanguage = ${JSON.stringify(res.locals.languagePreference || null)};
      var authenticated = ${JSON.stringify(Boolean(req.session?.user))};
      var params = new URLSearchParams(window.location.search);
      var requestedLanguage = params.get(languageParamKey);
      var storedLanguage = window.localStorage.getItem(storageKey) || window.localStorage.getItem(legacyStorageKey);
      var browserLanguage = (navigator.language || "${DEFAULT_LANGUAGE_PREFERENCE}").toLowerCase();
      var resolvedLanguage =
        normalizeLanguage(
          requestedLanguage || serverLanguage || storedLanguage || browserLanguage || "${DEFAULT_LANGUAGE_PREFERENCE}"
        );
      var hostname = window.location.hostname || "";
      var cookieDomain =
        hostname && hostname !== "localhost" && !/^\\d{1,3}(\\.\\d{1,3}){3}$/.test(hostname)
          ? ";domain=." + hostname
          : "";
      var clearCookie = function () {
        var expired = translationCookieKey + "=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT;SameSite=Lax";
        document.cookie = expired;
        if (cookieDomain) {
          document.cookie = expired + cookieDomain;
        }
      };
      var setCookie = function (languageCode) {
        var cookieValue = "/en/" + languageCode;
        var baseCookie =
          translationCookieKey + "=" + cookieValue + ";path=/;max-age=31536000;SameSite=Lax";
        document.cookie = baseCookie;
        if (cookieDomain) {
          document.cookie = baseCookie + cookieDomain;
        }
      };
      window.__bilgeServerLanguagePreference = serverLanguage;
      window.__bilgeLanguageUserAuthenticated = authenticated;
      window.__bilgePreferredLanguage = resolvedLanguage;
      document.documentElement.setAttribute("lang", resolvedLanguage);
      window.localStorage.setItem(storageKey, resolvedLanguage);
      window.localStorage.setItem(legacyStorageKey, resolvedLanguage);
      if (resolvedLanguage && resolvedLanguage !== "${DEFAULT_LANGUAGE_PREFERENCE}") {
        setCookie(resolvedLanguage);
      } else {
        clearCookie();
      }
    } catch (error) {
      document.documentElement.setAttribute("lang", "${DEFAULT_LANGUAGE_PREFERENCE}");
      window.__bilgeServerLanguagePreference = ${JSON.stringify(res.locals.languagePreference || null)};
      window.__bilgeLanguageUserAuthenticated = ${JSON.stringify(Boolean(req.session?.user))};
      window.__bilgePreferredLanguage = "${DEFAULT_LANGUAGE_PREFERENCE}";
    }
  })();
</script>
<script src="/public/js/website-preferences.js" defer data-bilge-language-script></script>
<script src="//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit" defer data-bilge-language-script></script>`
          : "";
      const languageBodyMarkup =
        !isWebsiteView &&
        isDashboardLanguageView &&
        !html.includes("data-bilge-language-dock")
          ? `<div class="bilge-language-dock" data-bilge-language-dock>
  <label class="bilge-language-control" for="bilge-global-language">
    <span>Language</span>
    <select id="bilge-global-language" data-language-select aria-label="Select application language"></select>
  </label>
</div>
<div id="google_translate_element" class="google-translate-anchor" aria-hidden="true"></div>`
          : "";

      const nextHtml =
        typeof html === "string" && html.includes("</body>")
          ? html
              .replace(
                "</head>",
                languageBootstrap ? `${languageBootstrap}</head>` : "</head>"
              )
              .replace(
                "</body>",
                `${languageBodyMarkup}${
                  !html.includes("data-live-navigation") ? liveNavigationScript : ""
                }${
                  !html.includes("data-local-datetime-script") ? localDateTimeScript : ""
                }</body>`
              )
          : html;

      if (typeof renderCallback === "function") {
        return renderCallback(null, nextHtml);
      }

      return res.send(nextHtml);
    });
  };

  next();
});

app.use("/", websiteRouter);

// Auth routes
app.use("/", authRouter);

// App routes
app.use("/", appRouter);

// Return a minimal response for common hostile scans instead of the full website 404 page.
app.use((req, res, next) => {
  if (isLikelyBotScan(req.originalUrl)) {
    return res.status(404).type("text/plain").send("Not Found");
  }

  return next();
});

// 404 handler
app.use((req, res) => {
  if (req.accepts("html") && !req.originalUrl.startsWith("/api/")) {
    return showWebsite404(req, res);
  }

  res.status(404).json({ ok: false, message: "Not Found" });
});

// Global error handler
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const isProd = process.env.NODE_ENV === "production";
  const payload = {
    ok: false,
    message: "Internal Server Error",
  };
  if (!isProd && err?.message) {
    payload.detail = err.message;
  }
  res.status(500).json(payload);
});

try {
  await syncConfiguredSuperAdmins(prisma);
} catch (error) {
  console.error("[bootstrap] Superadmin sync failed:", error?.message || error);
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
