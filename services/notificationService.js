const NOTIFICATION_LOG_PREFIX = "[notifications:dispatcher]";

const normalizeString = (value) => String(value || "").trim();

const serializeUser = (user = {}) => ({
  id: normalizeString(user.id),
  email: normalizeString(user.email).toLowerCase(),
  name: normalizeString(user.name),
  fullName: normalizeString(user.fullName),
  phoneNumber: normalizeString(user.phoneNumber),
  countryCode: normalizeString(user.countryCode).toUpperCase(),
});

const buildNotificationJobId = ({ type, user, data }) => {
  const normalizedType = normalizeString(type).toUpperCase();

  if (!normalizedType || !user?.id) {
    return null;
  }

  if (normalizedType === "PAYMENT_SUCCESS" && data?.paymentId) {
    return `${normalizedType}:${user.id}:${data.paymentId}`;
  }

  if (normalizedType === "CERTIFICATE_READY" && (data?.certificateId || data?.verificationCode)) {
    return `${normalizedType}:${user.id}:${data.certificateId || data.verificationCode}`;
  }

  if (normalizedType === "USER_REGISTERED") {
    return `${normalizedType}:${user.id}`;
  }

  return `${normalizedType}:${user.id}:${Date.now()}`;
};

export const notify = async ({ type, user, data = {} }) => {
  const normalizedType = normalizeString(type).toUpperCase();
  const serializedUser = serializeUser(user);

  if (!normalizedType || !serializedUser.id) {
    console.warn(`${NOTIFICATION_LOG_PREFIX} Skipping enqueue because notification type or user is missing.`);
    return { queued: false, reason: "invalid_payload" };
  }

  try {
    const { notificationQueue } = await import("../queues/notificationQueue.js");
    const payload = {
      type: normalizedType,
      user: serializedUser,
      data,
      queuedAt: new Date().toISOString(),
    };

    const job = await notificationQueue.add(normalizedType, payload, {
      jobId: buildNotificationJobId({ type: normalizedType, user: serializedUser, data }),
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    });

    return {
      queued: true,
      jobId: job.id,
    };
  } catch (error) {
    if (/jobId/i.test(String(error?.message || "")) && /exists/i.test(String(error?.message || ""))) {
      return {
        queued: true,
        duplicate: true,
        reason: "duplicate_job",
      };
    }

    console.error(`${NOTIFICATION_LOG_PREFIX} Failed to enqueue ${normalizedType}.`, error);
    return {
      queued: false,
      reason: "enqueue_failed",
      error: error?.message || String(error),
    };
  }
};
