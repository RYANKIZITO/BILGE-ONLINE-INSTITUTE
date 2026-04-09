const HEADER_TOP_OFFSET = 24;
const HEADER_SCROLL_TOLERANCE = 10;
const MOBILE_NAV_BREAKPOINT = window.matchMedia("(max-width: 980px)");

const getScopedElement = (root, selector) => {
  if (root && typeof root.querySelector === "function") {
    return root.querySelector(selector);
  }

  return document.querySelector(selector);
};

const initializeWebsiteHeader = (root = document) => {
  const siteHeader = getScopedElement(root, "[data-site-header]") || document.querySelector("[data-site-header]");
  const navToggle = siteHeader?.querySelector("[data-nav-toggle]") || null;
  const navPanel = siteHeader?.querySelector("[data-nav-panel]") || null;

  if (!siteHeader) {
    return;
  }

  if (typeof window.__cleanupBilgeWebsiteHeader === "function") {
    window.__cleanupBilgeWebsiteHeader();
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

  const onScroll = () => {
    if (ticking) {
      return;
    }

    ticking = true;
    window.requestAnimationFrame(syncHeaderVisibility);
  };

  window.addEventListener(
    "scroll",
    onScroll,
    { passive: true }
  );

  const navLinkHandlers = [];

  if (navToggle && navPanel) {
    setNavOpen(false);

    const handleToggleClick = () => {
      setNavOpen(siteHeader.dataset.navOpen !== "true");
    };

    navToggle.addEventListener("click", handleToggleClick);

    navPanel.querySelectorAll("a").forEach((link) => {
      const handleNavLinkClick = () => {
        setNavOpen(false);
      };

      navLinkHandlers.push({ link, handleNavLinkClick });
      link.addEventListener("click", handleNavLinkClick);
    });

    const handleBreakpointChange = (event) => {
      if (!event.matches) {
        setNavOpen(false);
      }
    };

    MOBILE_NAV_BREAKPOINT.addEventListener("change", handleBreakpointChange);

    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        setNavOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeydown);

    const handleFocus = () => {
      siteHeader.classList.remove("site-header--hidden");
    };

    window.addEventListener("focus", handleFocus);

    window.__cleanupBilgeWebsiteHeader = () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("focus", handleFocus);
      navToggle.removeEventListener("click", handleToggleClick);
      MOBILE_NAV_BREAKPOINT.removeEventListener("change", handleBreakpointChange);

      navLinkHandlers.forEach(({ link, handleNavLinkClick }) => {
        link.removeEventListener("click", handleNavLinkClick);
      });
    };

    syncHeaderVisibility();
    return;
  }

  const handleFocus = () => {
    siteHeader.classList.remove("site-header--hidden");
  };

  window.addEventListener("focus", handleFocus);
  window.__cleanupBilgeWebsiteHeader = () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("focus", handleFocus);
  };

  syncHeaderVisibility();
};

window.__runBilgeWebsiteHeaderEnhancements = initializeWebsiteHeader;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initializeWebsiteHeader(document), {
    once: true,
  });
} else {
  initializeWebsiteHeader(document);
}
