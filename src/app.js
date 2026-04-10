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

const LMS_PREMIUM_LOADER_BOOTSTRAP = `<link rel="preload" as="image" href="/public/images/branding/logo-dark.jpg" data-bilge-loader-bootstrap />
<link rel="preload" as="image" href="/public/images/branding/logo-light.jpg" data-bilge-loader-bootstrap />
<style data-bilge-loader-bootstrap>
  .bilge-page-loader {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: none;
    place-items: center;
    padding: 1.5rem;
    background:
      radial-gradient(circle at top left, rgba(215, 166, 77, 0.18) 0%, transparent 32%),
      radial-gradient(circle at bottom right, rgba(215, 166, 77, 0.12) 0%, transparent 28%),
      linear-gradient(180deg, #0b0a08 0%, #12100d 100%);
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 240ms ease,
      visibility 240ms ease;
  }

  html[data-theme="light"] .bilge-page-loader {
    background:
      radial-gradient(circle at top left, rgba(198, 143, 49, 0.12) 0%, transparent 30%),
      radial-gradient(circle at bottom right, rgba(198, 143, 49, 0.08) 0%, transparent 26%),
      linear-gradient(180deg, #f7f2e8 0%, #fdfaf3 100%);
  }

  html[data-bilge-loader="loading"] .bilge-page-loader,
  html[data-bilge-loader="ready"] .bilge-page-loader {
    display: grid;
    opacity: 1;
    visibility: visible;
  }

  html[data-bilge-loader="ready"] .bilge-page-loader {
    opacity: 0;
    visibility: hidden;
  }

  .bilge-page-loader__panel {
    width: min(680px, 100%);
    display: grid;
    gap: 1.15rem;
    justify-items: center;
    padding: clamp(1.25rem, 3vw, 2rem);
    border: 1px solid rgba(215, 166, 77, 0.18);
    border-radius: 28px;
    background: rgba(12, 10, 8, 0.82);
    box-shadow:
      0 24px 80px rgba(0, 0, 0, 0.28),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }

  html[data-theme="light"] .bilge-page-loader__panel {
    background: rgba(255, 251, 244, 0.88);
    box-shadow:
      0 24px 80px rgba(44, 30, 8, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.62);
  }

  .bilge-page-loader__brand {
    width: min(100%, 420px);
  }

  .bilge-page-loader__brand img {
    display: none;
    width: 100%;
    height: auto;
  }

  html[data-theme="dark"] .bilge-page-loader__brand .bilge-page-loader__brand--dark,
  html:not([data-theme="light"]) .bilge-page-loader__brand .bilge-page-loader__brand--dark,
  html[data-theme="light"] .bilge-page-loader__brand .bilge-page-loader__brand--light {
    display: block;
  }

  .bilge-page-loader__label {
    margin: 0;
    color: rgba(252, 244, 227, 0.92);
    font-size: clamp(0.96rem, 1.5vw, 1.08rem);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-align: center;
    text-wrap: balance;
  }

  html[data-theme="light"] .bilge-page-loader__label {
    color: rgba(54, 37, 10, 0.86);
  }

  .bilge-page-loader__track {
    position: relative;
    width: min(320px, 82vw);
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
  }

  html[data-theme="light"] .bilge-page-loader__track {
    background: rgba(102, 76, 26, 0.12);
  }

  .bilge-page-loader__track::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(90deg, transparent 0%, rgba(215, 166, 77, 0.16) 35%, transparent 100%);
  }

  .bilge-page-loader__bar {
    position: absolute;
    inset: 0;
    width: 42%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(215, 166, 77, 0) 0%, rgba(244, 199, 116, 0.92) 40%, rgba(215, 166, 77, 0.35) 100%);
    box-shadow: 0 0 24px rgba(215, 166, 77, 0.35);
    animation: bilgeLoaderSweep 1.1s ease-in-out infinite;
    will-change: transform;
  }

  .bilge-page-loader__note {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
    color: rgba(240, 221, 182, 0.75);
    font-size: 0.82rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  html[data-theme="light"] .bilge-page-loader__note {
    color: rgba(108, 77, 23, 0.72);
  }

  .bilge-page-loader__pulse {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: linear-gradient(180deg, #f4c774, #c7922f);
    box-shadow: 0 0 18px rgba(215, 166, 77, 0.48);
    animation: bilgeLoaderPulse 1.2s ease-in-out infinite;
  }

  @keyframes bilgeLoaderSweep {
    0% {
      transform: translateX(-115%);
    }

    100% {
      transform: translateX(260%);
    }
  }

  @keyframes bilgeLoaderPulse {
    0%,
    100% {
      transform: scale(0.92);
      opacity: 0.72;
    }

    50% {
      transform: scale(1);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bilge-page-loader,
    .bilge-page-loader__bar,
    .bilge-page-loader__pulse {
      transition: none;
      animation: none;
    }
  }
</style>
<script data-bilge-loader-bootstrap>
  (function () {
    var startTime = Date.now();
    var transitionToken = 0;

    var showLoader = function () {
      transitionToken += 1;
      startTime = Date.now();
      document.documentElement.setAttribute("data-bilge-loader", "loading");
    };

    var hideLoader = function () {
      var currentToken = transitionToken;
      var remaining = Math.max(0, 260 - (Date.now() - startTime));

      window.setTimeout(function () {
        if (currentToken !== transitionToken) return;
        document.documentElement.setAttribute("data-bilge-loader", "ready");
        window.setTimeout(function () {
          if (currentToken !== transitionToken) return;
          document.documentElement.removeAttribute("data-bilge-loader");
        }, 220);
      }, remaining);
    };

    window.__bilgeShowPageLoader = showLoader;
    window.__bilgeHidePageLoader = hideLoader;
    document.addEventListener("DOMContentLoaded", hideLoader, { once: true });
    window.addEventListener("pageshow", hideLoader, { once: true });
    window.addEventListener("load", hideLoader, { once: true });
    window.setTimeout(hideLoader, 1200);
  })();
</script>`;

const LMS_PREMIUM_LOADER_MARKUP = `<div class="bilge-page-loader" data-bilge-page-loader role="status" aria-live="polite" aria-label="Loading page">
  <div class="bilge-page-loader__panel">
    <div class="bilge-page-loader__brand" aria-hidden="true">
      <img
        class="bilge-page-loader__brand--dark"
        src="/public/images/branding/logo-dark.jpg"
        alt=""
        decoding="async"
        fetchpriority="high"
      />
      <img
        class="bilge-page-loader__brand--light"
        src="/public/images/branding/logo-light.jpg"
        alt=""
        decoding="async"
        fetchpriority="high"
      />
    </div>
    <p class="bilge-page-loader__label">Preparing your Bilge LMS workspace.</p>
    <div class="bilge-page-loader__track" aria-hidden="true">
      <span class="bilge-page-loader__bar"></span>
    </div>
    <div class="bilge-page-loader__note">
      <span class="bilge-page-loader__pulse"></span>
      <span>Loading your next view</span>
    </div>
  </div>
</div>`;

const LMS_THEME_SCRIPT =
  '<script src="/public/js/website-theme.js" defer data-bilge-theme-script></script>';

const LMS_BODY_THEME_SYNC_SCRIPT = `<script data-bilge-body-theme-sync>
  (function () {
    try {
      var resolvedTheme =
        document.documentElement.getAttribute("data-theme") ||
        window.localStorage.getItem("bilge-website-theme") ||
        "light";
      var nextTheme = resolvedTheme === "dark" ? "dark" : "light";
      document.body.classList.remove("theme-light", "theme-dark");
      document.body.classList.add("theme-" + nextTheme);
    } catch (error) {
      document.body.classList.remove("theme-light", "theme-dark");
      document.body.classList.add("theme-light");
    }
  })();
</script>`;

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
      const isLmsView = !isWebsiteView;
      const loaderBootstrap =
        isLmsView && !html.includes("data-bilge-loader-bootstrap")
          ? LMS_PREMIUM_LOADER_BOOTSTRAP
          : "";
      const themeScript =
        isLmsView && !html.includes("data-bilge-theme-script") ? LMS_THEME_SCRIPT : "";
      const languageBootstrap =
        isLmsView &&
        !html.includes("data-bilge-language-bootstrap")
          ? `<script data-bilge-language-bootstrap>
  (function () {
    try {
      var themeKey = "bilge-website-theme";
      var storageKey = "bilge-language-preference";
      var legacyStorageKey = "bilge-website-language";
      var translationCookieKey = "googtrans";
      var languageParamKey = "__bilge_lang";
      var serverTheme = ${JSON.stringify(res.locals.themePreference || "light")};
      var normalizeLanguage = function (languageCode) {
        var value = String(languageCode || "").trim();
        if (!value) {
          return "${DEFAULT_LANGUAGE_PREFERENCE}";
        }
        if (/^zh-cn$/i.test(value)) return "zh-CN";
        if (/^zh-tw$/i.test(value)) return "zh-TW";
        return value.split("-")[0].toLowerCase();
      };
      var storedTheme = window.localStorage.getItem(themeKey);
      var resolvedTheme =
        storedTheme === "light" || storedTheme === "dark"
          ? storedTheme
          : serverTheme || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
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
      document.documentElement.setAttribute("data-theme", resolvedTheme);
      document.documentElement.style.colorScheme = resolvedTheme;
      window.__bilgeServerLanguagePreference = serverLanguage;
      window.__bilgeLanguageUserAuthenticated = authenticated;
      window.__bilgeThemeUserAuthenticated = authenticated;
      window.__bilgePreferredLanguage = resolvedLanguage;
      document.documentElement.setAttribute("lang", resolvedLanguage);
      window.localStorage.setItem(themeKey, resolvedTheme);
      window.localStorage.setItem(storageKey, resolvedLanguage);
      window.localStorage.setItem(legacyStorageKey, resolvedLanguage);
      if (resolvedLanguage && resolvedLanguage !== "${DEFAULT_LANGUAGE_PREFERENCE}") {
        setCookie(resolvedLanguage);
      } else {
        clearCookie();
      }
    } catch (error) {
      document.documentElement.setAttribute("data-theme", "light");
      document.documentElement.style.colorScheme = "light";
      document.documentElement.setAttribute("lang", "${DEFAULT_LANGUAGE_PREFERENCE}");
      window.__bilgeServerLanguagePreference = ${JSON.stringify(res.locals.languagePreference || null)};
      window.__bilgeLanguageUserAuthenticated = ${JSON.stringify(Boolean(req.session?.user))};
      window.__bilgeThemeUserAuthenticated = ${JSON.stringify(Boolean(req.session?.user))};
      window.__bilgePreferredLanguage = "${DEFAULT_LANGUAGE_PREFERENCE}";
    }
  })();
</script>
<link rel="stylesheet" href="/public/css/language-selector.css" data-bilge-language-style />
<script src="/public/js/website-preferences.js" defer data-bilge-language-script></script>
<script src="//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit" defer data-bilge-language-script></script>`
          : "";
      const loaderMarkup =
        isLmsView && !html.includes("data-bilge-page-loader") ? LMS_PREMIUM_LOADER_MARKUP : "";
      const bodyThemeSyncScript =
        isLmsView && !html.includes("data-bilge-body-theme-sync")
          ? LMS_BODY_THEME_SYNC_SCRIPT
          : "";
      const languageBodyMarkup =
        isLmsView && !html.includes('id="google_translate_element"')
          ? '<div id="google_translate_element" class="google-translate-anchor" aria-hidden="true"></div>'
          : "";
      const nextHtml =
        typeof html === "string" && html.includes("</body>")
          ? html
              .replace(
                "</head>",
                loaderBootstrap || languageBootstrap || themeScript
                  ? `${loaderBootstrap}${languageBootstrap}${themeScript}</head>`
                  : "</head>"
              )
              .replace(
                "</body>",
                `${bodyThemeSyncScript}${loaderMarkup}${languageBodyMarkup}${
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
