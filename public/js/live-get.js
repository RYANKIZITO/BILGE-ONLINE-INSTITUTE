(function () {
  const parser = new DOMParser();
  const LIVE_SCRIPT_ATTR = "data-live-navigation";
  const DEFAULT_LANGUAGE = "en";
  const LANGUAGE_STORAGE_KEYS = [
    "bilge-language-preference",
    "bilge-website-language",
  ];
  const CONTENT_SELECTORS = [
    "[data-live-root]",
    "main",
    "body > .page",
    "body > .auth-shell",
    "body > .page-shell",
  ];

  const isModifiedClick = (event) =>
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey;

  const normalizeLanguage = (languageCode) => {
    const value = String(languageCode || "").trim();
    if (!value) {
      return DEFAULT_LANGUAGE;
    }

    if (/^zh-cn$/i.test(value)) return "zh-CN";
    if (/^zh-tw$/i.test(value)) return "zh-TW";
    return value.split("-")[0].toLowerCase();
  };

  const getActiveLanguage = () => {
    const storedLanguage = LANGUAGE_STORAGE_KEYS.reduce((resolvedValue, key) => {
      if (resolvedValue) {
        return resolvedValue;
      }

      try {
        return window.localStorage.getItem(key) || resolvedValue;
      } catch {
        return resolvedValue;
      }
    }, "");

    return normalizeLanguage(
      window.__bilgePreferredLanguage ||
        window.__bilgeServerLanguagePreference ||
        storedLanguage ||
        document.documentElement.getAttribute("lang") ||
        DEFAULT_LANGUAGE
    );
  };

  // Live DOM swapping resets translated content, so only keep it enabled for English.
  const isLiveNavigationEnabled = () => getActiveLanguage() === DEFAULT_LANGUAGE;

  const isHtmlResponse = (response) => {
    const contentType = response.headers.get("content-type") || "";
    return contentType.includes("text/html");
  };

  const copyAttributes = (fromEl, toEl) => {
    Array.from(toEl.attributes).forEach((attribute) => {
      toEl.removeAttribute(attribute.name);
    });

    Array.from(fromEl.attributes).forEach((attribute) => {
      toEl.setAttribute(attribute.name, attribute.value);
    });
  };

  const getAbsoluteHref = (href) => {
    if (!href) return "";
    return new URL(href, window.location.origin).toString();
  };

  const getHeadSignature = (doc) => {
    const stylesheets = Array.from(
      doc.head.querySelectorAll('link[rel="stylesheet"]')
    ).map((link) => getAbsoluteHref(link.getAttribute("href")));

    const inlineStyles = Array.from(doc.head.querySelectorAll("style")).map((style) =>
      style.textContent.trim()
    );

    return JSON.stringify({
      stylesheets,
      inlineStyles,
    });
  };

  const getSharedContentRoots = (nextDocument) => {
    for (const selector of CONTENT_SELECTORS) {
      const currentRoot = document.querySelector(selector);
      const nextRoot = nextDocument.querySelector(selector);

      if (currentRoot && nextRoot) {
        return {
          currentRoot,
          nextRoot,
        };
      }
    }

    return null;
  };

  const runClientEnhancements = (root) => {
    if (typeof window.__runBilgeClientTimeEnhancements === "function") {
      window.__runBilgeClientTimeEnhancements(root || document);
    }

    if (typeof window.__runBilgeWebsiteHeaderEnhancements === "function") {
      window.__runBilgeWebsiteHeaderEnhancements(root || document);
    }

    if (typeof window.__runBilgeThemeEnhancements === "function") {
      window.__runBilgeThemeEnhancements(root || document);
    }

    if (typeof window.__runBilgeLanguageEnhancements === "function") {
      window.__runBilgeLanguageEnhancements(root || document);
    }
  };

  const activateScripts = (root) => {
    root.querySelectorAll("script").forEach((script) => {
      if (script.hasAttribute(LIVE_SCRIPT_ATTR)) {
        return;
      }

      const replacement = document.createElement("script");

      Array.from(script.attributes).forEach((attribute) => {
        replacement.setAttribute(attribute.name, attribute.value);
      });

      if (script.textContent) {
        replacement.textContent = script.textContent;
      }

      script.replaceWith(replacement);
    });
  };

  const swapWholePage = (nextDocument) => {
    document.title = nextDocument.title;
    document.head.innerHTML = nextDocument.head.innerHTML;
    copyAttributes(nextDocument.body, document.body);
    document.body.innerHTML = nextDocument.body.innerHTML;
    activateScripts(document.head);
    activateScripts(document.body);
    runClientEnhancements(document);
  };

  const swapPageContent = (nextDocument) => {
    const sharedRoots = getSharedContentRoots(nextDocument);

    if (!sharedRoots) {
      return false;
    }

    document.title = nextDocument.title;
    copyAttributes(nextDocument.body, document.body);
    sharedRoots.currentRoot.replaceWith(sharedRoots.nextRoot);
    activateScripts(sharedRoots.nextRoot);
    runClientEnhancements(sharedRoots.nextRoot);
    return true;
  };

  const runSwapTransition = async (swapOperation) => {
    if (typeof document.startViewTransition === "function") {
      const transition = document.startViewTransition(() => {
        swapOperation();
      });

      try {
        await transition.finished;
      } catch {
        return;
      }

      return;
    }

    swapOperation();
  };

  const fetchAndSwap = async (url, options = {}) => {
    if (!isLiveNavigationEnabled()) {
      window.location.assign(url);
      return;
    }

    const {
      preserveScroll = false,
      targetSelector = null,
      triggerEl = null,
      historyMode = "push",
    } = options;
    const shouldUsePremiumLoader = !targetSelector && typeof window.__bilgeShowPageLoader === "function";

    const currentTarget = targetSelector ? document.querySelector(targetSelector) : null;
    const currentTargetTop = currentTarget?.getBoundingClientRect().top ?? null;

    if (targetSelector && !currentTarget) {
      window.location.assign(url);
      return;
    }

    const previousBusy = triggerEl?.getAttribute("aria-busy");
    const currentScrollY = window.scrollY;

    try {
      if (triggerEl) {
        triggerEl.setAttribute("aria-busy", "true");
      }

      if (shouldUsePremiumLoader) {
        window.__bilgeShowPageLoader();
      }

      const response = await fetch(url, {
        headers: {
          "X-Requested-With": "fetch",
        },
      });

      if (!response.ok || !isHtmlResponse(response)) {
        window.location.assign(url);
        return;
      }

      const html = await response.text();
      const nextDocument = parser.parseFromString(html, "text/html");

      await runSwapTransition(() => {
        if (targetSelector) {
          const nextTarget = nextDocument.querySelector(targetSelector);

          if (!nextTarget) {
            window.location.assign(url);
            return;
          }

          currentTarget.replaceWith(nextTarget);

          const nextTitle = nextDocument.querySelector("title");
          if (nextTitle) {
            document.title = nextTitle.textContent;
          }

          activateScripts(nextTarget);
          runClientEnhancements(nextTarget);

          if (currentTargetTop !== null) {
            const nextTargetTop = nextTarget.getBoundingClientRect().top;
            const scrollAdjustment = nextTargetTop - currentTargetTop;

            if (scrollAdjustment !== 0) {
              window.scrollBy({
                top: scrollAdjustment,
                behavior: "auto",
              });
            }
          }

          return;
        }

        const sameHeadSignature =
          getHeadSignature(document) === getHeadSignature(nextDocument);

        if (sameHeadSignature && swapPageContent(nextDocument)) {
          return;
        }

        swapWholePage(nextDocument);
      });

      if (historyMode === "replace") {
        window.history.replaceState({ liveUrl: url }, "", url);
      } else if (window.location.href !== url) {
        window.history.pushState({ liveUrl: url }, "", url);
      }

      const nextUrl = new URL(url, window.location.origin);

      if (targetSelector) {
        return;
      }

      if (nextUrl.hash) {
        const targetEl = document.getElementById(nextUrl.hash.slice(1));
        if (targetEl) {
          targetEl.scrollIntoView({ block: "start" });
          return;
        }
      }

      window.scrollTo({
        top: preserveScroll ? currentScrollY : 0,
        behavior: "auto",
      });
    } catch {
      window.location.assign(url);
    } finally {
      if (triggerEl) {
        if (previousBusy === null) {
          triggerEl.removeAttribute("aria-busy");
        } else {
          triggerEl.setAttribute("aria-busy", previousBusy);
        }
      }

      if (shouldUsePremiumLoader && typeof window.__bilgeHidePageLoader === "function") {
        window.__bilgeHidePageLoader();
      }
    }
  };

  const submitLiveForm = (form) => {
    const action = form.getAttribute("action") || window.location.pathname;
    const method = String(form.getAttribute("method") || "GET").toUpperCase();
    const targetSelector = form.dataset.liveTarget || null;

    if (method !== "GET" || form.hasAttribute("data-no-live")) {
      return;
    }

    if (!isLiveNavigationEnabled()) {
      form.requestSubmit ? form.requestSubmit() : form.submit();
      return;
    }

    const formData = new FormData(form);
    const searchParams = new URLSearchParams();

    for (const [key, value] of formData.entries()) {
      if (typeof value !== "string") continue;
      searchParams.append(key, value);
    }

    const nextUrl = new URL(action, window.location.origin);
    nextUrl.search = searchParams.toString();

    fetchAndSwap(nextUrl.toString(), {
      preserveScroll: true,
      targetSelector,
      triggerEl: form,
    });
  };

  document.addEventListener("submit", (event) => {
    const form = event.target.closest('form[method="GET"]');

    if (!form) {
      return;
    }

    if (!isLiveNavigationEnabled()) {
      return;
    }

    event.preventDefault();
    submitLiveForm(form);
  });

  document.addEventListener("change", (event) => {
    const form = event.target.closest('form[data-live-auto-submit="change"][method="GET"]');

    if (!form || !(event.target instanceof HTMLSelectElement)) {
      return;
    }

    if (!isLiveNavigationEnabled()) {
      form.requestSubmit ? form.requestSubmit() : form.submit();
      return;
    }

    submitLiveForm(form);
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");

    if (!link || isModifiedClick(event)) {
      return;
    }

    const href = link.getAttribute("href");
    const targetSelector = link.dataset.liveTarget || null;

    if (
      !href ||
      link.hasAttribute("data-no-live") ||
      link.hasAttribute("download") ||
      (link.target && link.target !== "_self") ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("javascript:")
    ) {
      return;
    }

    if (!isLiveNavigationEnabled()) {
      return;
    }

    const nextUrl = new URL(href, window.location.origin);

    if (
      nextUrl.origin !== window.location.origin ||
      nextUrl.pathname.endsWith("/pdf") ||
      nextUrl.searchParams.get("download") === "1"
    ) {
      return;
    }

    event.preventDefault();
    fetchAndSwap(nextUrl.toString(), {
      preserveScroll:
        nextUrl.pathname === window.location.pathname &&
        nextUrl.search !== window.location.search,
      targetSelector,
      triggerEl: link,
    });
  });

  window.addEventListener("popstate", () => {
    if (!isLiveNavigationEnabled()) {
      window.location.assign(window.location.href);
      return;
    }

    fetchAndSwap(window.location.href, {
      preserveScroll: false,
      historyMode: "replace",
    });
  });

  window.history.replaceState({ liveUrl: window.location.href }, "", window.location.href);
  runClientEnhancements(document);
})();
