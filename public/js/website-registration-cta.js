(function () {
  const CTA_DELAY_MS = 10000;
  const popup = document.querySelector("[data-registration-cta-popup]");

  if (!popup) {
    return;
  }

  const closeButton = popup.querySelector("[data-registration-cta-close]");
  let popupTimer = null;
  let isDismissed = false;

  const showPopup = () => {
    if (isDismissed) {
      return;
    }

    popup.hidden = false;
    window.requestAnimationFrame(() => {
      popup.classList.add("is-visible");
    });
  };

  const closePopup = () => {
    isDismissed = true;
    popup.classList.remove("is-visible");

    window.setTimeout(() => {
      popup.hidden = true;
    }, 220);

    if (popupTimer) {
      window.clearTimeout(popupTimer);
      popupTimer = null;
    }
  };

  popupTimer = window.setTimeout(showPopup, CTA_DELAY_MS);

  closeButton?.addEventListener("click", closePopup);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !popup.hidden) {
      closePopup();
    }
  });
})();
