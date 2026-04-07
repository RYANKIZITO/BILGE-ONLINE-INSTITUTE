const HEADER_TOP_OFFSET = 24;
const HEADER_SCROLL_TOLERANCE = 10;
const MOBILE_NAV_BREAKPOINT = window.matchMedia("(max-width: 980px)");

document.addEventListener("DOMContentLoaded", () => {
  const siteHeader = document.querySelector("[data-site-header]");
  const navToggle = document.querySelector("[data-nav-toggle]");
  const navPanel = document.querySelector("[data-nav-panel]");

  if (!siteHeader) {
    return;
  }

  let lastScrollY = window.scrollY;
  let ticking = false;

  const setNavOpen = (isOpen) => {
    if (!navToggle || !navPanel) {
      return;
    }

    const nextState = isOpen && MOBILE_NAV_BREAKPOINT.matches;
    siteHeader.dataset.navOpen = nextState ? "true" : "false";
    navToggle.setAttribute("aria-expanded", nextState ? "true" : "false");
    navToggle.setAttribute("aria-label", nextState ? "Close navigation" : "Open navigation");

    if (nextState) {
      siteHeader.classList.remove("site-header--hidden");
    }
  };

  const syncHeaderVisibility = () => {
    const currentScrollY = window.scrollY;
    const scrollDelta = currentScrollY - lastScrollY;

    if (siteHeader.dataset.navOpen === "true") {
      siteHeader.classList.remove("site-header--hidden");
      lastScrollY = currentScrollY;
      ticking = false;
      return;
    }

    if (currentScrollY <= HEADER_TOP_OFFSET) {
      siteHeader.classList.remove("site-header--hidden");
      lastScrollY = currentScrollY;
      ticking = false;
      return;
    }

    if (Math.abs(scrollDelta) < HEADER_SCROLL_TOLERANCE) {
      ticking = false;
      return;
    }

    if (scrollDelta > 0) {
      siteHeader.classList.add("site-header--hidden");
    } else {
      siteHeader.classList.remove("site-header--hidden");
    }

    lastScrollY = currentScrollY;
    ticking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (ticking) {
        return;
      }

      ticking = true;
      window.requestAnimationFrame(syncHeaderVisibility);
    },
    { passive: true }
  );

  if (navToggle && navPanel) {
    setNavOpen(false);

    navToggle.addEventListener("click", () => {
      setNavOpen(siteHeader.dataset.navOpen !== "true");
    });

    navPanel.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        setNavOpen(false);
      });
    });

    MOBILE_NAV_BREAKPOINT.addEventListener("change", (event) => {
      if (!event.matches) {
        setNavOpen(false);
      }
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setNavOpen(false);
      }
    });
  }

  window.addEventListener("focus", () => {
    siteHeader.classList.remove("site-header--hidden");
  });
});
