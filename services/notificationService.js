import { processNotificationPayload } from "../workers/notificationWorker.js";

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

  if (normalizedType === "PAYMENT_FAILED" && (data?.paymentId || data?.reference)) {
    return `${normalizedType}:${user.id}:${data.paymentId || data.reference}`;
  }

  if (normalizedType === "COURSE_ENROLLED" && data?.courseId) {
    return `${normalizedType}:${user.id}:${data.courseId}`;
  }

  if (normalizedType === "COURSE_COMPLETED" && data?.courseId) {
    return `${normalizedType}:${user.id}:${data.courseId}`;
  }

  if (normalizedType === "COURSE_ASSIGNMENT_PUBLISHED" && data?.assignmentId) {
    return `${normalizedType}:${user.id}:${data.assignmentId}`;
  }

  if (normalizedType === "COURSE_ASSIGNED" && data?.courseId) {
    return `${normalizedType}:${user.id}:${data.courseId}`;
  }

  if (
    (normalizedType === "ENROLLMENT_CANCELLED" ||
      normalizedType === "COURSE_SWITCH_REQUESTED" ||
      normalizedType === "ENROLLMENT_CANCELLATION_REVIEWED" ||
      normalizedType === "COURSE_SWITCH_REVIEWED") &&
    data?.cancellationId
  ) {
    return `${normalizedType}:${user.id}:${data.cancellationId}`;
  }

  if (
    (normalizedType === "LIVE_SESSION_SCHEDULED" ||
      normalizedType === "LIVE_SESSION_UPDATED") &&
    data?.liveSessionId
  ) {
    return `${normalizedType}:${user.id}:${data.liveSessionId}:${data?.status || ""}`;
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
    console.warn(`${NOTIFICATION_LOG_PREFIX} Skipping delivery because notification type or user is missing.`);
    return { queued: false, reason: "invalid_payload" };
  }

  try {
    const payload = {
      type: normalizedType,
      user: serializedUser,
      data,
      dispatchedAt: new Date().toISOString(),
    };

    const result = await processNotificationPayload(payload);

    return {
      queued: false,
      delivered: result.deliveredCount > 0,
      direct: true,
      type: result.type,
      results: result.results,
      failureCount: result.failureCount,
      notificationId: buildNotificationJobId({ type: normalizedType, user: serializedUser, data }),
    };
  } catch (error) {
    console.error(`${NOTIFICATION_LOG_PREFIX} Failed to deliver ${normalizedType}.`, error);
    return {
      queued: false,
      delivered: false,
      direct: true,
      reason: "delivery_failed",
      error: error?.message || String(error),
    };
  }
};
