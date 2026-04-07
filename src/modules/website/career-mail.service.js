import { buildBrevoAttachments, getMailConfig, sendBrevoEmail } from "./contact-mail.service.js";

const MAIL_LOG_PREFIX = "[website-careers-mail]";
const DEFAULT_RECIPIENT = "Bilgeonlineinstitute@gmail.com";

const normalizeString = (value) => String(value || "").trim();

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildInternalMessage = ({
  payload,
  resumeFile,
  introVideo,
  supportingDocuments,
  contactDetails,
}) => {
  const instituteName = normalizeString(contactDetails?.instituteName) || "Bilge Online Institute";
  const fields = [
    ["Applicant", payload.fullName],
    ["Email", payload.email],
    ["Phone", payload.phone || "Not provided"],
    ["Location", payload.location || "Not provided"],
    ["Role", payload.role],
    ["Employment type", payload.employmentType || "Not provided"],
    ["Experience level", payload.experienceLevel || "Not provided"],
    ["Availability", payload.availability || "Not provided"],
    ["Salary expectation", payload.salaryExpectation || "Not provided"],
    ["LinkedIn", payload.linkedinUrl || "Not provided"],
    ["Portfolio", payload.portfolioUrl || "Not provided"],
    ["Submitted", new Date().toISOString()],
  ];

  const fileNames = [resumeFile, introVideo, ...(supportingDocuments || [])]
    .filter(Boolean)
    .map((file) => file.originalname);

  const text = [
    `New careers application for ${instituteName}`,
    "",
    ...fields.map(([label, value]) => `${label}: ${value}`),
    "",
    "Cover letter:",
    payload.coverLetter,
    "",
    "Attachments:",
    ...fileNames.map((fileName) => `- ${fileName}`),
  ].join("\n");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#181818">
      <h2 style="margin:0 0 16px">New careers application</h2>
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
        <strong style="display:block;margin-bottom:8px">Cover letter</strong>
        <p style="margin:0;white-space:pre-wrap">${escapeHtml(payload.coverLetter)}</p>
      </div>
      <div style="margin-top:18px">
        <strong>Attachments</strong>
        <ul style="margin:8px 0 0;padding-left:18px">
          ${fileNames.map((fileName) => `<li>${escapeHtml(fileName)}</li>`).join("")}
        </ul>
      </div>
    </div>
  `.trim();

  return {
    subject: `[Bilge Careers] ${payload.role} application from ${payload.fullName}`,
    text,
    html,
  };
};

export const sendCareerApplicationNotifications = async ({
  payload,
  resumeFile,
  introVideo,
  supportingDocuments,
  contactDetails,
}) => {
  const config = getMailConfig();
  const recipient =
    normalizeString(process.env.CAREER_MAIL_TO) ||
    normalizeString(process.env.CONTACT_MAIL_TO) ||
    DEFAULT_RECIPIENT;

  if (!config.isConfigured) {
    console.warn(`${MAIL_LOG_PREFIX} Brevo API key is not configured. Skipping email delivery.`);
    return { configured: false, delivered: false };
  }

  const message = buildInternalMessage({
    payload,
    resumeFile,
    introVideo,
    supportingDocuments,
    contactDetails,
  });

  const attachments = await buildBrevoAttachments([
    resumeFile,
    introVideo,
    ...(supportingDocuments || []),
  ]);

  await sendBrevoEmail({
    to: [recipient],
    replyTo: payload.email || config.replyTo,
    attachments,
    ...message,
  });

  return {
    configured: true,
    delivered: true,
    recipient,
  };
};
