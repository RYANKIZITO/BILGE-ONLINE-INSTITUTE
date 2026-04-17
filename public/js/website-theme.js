(function () {
const WEBSITE_THEME_KEY = "bilge-website-theme";
const WEBSITE_THEME_API_ENDPOINT = "/preferences/theme";
const prefersLightScheme = window.matchMedia("(prefers-color-scheme: light)");

const readStoredTheme = () => {
  try {
    const storedTheme = window.localStorage.getItem(WEBSITE_THEME_KEY);
    return storedTheme === "light" || storedTheme === "dark" ? storedTheme : null;
  } catch {
    return null;
  }
};

const resolveTheme = () => readStoredTheme() || (prefersLightScheme.matches ? "light" : "dark");

const syncBodyTheme = (theme) => {
  if (!document.body) {
    return;
  }

  document.body.classList.remove("theme-light", "theme-dark");
  document.body.classList.add(`theme-${theme}`);
};

const applyTheme = (theme, persist = false) => {
  const nextTheme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", nextTheme);
  document.documentElement.style.colorScheme = nextTheme;
  syncBodyTheme(nextTheme);

  if (persist) {
    try {
      window.localStorage.setItem(WEBSITE_THEME_KEY, nextTheme);
    } catch {
      /* Ignore storage failures and keep the visual theme applied. */
    }
  }

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const nextLabel =
      nextTheme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    button.setAttribute("aria-label", nextLabel);
    button.setAttribute("aria-pressed", nextTheme === "dark" ? "true" : "false");
  });

  document.querySelectorAll("[data-theme-current]").forEach((element) => {
    element.textContent = nextTheme === "dark" ? "Dark" : "Light";
  });
};

const persistThemePreference = async (theme) => {
  if (!window.__bilgeThemeUserAuthenticated) {
    return;
  }

  const body = JSON.stringify({
    themePreference: theme === "light" ? "light" : "dark",
  });

  await Promise.race([
    window.fetch(WEBSITE_THEME_API_ENDPOINT, {
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
    }),
    new Promise((resolve) => {
      window.setTimeout(resolve, 320);
    }),
  ]);
};

const reloadCurrentPageForTheme = () => {
  if (typeof window.__bilgeShowPageLoader === "function") {
    window.__bilgeShowPageLoader();
  }

  window.setTimeout(() => {
    window.location.replace(window.location.href);
  }, 40);
};

const initializeThemeControls = (root) => {
  const scope = root && root.querySelectorAll ? root : document;

  applyTheme(resolveTheme(), false);

  scope.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    if (button.dataset.bilgeThemeBound === "true") {
      return;
    }

    button.dataset.bilgeThemeBound = "true";
    button.addEventListener("click", async () => {
      const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      applyTheme(nextTheme, true);
      await persistThemePreference(nextTheme);
      reloadCurrentPageForTheme();
    });
  });
};

window.__runBilgeThemeEnhancements = initializeThemeControls;
initializeThemeControls(document);

if (!window.__bilgeThemeSystemListenerBound) {
  window.__bilgeThemeSystemListenerBound = true;
  prefersLightScheme.addEventListener("change", (event) => {
    if (readStoredTheme()) {
      return;
    }

    applyTheme(event.matches ? "light" : "dark", false);
  });
}
})();
