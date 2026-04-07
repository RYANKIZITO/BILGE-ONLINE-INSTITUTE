import "../src/config/load-env.js";

import { Worker } from "bullmq";
import {
  NOTIFICATION_QUEUE_NAME,
  createRedisConnection,
} from "../queues/notificationQueue.js";
import { sendSMS } from "../services/smsService.js";
import {
  getMailConfig,
  sendBrevoEmail,
} from "../src/modules/website/contact-mail.service.js";

const WORKER_LOG_PREFIX = "[notifications:worker]";
const APP_BASE_URL =
  String(
    process.env.APP_BASE_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.BASE_URL ||
      ""
  ).trim() || null;

const COUNTRY_DIAL_CODES = {
  AE: "971",
  AU: "61",
  BI: "257",
  CA: "1",
  DE: "49",
  ET: "251",
  FR: "33",
  GB: "44",
  GH: "233",
  IN: "91",
  KE: "254",
  NG: "234",
  NZ: "64",
  RW: "250",
  SA: "966",
  SS: "211",
  TZ: "255",
  UG: "256",
  US: "1",
  ZA: "27",
};

const normalizeString = (value) => String(value || "").trim();

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatSmsPhoneNumber = (user = {}) => {
  const phoneNumber = normalizeString(user.phoneNumber).replace(/[^\d+]/g, "");
  if (!phoneNumber) {
    return null;
  }

  if (phoneNumber.startsWith("+")) {
    return phoneNumber;
  }

  const dialCode = COUNTRY_DIAL_CODES[normalizeString(user.countryCode).toUpperCase()];
  if (!dialCode) {
    return null;
  }

  const withoutLeadingZeroes = phoneNumber.replace(/^0+/, "");
  return `+${dialCode}${withoutLeadingZeroes}`;
};

const getDisplayName = (user = {}) =>
  normalizeString(user.fullName) || normalizeString(user.name) || "Student";

const buildEventContent = ({ type, user, data = {} }) => {
  const displayName = getDisplayName(user);
  const courseTitle = normalizeString(data.courseTitle) || "your programme";
  const currency = normalizeString(data.currency).toUpperCase();
  const amount =
    data.amount === null || data.amount === undefined || data.amount === ""
      ? null
      : Number(data.amount);
  const amountLabel =
    amount !== null && Number.isFinite(amount)
      ? `${amount.toFixed(2)}${currency ? ` ${currency}` : ""}`
      : null;
  const certificateUrl =
    APP_BASE_URL && data.verificationCode
      ? `${APP_BASE_URL.replace(/\/+$/, "")}/certificates/${encodeURIComponent(data.verificationCode)}`
      : null;

  if (type === "USER_REGISTERED") {
    return {
      emailSubject: "Welcome to Bilge Online Institute",
      emailText: [
        `Hello ${displayName},`,
        "",
        "Welcome to Bilge Online Institute.",
        "Your account has been created successfully and you can now continue your learning journey on the platform.",
        "",
        "Regards,",
        "Bilge Online Institute",
      ].join("\n"),
      emailHtml: `
        <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#181818">
          <p>Hello ${escapeHtml(displayName)},</p>
          <p>Welcome to <strong>Bilge Online Institute</strong>.</p>
          <p>Your account has been created successfully and you can now continue your learning journey on the platform.</p>
          <p style="margin-top:18px">Regards,<br />Bilge Online Institute</p>
        </div>
      `.trim(),
      smsText: `Welcome to Bilge Online Institute, ${displayName}. Your account has been created successfully.`,
    };
  }

  if (type === "PAYMENT_SUCCESS") {
    return {
      emailSubject: `Payment confirmed for ${courseTitle}`,
      emailText: [
        `Hello ${displayName},`,
        "",
        `Your payment for ${courseTitle} was successful${amountLabel ? ` (${amountLabel})` : ""}.`,
        "Your enrollment has been confirmed.",
        "",
        "Regards,",
        "Bilge Online Institute",
      ].join("\n"),
      emailHtml: `
        <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#181818">
          <p>Hello ${escapeHtml(displayName)},</p>
          <p>Your payment for <strong>${escapeHtml(courseTitle)}</strong> was successful${amountLabel ? ` (${escapeHtml(amountLabel)})` : ""}.</p>
          <p>Your enrollment has been confirmed.</p>
          <p style="margin-top:18px">Regards,<br />Bilge Online Institute</p>
        </div>
      `.trim(),
      smsText: `Bilge payment confirmed: ${courseTitle}${amountLabel ? ` (${amountLabel})` : ""}. Your enrollment is confirmed.`,
    };
  }

  if (type === "CERTIFICATE_READY") {
    return {
      emailSubject: `Your certificate is ready for ${courseTitle}`,
      emailText: [
        `Hello ${displayName},`,
        "",
        `Your certificate for ${courseTitle} is now ready.`,
        data.verificationCode ? `Verification code: ${data.verificationCode}` : null,
        certificateUrl ? `View certificate: ${certificateUrl}` : null,
        "",
        "Regards,",
        "Bilge Online Institute",
      ]
        .filter(Boolean)
        .join("\n"),
      emailHtml: `
        <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#181818">
          <p>Hello ${escapeHtml(displayName)},</p>
          <p>Your certificate for <strong>${escapeHtml(courseTitle)}</strong> is now ready.</p>
          ${
            data.verificationCode
              ? `<p><strong>Verification code:</strong> ${escapeHtml(data.verificationCode)}</p>`
              : ""
          }
          ${
            certificateUrl
              ? `<p><a href="${escapeHtml(certificateUrl)}">Open your certificate</a></p>`
              : ""
          }
          <p style="margin-top:18px">Regards,<br />Bilge Online Institute</p>
        </div>
      `.trim(),
      smsText: `Bilge certificate ready: ${courseTitle}.${data.verificationCode ? ` Code: ${data.verificationCode}.` : ""}`,
    };
  }

  throw new Error(`Unsupported notification type: ${type}`);
};

const sendNotificationEmail = async ({ user, subject, text, html }) => {
  const config = getMailConfig();
  const recipient = normalizeString(user?.email).toLowerCase();

  if (!config.isConfigured) {
    console.warn(`${WORKER_LOG_PREFIX} Email service is not configured. Skipping email delivery.`);
    return { delivered: false, skipped: true, reason: "not_configured" };
  }

  if (!recipient) {
    return { delivered: false, skipped: true, reason: "missing_email" };
  }

  await sendBrevoEmail({
    to: [recipient],
    replyTo: config.replyTo || undefined,
    subject,
    text,
    html,
  });

  return { delivered: true, skipped: false, recipient };
};

const processNotificationJob = async (job) => {
  const payload = job?.data || {};
  const type = normalizeString(payload.type).toUpperCase();
  const user = payload.user || {};
  const data = payload.data || {};
  const content = buildEventContent({ type, user, data });
  const results = [];
  const failures = [];

  try {
    const emailResult = await sendNotificationEmail({
      user,
      subject: content.emailSubject,
      text: content.emailText,
      html: content.emailHtml,
    });
    results.push({ channel: "email", ...emailResult });
  } catch (error) {
    console.error(`${WORKER_LOG_PREFIX} Email delivery failed for ${type}.`, error);
    failures.push({ channel: "email", error });
  }

  const smsDestination = formatSmsPhoneNumber(user);
  if (smsDestination) {
    try {
      const smsResult = await sendSMS(smsDestination, content.smsText);
      results.push({ channel: "sms", ...smsResult });
    } catch (error) {
      console.error(`${WORKER_LOG_PREFIX} SMS delivery failed for ${type}.`, error);
      failures.push({ channel: "sms", error });
    }
  } else {
    results.push({ channel: "sms", delivered: false, skipped: true, reason: "missing_or_invalid_phone" });
  }

  const deliveredCount = results.filter((result) => result.delivered).length;
  const configuredFailureCount = failures.length;

  if (deliveredCount === 0 && configuredFailureCount > 0) {
    throw failures[0].error;
  }

  return {
    type,
    deliveredCount,
    results,
    failureCount: configuredFailureCount,
  };
};

const workerConnection = createRedisConnection();

const worker = new Worker(NOTIFICATION_QUEUE_NAME, processNotificationJob, {
  connection: workerConnection,
  concurrency: Number.parseInt(String(process.env.NOTIFICATION_WORKER_CONCURRENCY || "5"), 10) || 5,
});

worker.on("completed", (job, result) => {
  console.log(
    `${WORKER_LOG_PREFIX} Job ${job?.id || "unknown"} completed for ${result?.type || job?.name || "notification"}.`
  );
});

worker.on("failed", (job, error) => {
  console.error(
    `${WORKER_LOG_PREFIX} Job ${job?.id || "unknown"} failed for ${job?.name || "notification"}.`,
    error
  );
});

console.log(`${WORKER_LOG_PREFIX} Worker is listening on queue "${NOTIFICATION_QUEUE_NAME}".`);

