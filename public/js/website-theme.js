const WEBSITE_THEME_KEY = "bilge-website-theme";
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

const applyTheme = (theme, persist = false) => {
  const nextTheme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", nextTheme);
  document.documentElement.style.colorScheme = nextTheme;

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

document.addEventListener("DOMContentLoaded", () => {
  applyTheme(resolveTheme(), false);

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
      applyTheme(currentTheme === "dark" ? "light" : "dark", true);
    });
  });
});

prefersLightScheme.addEventListener("change", (event) => {
  if (readStoredTheme()) {
    return;
  }

  applyTheme(event.matches ? "light" : "dark", false);
});
