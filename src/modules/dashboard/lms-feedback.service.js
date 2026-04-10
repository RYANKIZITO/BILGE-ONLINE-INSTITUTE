import { getMailConfig, sendBrevoEmail } from "../website/contact-mail.service.js";

const LMS_FEEDBACK_LOG_PREFIX = "[lms-feedback-mail]";
const DEFAULT_FEEDBACK_RECIPIENT = "bilgeonlineinstitute@gmail.com";
const DEFAULT_SENDER_NAME = "Bilge Online Institute LMS";

const normalizeString = (value) => String(value || "").trim();

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildFeedbackTypeLabel = (value) => {
  const normalized = normalizeString(value).toLowerCase();

  if (normalized === "help") return "Help request";
  if (normalized === "improvement") return "Suggested improvement";
  if (normalized === "challenge") return "System challenge";
  if (normalized === "bug") return "Bug report";
  return "General LMS feedback";
};

const buildInternalMessage = ({ payload, user }) => {
  const fields = [
    ["Source", "Bilge LMS dashboard feedback"],
    ["Feedback type", buildFeedbackTypeLabel(payload.feedbackType)],
    ["Role", user?.role || "Unknown"],
    ["User", user?.name || "Unknown user"],
    ["Email", user?.email || "Not available"],
    ["Dashboard", payload.dashboardLabel || "LMS dashboard"],
    ["Page path", payload.pagePath || "Unknown"],
    ["Submitted", new Date().toISOString()],
  ];

  const text = [
    "New LMS feedback submission",
    "",
    ...fields.map(([label, value]) => `${label}: ${value}`),
    "",
    "What the user shared:",
    payload.message,
  ].join("\n");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#181818">
      <h2 style="margin:0 0 16px">New LMS feedback submission</h2>
      <table style="border-collapse:collapse;margin-bottom:18px">
        <tbody>
          ${fields
            .map(
              ([label, value]) => `
                <tr>
                  <td style="padding:6px 12px 6px 0;font-weight:700;vertical-align:top">${escapeHtml(label)}</td>
                  <td style="padding:6px 0">${escapeHtml(value)}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
      <div style="padding:16px;border:1px solid #ddd;border-radius:12px;background:#faf7f1">
        <strong style="display:block;margin-bottom:8px">What the user shared</strong>
        <p style="margin:0;white-space:pre-wrap">${escapeHtml(payload.message)}</p>
      </div>
    </div>
  `.trim();

  return {
    subject: `[Bilge LMS Feedback] ${buildFeedbackTypeLabel(payload.feedbackType)} from ${user?.name || "User"}`,
    text,
    html,
  };
};

export const validateLmsFeedbackSubmission = (body = {}) => {
  const payload = {
    feedbackType: normalizeString(body.feedbackType).toLowerCase(),
    dashboardLabel: normalizeString(body.dashboardLabel),
    pagePath: normalizeString(body.pagePath),
    message: normalizeString(body.message),
  };

  const allowedTypes = new Set(["help", "improvement", "challenge", "bug", "general"]);
  const errors = [];

  if (!allowedTypes.has(payload.feedbackType)) {
    errors.push("Please choose the kind of feedback you are sending.");
  }

  if (!payload.message || payload.message.length < 20) {
    errors.push("Please share a little more detail so the Bilge team can act on it.");
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: payload,
  };
};

export const sendLmsFeedbackNotification = async ({ payload, user }) => {
  const config = getMailConfig();
  const recipient =
    normalizeString(process.env.LMS_FEEDBACK_TO) || DEFAULT_FEEDBACK_RECIPIENT;

  if (!config.isConfigured) {
    console.warn(`${LMS_FEEDBACK_LOG_PREFIX} Email delivery is not configured. Skipping LMS feedback delivery.`, {
      hasApiKey: Boolean(config.apiKey),
      hasFromEmail: Boolean(config.fromEmail),
      fromEmail: config.fromEmail || null,
    });
    return { configured: false, delivered: false };
  }

  if (!recipient) {
    console.warn(`${LMS_FEEDBACK_LOG_PREFIX} No feedback destination email address is available. Skipping delivery.`);
    return { configured: true, delivered: false };
  }

  const message = buildInternalMessage({ payload, user });

  await sendBrevoEmail({
    to: [recipient],
    replyTo: user?.email || config.replyTo,
    senderName: DEFAULT_SENDER_NAME,
    ...message,
  });

  return {
    configured: true,
    delivered: true,
    recipient,
  };
};
