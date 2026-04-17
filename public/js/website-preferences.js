(function () {
const WEBSITE_LANGUAGE_KEY = "bilge-language-preference";
const WEBSITE_LEGACY_LANGUAGE_KEY = "bilge-website-language";
const WEBSITE_SOURCE_LANGUAGE = "en";
const WEBSITE_LANGUAGE_RELOAD_GUARD_KEY = "bilge-language-reload";
const WEBSITE_LANGUAGE_QUERY_KEY = "__bilge_lang";
const WEBSITE_LANGUAGE_FORM_KEY = "languagePreference";
const WEBSITE_LANGUAGE_API_ENDPOINT = "/preferences/language";

const LANGUAGE_OPTIONS = [
  { code: "af", label: "Afrikaans" },
  { code: "am", label: "Amharic" },
  { code: "ar", label: "Arabic" },
  { code: "az", label: "Azerbaijani" },
  { code: "be", label: "Belarusian" },
  { code: "bg", label: "Bulgarian" },
  { code: "bn", label: "Bengali" },
  { code: "bs", label: "Bosnian" },
  { code: "ca", label: "Catalan" },
  { code: "cs", label: "Czech" },
  { code: "cy", label: "Welsh" },
  { code: "da", label: "Danish" },
  { code: "de", label: "German" },
  { code: "el", label: "Greek" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "et", label: "Estonian" },
  { code: "fa", label: "Persian" },
  { code: "fi", label: "Finnish" },
  { code: "fil", label: "Filipino" },
  { code: "fr", label: "French" },
  { code: "ga", label: "Irish" },
  { code: "gu", label: "Gujarati" },
  { code: "ha", label: "Hausa" },
  { code: "he", label: "Hebrew" },
  { code: "hi", label: "Hindi" },
  { code: "hr", label: "Croatian" },
  { code: "hu", label: "Hungarian" },
  { code: "hy", label: "Armenian" },
  { code: "id", label: "Indonesian" },
  { code: "ig", label: "Igbo" },
  { code: "is", label: "Icelandic" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "ka", label: "Georgian" },
  { code: "kk", label: "Kazakh" },
  { code: "km", label: "Khmer" },
  { code: "ko", label: "Korean" },
  { code: "lo", label: "Lao" },
  { code: "lt", label: "Lithuanian" },
  { code: "lv", label: "Latvian" },
  { code: "mk", label: "Macedonian" },
  { code: "ml", label: "Malayalam" },
  { code: "mn", label: "Mongolian" },
  { code: "mr", label: "Marathi" },
  { code: "ms", label: "Malay" },
  { code: "mt", label: "Maltese" },
  { code: "my", label: "Burmese" },
  { code: "ne", label: "Nepali" },
  { code: "nl", label: "Dutch" },
  { code: "no", label: "Norwegian" },
  { code: "pa", label: "Punjabi" },
  { code: "pl", label: "Polish" },
  { code: "pt", label: "Portuguese" },
  { code: "ro", label: "Romanian" },
  { code: "ru", label: "Russian" },
  { code: "si", label: "Sinhala" },
  { code: "sk", label: "Slovak" },
  { code: "sl", label: "Slovenian" },
  { code: "so", label: "Somali" },
  { code: "sq", label: "Albanian" },
  { code: "sr", label: "Serbian" },
  { code: "sv", label: "Swedish" },
  { code: "sw", label: "Swahili" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "th", label: "Thai" },
  { code: "tr", label: "Turkish" },
  { code: "uk", label: "Ukrainian" },
  { code: "ur", label: "Urdu" },
  { code: "uz", label: "Uzbek" },
  { code: "vi", label: "Vietnamese" },
  { code: "xh", label: "Xhosa" },
  { code: "yo", label: "Yoruba" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "zh-TW", label: "Chinese (Traditional)" },
  { code: "zu", label: "Zulu" },
];

const GOOGLE_TRANSLATE_COOKIE = "googtrans";
const LANGUAGE_CODE_LOOKUP = new Map(
  LANGUAGE_OPTIONS.map((option) => [String(option.code).toLowerCase(), option.code])
);

let pendingLanguageCode = null;
let translateRetryTimer = null;
let translateObserver = null;
let translateInitTimer = null;
let translateElementInitialized = false;
let lastLanguageDockScrollTop = 0;

const normalizeLanguageCode = (languageCode) => {
  const normalized = String(languageCode || "").trim();
  if (!normalized) {
    return WEBSITE_SOURCE_LANGUAGE;
  }

  const exactMatch = LANGUAGE_CODE_LOOKUP.get(normalized.toLowerCase());
  if (exactMatch) {
    return exactMatch;
  }

  const baseMatch = LANGUAGE_CODE_LOOKUP.get(normalized.split("-")[0]?.toLowerCase());
  return baseMatch || WEBSITE_SOURCE_LANGUAGE;
};

const buildReloadGuardValue = (languageCode) =>
  `${languageCode || WEBSITE_SOURCE_LANGUAGE}:${window.location.pathname}${window.location.search}${window.location.hash}`;

const readStoredLanguage = () => {
  try {
    return (
      window.localStorage.getItem(WEBSITE_LANGUAGE_KEY) ||
      window.localStorage.getItem(WEBSITE_LEGACY_LANGUAGE_KEY) ||
      null
    );
  } catch {
    return null;
  }
};

const writeStoredLanguage = (languageCode) => {
  try {
    const resolvedLanguage = normalizeLanguageCode(languageCode);
    window.localStorage.setItem(WEBSITE_LANGUAGE_KEY, resolvedLanguage);
    window.localStorage.setItem(WEBSITE_LEGACY_LANGUAGE_KEY, resolvedLanguage);
  } catch {
    /* Ignore storage failures and keep the language preference applied. */
  }
};

const getCookieDomain = () => {
  const hostname = window.location.hostname;
  if (!hostname || hostname === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return "";
  }

  return `;domain=.${hostname}`;
};

const setTranslationCookie = (languageCode) => {
  const targetLanguage = normalizeLanguageCode(languageCode || WEBSITE_SOURCE_LANGUAGE);
  const cookieValue = `/${WEBSITE_SOURCE_LANGUAGE}/${targetLanguage}`;
  const baseCookie = `${GOOGLE_TRANSLATE_COOKIE}=${cookieValue};path=/;max-age=31536000;SameSite=Lax`;
  document.cookie = baseCookie;
  document.cookie = `${baseCookie}${getCookieDomain()}`;
};

const clearTranslationCookie = () => {
  const expired = `${GOOGLE_TRANSLATE_COOKIE}=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT;SameSite=Lax`;
  document.cookie = expired;
  document.cookie = `${expired}${getCookieDomain()}`;
};

const resolveLanguage = () => {
  const queryLanguage = new URLSearchParams(window.location.search).get(WEBSITE_LANGUAGE_QUERY_KEY);
  if (queryLanguage) {
    return normalizeLanguageCode(queryLanguage);
  }

  if (window.__bilgeServerLanguagePreference) {
    return normalizeLanguageCode(window.__bilgeServerLanguagePreference);
  }

  if (window.__bilgePreferredLanguage) {
    return normalizeLanguageCode(window.__bilgePreferredLanguage);
  }

  const storedLanguage = readStoredLanguage();
  if (storedLanguage) {
    return normalizeLanguageCode(storedLanguage);
  }

  const browserLanguage = (navigator.language || WEBSITE_SOURCE_LANGUAGE).toLowerCase();
  const exactMatch = LANGUAGE_OPTIONS.find((option) => option.code.toLowerCase() === browserLanguage);
  if (exactMatch) {
    return exactMatch.code;
  }

  const baseMatch = LANGUAGE_OPTIONS.find((option) => option.code === browserLanguage.split("-")[0]);
  return baseMatch?.code || WEBSITE_SOURCE_LANGUAGE;
};

const buildLanguageOptions = (select, selectedLanguage) => {
  select.innerHTML = "";

  LANGUAGE_OPTIONS.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.code;
    element.textContent = option.label;
    element.selected = option.code === selectedLanguage;
    select.appendChild(element);
  });
};

const syncVisibleSelectors = (languageCode) => {
  const resolvedLanguage = normalizeLanguageCode(languageCode);
  document.querySelectorAll("[data-language-select]").forEach((select) => {
    if (!Array.from(select.options).some((option) => option.value === resolvedLanguage)) {
      buildLanguageOptions(select, resolvedLanguage);
    } else {
      select.value = resolvedLanguage;
    }
  });
};

const syncLanguagePreferenceInputs = (languageCode) => {
  const resolvedLanguage = normalizeLanguageCode(languageCode);
  document.querySelectorAll("form").forEach((form) => {
    const method = String(form.getAttribute("method") || "get").toLowerCase();
    if (method !== "post") {
      return;
    }

    let hiddenInput = form.querySelector(`input[name="${WEBSITE_LANGUAGE_FORM_KEY}"]`);
    if (!hiddenInput) {
      hiddenInput = document.createElement("input");
      hiddenInput.type = "hidden";
      hiddenInput.name = WEBSITE_LANGUAGE_FORM_KEY;
      form.appendChild(hiddenInput);
    }

    hiddenInput.value = resolvedLanguage;
  });
};

const syncAuthProviderLinks = (languageCode) => {
  const resolvedLanguage = normalizeLanguageCode(languageCode);
  document.querySelectorAll('a[href^="/auth/google"], a[href^="/auth/apple"]').forEach((link) => {
    try {
      const targetUrl = new URL(link.getAttribute("href"), window.location.origin);
      targetUrl.searchParams.set(WEBSITE_LANGUAGE_FORM_KEY, resolvedLanguage);
      link.href = targetUrl.toString();
    } catch {
      /* Ignore malformed auth provider links. */
    }
  });
};

const syncLanguageDockScrollState = () => {
  const languageDock = document.querySelector("[data-bilge-language-dock]");
  if (!languageDock) {
    return;
  }

  const currentScrollTop = Math.max(window.scrollY || 0, 0);
  const isNearTop = currentScrollTop <= 24;
  const isScrollingDown = currentScrollTop > lastLanguageDockScrollTop + 8;
  const isScrollingUp = currentScrollTop < lastLanguageDockScrollTop - 8;

  if (isNearTop || isScrollingUp) {
    languageDock.classList.remove("is-hidden");
  } else if (isScrollingDown) {
    languageDock.classList.add("is-hidden");
  }

  lastLanguageDockScrollTop = currentScrollTop;
};

const updateDocumentLanguage = (languageCode) => {
  document.documentElement.setAttribute("lang", normalizeLanguageCode(languageCode));
};

const isTranslationApplied = () =>
  document.documentElement.classList.contains("translated-ltr") ||
  document.documentElement.classList.contains("translated-rtl") ||
  document.body?.classList.contains("translated-ltr") ||
  document.body?.classList.contains("translated-rtl");

const readReloadGuard = () => {
  try {
    return window.sessionStorage.getItem(WEBSITE_LANGUAGE_RELOAD_GUARD_KEY);
  } catch {
    return null;
  }
};

const writeReloadGuard = (languageCode) => {
  try {
    window.sessionStorage.setItem(
      WEBSITE_LANGUAGE_RELOAD_GUARD_KEY,
      buildReloadGuardValue(normalizeLanguageCode(languageCode))
    );
  } catch {
    /* Ignore storage failures for reload guard support. */
  }
};

const clearReloadGuard = () => {
  try {
    window.sessionStorage.removeItem(WEBSITE_LANGUAGE_RELOAD_GUARD_KEY);
  } catch {
    /* Ignore storage failures for reload guard support. */
  }
};

const buildLanguageNavigationUrl = (languageCode) => {
  const targetUrl = new URL(window.location.href);
  targetUrl.searchParams.set(
    WEBSITE_LANGUAGE_QUERY_KEY,
    normalizeLanguageCode(languageCode)
  );
  return targetUrl.toString();
};

const reloadCurrentPageForLanguage = (languageCode) => {
  writeReloadGuard(languageCode);

  if (typeof window.__bilgeShowPageLoader === "function") {
    window.__bilgeShowPageLoader();
  }

  window.setTimeout(() => {
    window.location.replace(buildLanguageNavigationUrl(languageCode));
  }, 40);
};

const cleanupLanguageNavigationUrl = () => {
  const currentUrl = new URL(window.location.href);
  if (!currentUrl.searchParams.has(WEBSITE_LANGUAGE_QUERY_KEY)) {
    return;
  }

  currentUrl.searchParams.delete(WEBSITE_LANGUAGE_QUERY_KEY);
  window.history.replaceState({}, document.title, currentUrl.toString());
};

const triggerGoogleTranslate = (languageCode) => {
  const googleSelect = document.querySelector(".goog-te-combo");
  if (!googleSelect || !googleSelect.options || googleSelect.options.length === 0) {
    return false;
  }

  const targetLanguage = normalizeLanguageCode(languageCode);
  const matchingOption = Array.from(googleSelect.options).find(
    (option) => String(option.value).toLowerCase() === String(targetLanguage).toLowerCase()
  );

  googleSelect.value = matchingOption ? matchingOption.value : targetLanguage;
  googleSelect.dispatchEvent(new Event("change", { bubbles: true }));
  googleSelect.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
};

const clearTranslateRetry = () => {
  if (translateRetryTimer) {
    window.clearInterval(translateRetryTimer);
    translateRetryTimer = null;
  }
};

const clearTranslateObserver = () => {
  if (translateObserver) {
    translateObserver.disconnect();
    translateObserver = null;
  }
};

const clearTranslateInitTimer = () => {
  if (translateInitTimer) {
    window.clearInterval(translateInitTimer);
    translateInitTimer = null;
  }
};

const queueGoogleTranslateRetry = () => {
  if (translateRetryTimer) {
    return;
  }

  let attempts = 0;
  translateRetryTimer = window.setInterval(() => {
    attempts += 1;

    if (!pendingLanguageCode) {
      clearTranslateRetry();
      return;
    }

    if (triggerGoogleTranslate(pendingLanguageCode)) {
      pendingLanguageCode = null;
      clearTranslateRetry();
      return;
    }

    if (attempts >= 20) {
      clearTranslateRetry();
    }
  }, 250);
};

const watchForGoogleTranslate = () => {
  if (translateObserver) {
    return;
  }

  translateObserver = new MutationObserver(() => {
    if (!pendingLanguageCode) {
      clearTranslateObserver();
      return;
    }

    if (triggerGoogleTranslate(pendingLanguageCode)) {
      pendingLanguageCode = null;
      clearTranslateRetry();
      clearTranslateObserver();
    }
  });

  translateObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
};

const finishGoogleTranslateInitialization = () => {
  const preferredLanguage = resolveLanguage();
  updateDocumentLanguage(preferredLanguage);
  pendingLanguageCode = preferredLanguage;

  window.setTimeout(() => {
    if (triggerGoogleTranslate(preferredLanguage)) {
      pendingLanguageCode = null;
      clearTranslateRetry();
      clearTranslateObserver();
      if (preferredLanguage === WEBSITE_SOURCE_LANGUAGE || isTranslationApplied()) {
        clearReloadGuard();
      }
      return;
    }

    watchForGoogleTranslate();
    queueGoogleTranslateRetry();
  }, 450);
};

const ensureLanguagePersistence = (languageCode) => {
  const nextLanguage = normalizeLanguageCode(languageCode);
  const guardValue = buildReloadGuardValue(nextLanguage);

  if (nextLanguage === WEBSITE_SOURCE_LANGUAGE) {
    clearReloadGuard();
    return;
  }

  window.setTimeout(() => {
    if (isTranslationApplied()) {
      clearReloadGuard();
      return;
    }

    if (triggerGoogleTranslate(nextLanguage)) {
      window.setTimeout(() => {
        if (isTranslationApplied()) {
          clearReloadGuard();
          return;
        }

        if (readReloadGuard() !== guardValue) {
          reloadCurrentPageForLanguage(nextLanguage);
        }
      }, 700);
      return;
    }

    if (readReloadGuard() !== guardValue) {
      reloadCurrentPageForLanguage(nextLanguage);
    }
  }, 1200);
};

const persistLanguagePreference = (languageCode) => {
  if (!window.__bilgeLanguageUserAuthenticated) {
    return;
  }

  const body = JSON.stringify({
    languagePreference: normalizeLanguageCode(languageCode),
  });

  if (typeof navigator.sendBeacon === "function") {
    try {
      const payload = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(WEBSITE_LANGUAGE_API_ENDPOINT, payload)) {
        return;
      }
    } catch {
      /* Fall back to fetch when sendBeacon is not available. */
    }
  }

  window.fetch(WEBSITE_LANGUAGE_API_ENDPOINT, {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body,
  }).catch(() => {
    /* Ignore network errors and keep the client preference applied locally. */
  });
};

const applyLanguage = (languageCode, { persist = false } = {}) => {
  const nextLanguage = normalizeLanguageCode(languageCode);
  updateDocumentLanguage(nextLanguage);
  syncVisibleSelectors(nextLanguage);
  syncLanguagePreferenceInputs(nextLanguage);
  syncAuthProviderLinks(nextLanguage);
  window.__bilgePreferredLanguage = nextLanguage;

  if (persist) {
    writeStoredLanguage(nextLanguage);
  }

  if (nextLanguage === WEBSITE_SOURCE_LANGUAGE) {
    clearTranslationCookie();
  } else {
    setTranslationCookie(nextLanguage);
  }

  pendingLanguageCode = nextLanguage;

  if (triggerGoogleTranslate(nextLanguage)) {
    pendingLanguageCode = null;
    clearTranslateRetry();
    clearTranslateObserver();
    return;
  }

  watchForGoogleTranslate();
  queueGoogleTranslateRetry();
};

const initializeGoogleTranslate = () => {
  if (translateElementInitialized || !window.google?.translate?.TranslateElement) {
    return;
  }

  const translateAnchor = document.getElementById("google_translate_element");
  if (!translateAnchor) {
    if (translateInitTimer) {
      return;
    }

    translateInitTimer = window.setInterval(() => {
      if (!window.google?.translate?.TranslateElement) {
        return;
      }

      if (document.getElementById("google_translate_element")) {
        clearTranslateInitTimer();
        initializeGoogleTranslate();
      }
    }, 100);
    return;
  }

  const includedLanguages = LANGUAGE_OPTIONS.map((option) => option.code).join(",");

  new window.google.translate.TranslateElement(
    {
      pageLanguage: WEBSITE_SOURCE_LANGUAGE,
      includedLanguages,
      autoDisplay: false,
      layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE,
    },
    "google_translate_element"
  );
  translateElementInitialized = true;
  finishGoogleTranslateInitialization();
};

window.googleTranslateElementInit = initializeGoogleTranslate;

const bindLanguageDock = (root) => {
  const scope = root && root.querySelectorAll ? root : document;

  scope.querySelectorAll("[data-bilge-language-dock]").forEach((languageDock) => {
    if (languageDock.dataset.bilgeLanguageDockBound === "true") {
      return;
    }

    languageDock.dataset.bilgeLanguageDockBound = "true";
    languageDock.addEventListener("focusin", () => {
      languageDock.classList.remove("is-hidden");
    });
  });
};

const bindLanguageSelects = (root, currentLanguage) => {
  const scope = root && root.querySelectorAll ? root : document;

  scope.querySelectorAll("[data-language-select]").forEach((select) => {
    buildLanguageOptions(select, currentLanguage);

    if (select.dataset.bilgeLanguageBound === "true") {
      return;
    }

    select.dataset.bilgeLanguageBound = "true";
    select.addEventListener("change", (event) => {
      const nextLanguage = normalizeLanguageCode(event.target.value);
      const activeLanguage = normalizeLanguageCode(
        window.__bilgePreferredLanguage || resolveLanguage()
      );

      if (nextLanguage === activeLanguage) {
        syncVisibleSelectors(activeLanguage);
        return;
      }

      applyLanguage(nextLanguage, { persist: true });
      persistLanguagePreference(nextLanguage);
      reloadCurrentPageForLanguage(nextLanguage);
    });
  });
};

const initializeLanguagePreferences = (root) => {
  const currentLanguage = resolveLanguage();
  writeStoredLanguage(currentLanguage);
  cleanupLanguageNavigationUrl();
  lastLanguageDockScrollTop = Math.max(window.scrollY || 0, 0);
  syncLanguageDockScrollState();

  if (!window.__bilgeLanguageScrollBound) {
    window.__bilgeLanguageScrollBound = true;
    window.addEventListener("scroll", syncLanguageDockScrollState, { passive: true });
  }

  bindLanguageDock(root || document);
  bindLanguageSelects(root || document, currentLanguage);

  updateDocumentLanguage(currentLanguage);
  syncLanguagePreferenceInputs(currentLanguage);
  syncAuthProviderLinks(currentLanguage);

  if (currentLanguage === WEBSITE_SOURCE_LANGUAGE) {
    clearTranslationCookie();
  } else {
    setTranslationCookie(currentLanguage);
  }

  applyLanguage(currentLanguage, { persist: true });

  if (window.google?.translate?.TranslateElement) {
    initializeGoogleTranslate();
  }
};

window.__runBilgeLanguageEnhancements = initializeLanguagePreferences;
initializeLanguagePreferences(document);
})();
