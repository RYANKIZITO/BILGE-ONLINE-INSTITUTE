import { promises as fs } from "fs";

const MAIL_LOG_PREFIX = "[website-contact-mail]";
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

const normalizeString = (value) => String(value || "").trim();

const getMailConfig = () => {
  const apiKey =
    normalizeString(process.env.CONTACT_MAIL_BREVO_API_KEY) ||
    normalizeString(process.env.BREVO_API_KEY);
  const fromName =
    normalizeString(process.env.CONTACT_MAIL_FROM_NAME) || "Bilge Online Institute Website";
  const fromEmail =
    normalizeString(process.env.CONTACT_MAIL_FROM_EMAIL) ||
    normalizeString(process.env.BREVO_FROM_EMAIL) ||
    "Bilgeonlineinstitute@gmail.com";
  const replyTo =
    normalizeString(process.env.CONTACT_MAIL_REPLY_TO) ||
    normalizeString(process.env.BREVO_REPLY_TO) ||
    "Bilgeonlineinstitute@gmail.com";
  const overrideRecipient =
    normalizeString(process.env.CONTACT_MAIL_TO) ||
    normalizeString(process.env.BREVO_TO) ||
    "Bilgeonlineinstitute@gmail.com";

  return {
    apiKey,
    fromName,
    fromEmail,
    replyTo,
    overrideRecipient,
    isConfigured: Boolean(apiKey && fromEmail),
  };
};

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const admissionsInterests = new Set([
  "Admissions & enrollment",
  "Programme guidance",
  "Fees & payment",
  "Student enrollment",
]);

const buildRecipientList = (payload, contactDetails) => {
  const recipients = [];
  const pushUnique = (value) => {
    const email = normalizeString(value).toLowerCase();
    if (!email || recipients.includes(email)) {
      return;
    }
    recipients.push(email);
  };

  const config = getMailConfig();
  if (config.overrideRecipient) {
    pushUnique(config.overrideRecipient);
    return recipients;
  }

  if (admissionsInterests.has(payload.interestArea)) {
    pushUnique(contactDetails?.admissionsEmail);
  }

  pushUnique(contactDetails?.supportEmail);
  pushUnique(contactDetails?.admissionsEmail);

  return recipients;
};

const buildInternalMessage = (payload) => {
  const title = payload.subject || payload.interestArea || "New website enquiry";
  const fields = [
    ["Name", payload.name],
    ["Email", payload.email],
    ["Phone", payload.phone || "Not provided"],
    ["Interest area", payload.interestArea || "Not selected"],
    ["Subject", payload.subject || "Not provided"],
    ["Submitted", new Date().toISOString()],
  ];

  const text = [
    "New website contact enquiry",
    "",
    ...fields.map(([label, value]) => `${label}: ${value}`),
    "",
    "Message:",
    payload.message,
  ].join("\n");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#181818">
      <h2 style="margin:0 0 16px">New website contact enquiry</h2>
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
        <strong style="display:block;margin-bottom:8px">Message</strong>
        <p style="margin:0;white-space:pre-wrap">${escapeHtml(payload.message)}</p>
      </div>
    </div>
  `.trim();

  return {
    subject: `[Bilge Website] ${title}`,
    text,
    html,
  };
};

const buildAcknowledgementMessage = (payload, contactDetails) => {
  const instituteName = normalizeString(contactDetails?.instituteName) || "Bilge Online Institute";
  const supportEmail = normalizeString(contactDetails?.supportEmail);
  const phone = normalizeString(contactDetails?.phoneDisplay || contactDetails?.phone);
  const subject = payload.subject || payload.interestArea || "your enquiry";

  const text = [
    `Hello ${payload.name},`,
    "",
    `Bilge Online Institute has received your message about ${subject}.`,
    "We will review it and get back to you as soon as possible.",
    "",
    supportEmail ? `Support email: ${supportEmail}` : null,
    phone ? `Phone: ${phone}` : null,
    "",
    "Regards,",
    instituteName,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#181818">
      <p>Hello ${escapeHtml(payload.name)},</p>
      <p>${escapeHtml(instituteName)} has received your message about ${escapeHtml(subject)}.</p>
      <p>We will review it and get back to you as soon as possible.</p>
      <div style="margin-top:18px;padding:16px;border:1px solid #ddd;border-radius:12px;background:#faf7f1">
        ${supportEmail ? `<div><strong>Support email:</strong> ${escapeHtml(supportEmail)}</div>` : ""}
        ${phone ? `<div style="margin-top:6px"><strong>Phone:</strong> ${escapeHtml(phone)}</div>` : ""}
      </div>
      <p style="margin-top:18px">Regards,<br />${escapeHtml(instituteName)}</p>
    </div>
  `.trim();

  return {
    subject: `We received your enquiry | ${instituteName}`,
    text,
    html,
  };
};

const sendBrevoEmail = async ({ to, replyTo, subject, text, html, attachments = [] }) => {
  const config = getMailConfig();
  const response = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": config.apiKey,
    },
    body: JSON.stringify({
      sender: {
        name: config.fromName,
        email: config.fromEmail,
      },
      to: to.map((email) => ({ email })),
      replyTo: replyTo ? { email: replyTo } : undefined,
      subject,
      textContent: text,
      htmlContent: html,
      attachment: attachments.length ? attachments : undefined,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Brevo request failed (${response.status}): ${detail}`);
  }

  return response.json();
};

const buildBrevoAttachments = async (files = []) =>
  Promise.all(
    files
      .filter((file) => file?.path)
      .map(async (file) => ({
        name: file.originalname,
        content: (await fs.readFile(file.path)).toString("base64"),
      }))
  );

export const sendContactNotifications = async ({ payload, contactDetails }) => {
  const config = getMailConfig();
  if (!config.isConfigured) {
    console.warn(`${MAIL_LOG_PREFIX} Brevo API key is not configured. Skipping email delivery.`);
    return { configured: false, delivered: false };
  }

  const recipients = buildRecipientList(payload, contactDetails);
  if (!recipients.length) {
    console.warn(`${MAIL_LOG_PREFIX} No destination email address is available. Skipping email delivery.`);
    return { configured: true, delivered: false };
  }

  const internalMessage = buildInternalMessage(payload);
  const acknowledgement = buildAcknowledgementMessage(payload, contactDetails);

  await sendBrevoEmail({
    to: recipients,
    replyTo: payload.email || config.replyTo,
    ...internalMessage,
  });

  let acknowledgementDelivered = false;
  try {
    await sendBrevoEmail({
      to: [payload.email],
      replyTo: config.replyTo || recipients[0],
      ...acknowledgement,
    });
    acknowledgementDelivered = true;
  } catch (error) {
    console.warn(`${MAIL_LOG_PREFIX} Acknowledgement email failed, but the Bilge inbox delivery succeeded.`, error);
  }

  return {
    configured: true,
    delivered: true,
    acknowledgementDelivered,
    recipients,
  };
};

export { buildBrevoAttachments, getMailConfig, sendBrevoEmail };
