(function () {
  const LOCAL_FORMATS = {
    session: {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    },
    sessionCompact: {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    },
    sessionWithDate: {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    },
  };

  const parseDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const formatDate = (date, formatName) => {
    const options = LOCAL_FORMATS[formatName] || LOCAL_FORMATS.sessionCompact;
    return new Intl.DateTimeFormat(undefined, options).format(date);
  };

  const applyLocalDateTimes = (root) => {
    const scope = root && root.querySelectorAll ? root : document;

    scope.querySelectorAll("[data-local-datetime]").forEach((element) => {
      const isoValue = element.getAttribute("data-local-datetime");
      const date = parseDate(isoValue);

      if (!date) {
        return;
      }

      const formatName = element.getAttribute("data-local-format") || "sessionCompact";
      const fallbackText =
        element.getAttribute("data-local-fallback") || element.textContent || "";

      if (!element.dataset.localOriginalText) {
        element.dataset.localOriginalText = fallbackText;
      }

      element.textContent = formatDate(date, formatName);
      element.setAttribute("datetime", date.toISOString());
      element.setAttribute("title", date.toISOString());
    });
  };

  const isTomorrowLocal = (date, now = new Date()) => {
    const tomorrowStart = new Date(now);
    tomorrowStart.setHours(0, 0, 0, 0);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const dayAfterTomorrowStart = new Date(tomorrowStart);
    dayAfterTomorrowStart.setDate(dayAfterTomorrowStart.getDate() + 1);

    return date >= tomorrowStart && date < dayAfterTomorrowStart;
  };

  const applyTomorrowSessionFilters = (root) => {
    const scope = root && root.querySelectorAll ? root : document;

    scope.querySelectorAll("[data-live-tomorrow-section]").forEach((section) => {
      const items = Array.from(section.querySelectorAll("[data-live-tomorrow-item]"));
      const emptyState = section.querySelector("[data-live-tomorrow-empty]");
      const list = section.querySelector("[data-live-tomorrow-list]");

      if (!items.length) {
        if (emptyState) {
          emptyState.hidden = false;
        }

        return;
      }

      let visibleCount = 0;

      items.forEach((item) => {
        const isoValue = item.getAttribute("data-session-start-time");
        const date = parseDate(isoValue);
        const shouldShow = Boolean(date && isTomorrowLocal(date));
        item.hidden = !shouldShow;

        if (shouldShow) {
          visibleCount += 1;
        }
      });

      if (list) {
        list.hidden = visibleCount === 0;
      }

      if (emptyState) {
        emptyState.hidden = visibleCount !== 0;
      }
    });
  };

  const bindLiveSessionScheduleForms = (root) => {
    const scope = root && root.querySelectorAll ? root : document;

    scope.querySelectorAll("form[data-live-session-scheduler]").forEach((form) => {
      if (form.dataset.liveSessionSchedulerBound === "true") {
        return;
      }

      form.dataset.liveSessionSchedulerBound = "true";

      form.addEventListener("submit", () => {
        const localInput = form.querySelector("[data-scheduled-start-local]");
        const utcInput = form.querySelector('input[name="scheduledStartTimeUtc"]');
        const timezoneInput = form.querySelector('input[name="schedulerTimeZone"]');

        if (!(localInput instanceof HTMLInputElement) || !utcInput) {
          return;
        }

        const localDate = parseDate(localInput.value);

        if (!localDate) {
          utcInput.value = "";
          return;
        }

        utcInput.value = localDate.toISOString();

        if (timezoneInput instanceof HTMLInputElement) {
          timezoneInput.value =
            Intl.DateTimeFormat().resolvedOptions().timeZone || "";
        }
      });
    });
  };

  const getJoinLockMessage = () => "Available when the live session starts";

  const applyLiveSessionJoinLocks = (root) => {
    const scope = root && root.querySelectorAll ? root : document;
    const now = Date.now();

    scope.querySelectorAll("[data-live-session-join]").forEach((element) => {
      const isoValue =
        element.getAttribute("data-session-start-time") ||
        element.closest("[data-session-start-time]")?.getAttribute("data-session-start-time") ||
        "";
      const startTime = parseDate(isoValue);
      const joinUrl =
        element.getAttribute("data-live-session-url") ||
        element.getAttribute("href") ||
        "";

      if (!joinUrl || !startTime) {
        return;
      }

      const isUnlocked = now >= startTime.getTime();

      if (isUnlocked) {
        if (!element.getAttribute("href")) {
          element.setAttribute("href", joinUrl);
        }

        element.classList.remove("is-disabled");
        element.removeAttribute("aria-disabled");
        element.removeAttribute("tabindex");
        element.removeAttribute("title");
        return;
      }

      element.removeAttribute("href");
      element.classList.add("is-disabled");
      element.setAttribute("aria-disabled", "true");
      element.setAttribute("tabindex", "-1");
      element.setAttribute("title", getJoinLockMessage());
    });
  };

  const applyEnhancements = (root) => {
    applyLocalDateTimes(root);
    applyTomorrowSessionFilters(root);
    bindLiveSessionScheduleForms(root);
    applyLiveSessionJoinLocks(root);
  };

  window.__runBilgeClientTimeEnhancements = applyEnhancements;
  applyEnhancements(document);

  if (!window.__bilgeLiveSessionJoinLockTimerStarted) {
    window.__bilgeLiveSessionJoinLockTimerStarted = true;
    window.setInterval(() => {
      applyLiveSessionJoinLocks(document);
    }, 1000);
  }
})();
