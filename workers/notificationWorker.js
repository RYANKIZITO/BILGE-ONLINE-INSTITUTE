import "../src/config/load-env.js";

import { pathToFileURL } from "url";
import {
  getMailConfig,
  sendBrevoEmail,
} from "../src/modules/website/contact-mail.service.js";

const DELIVERY_LOG_PREFIX = "[notifications:brevo]";
const INSTITUTE_NOTIFICATION_EMAIL = "bilgeonlineinstitute@gmail.com";
const APP_BASE_URL =
  String(
    process.env.APP_BASE_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.BASE_URL ||
      ""
  ).trim() || null;

const normalizeString = (value) => String(value || "").trim();

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getDisplayName = (user = {}) =>
  normalizeString(user.fullName) || normalizeString(user.name) || "Student";

const formatDateTime = (value) => {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Kampala",
  });
};

const buildUserMessage = ({ subject, displayName, lines }) => {
  const filteredLines = lines.filter(Boolean);

  return {
    emailSubject: subject,
    emailText: [
      `Hello ${displayName},`,
      "",
      ...filteredLines,
      "",
      "Regards,",
      "Bilge Online Institute",
    ].join("\n"),
    emailHtml: `
      <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#181818">
        <p>Hello ${escapeHtml(displayName)},</p>
        ${filteredLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
        <p style="margin-top:18px">Regards,<br />Bilge Online Institute</p>
      </div>
    `.trim(),
  };
};

const buildAdminMessage = ({ subject, heading, fields }) => {
  const rows = fields.filter(([, value]) => value !== null && value !== undefined && value !== "");

  return {
    subject,
    text: [
      heading,
      "",
      ...rows.map(([label, value]) => `${label}: ${value}`),
    ].join("\n"),
    html: `
      <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#181818">
        <h2 style="margin:0 0 16px">${escapeHtml(heading)}</h2>
        <table style="border-collapse:collapse">
          <tbody>
            ${rows
              .map(
                ([label, value]) => `
                  <tr>
                    <td style="padding:6px 14px 6px 0;font-weight:700;vertical-align:top">${escapeHtml(label)}</td>
                    <td style="padding:6px 0">${escapeHtml(value)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `.trim(),
  };
};

const withAdminMessage = (content, adminMessage) => ({
  ...content,
  adminEmailSubject: adminMessage.subject,
  adminEmailText: adminMessage.text,
  adminEmailHtml: adminMessage.html,
});

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
    return withAdminMessage(
      {
        ...buildUserMessage({
          subject: "Welcome to Bilge Online Institute",
          displayName,
          lines: [
            "Welcome to Bilge Online Institute.",
            "Your account has been created successfully and you can now continue your learning journey on the platform.",
          ],
        }),
      },
      buildAdminMessage({
        subject: "[Bilge LMS] New student signup",
        heading: "New student signup",
        fields: [
          ["Name", displayName],
          ["Email", user.email],
          ["Student ID", user.id],
          ["Signup time", data.createdAt || new Date().toISOString()],
        ],
      })
    );
  }

  if (type === "PAYMENT_SUCCESS") {
    return withAdminMessage(
      {
        ...buildUserMessage({
          subject: `Payment confirmed for ${courseTitle}`,
          displayName,
          lines: [
            `Your payment for ${courseTitle} was successful${amountLabel ? ` (${amountLabel})` : ""}.`,
            "Your enrollment has been confirmed.",
          ],
        }),
      },
      buildAdminMessage({
        subject: "[Bilge LMS] Payment confirmed",
        heading: "Payment confirmed",
        fields: [
          ["Student", displayName],
          ["Email", user.email],
          ["Course", courseTitle],
          ["Amount", amountLabel],
          ["Provider", data.provider],
          ["Reference", data.reference],
          ["Payment ID", data.paymentId],
        ],
      })
    );
  }

  if (type === "PAYMENT_FAILED") {
    const reason = normalizeString(data.failureReason) || "The payment could not be completed.";
    return withAdminMessage(
      {
        ...buildUserMessage({
          subject: `Payment was not completed for ${courseTitle}`,
          displayName,
          lines: [
            `Your payment for ${courseTitle} was not successful${amountLabel ? ` (${amountLabel})` : ""}.`,
            reason,
            "You can return to the course page and try again when you are ready.",
          ],
        }),
      },
      buildAdminMessage({
        subject: "[Bilge LMS] Payment failed",
        heading: "Payment failed",
        fields: [
          ["Student", displayName],
          ["Email", user.email],
          ["Course", courseTitle],
          ["Amount", amountLabel],
          ["Provider", data.provider],
          ["Reference", data.reference],
          ["Payment ID", data.paymentId],
          ["Reason", reason],
        ],
      })
    );
  }

  if (type === "COURSE_ENROLLED") {
    return {
      ...buildUserMessage({
        subject: `Enrollment confirmed for ${courseTitle}`,
        displayName,
        lines: [
          `You are now enrolled in ${courseTitle}.`,
          "You can open My Courses and continue with your lessons.",
        ],
      }),
    };
  }

  if (type === "COURSE_COMPLETED") {
    return {
      ...buildUserMessage({
        subject: `Course completed: ${courseTitle}`,
        displayName,
        lines: [
          `Congratulations. You have completed ${courseTitle}.`,
          "Your certificate eligibility can now be checked from the course page.",
        ],
      }),
    };
  }

  if (type === "COURSE_ASSIGNMENT_PUBLISHED") {
    const assignmentTitle = normalizeString(data.assignmentTitle) || "A course assessment";
    return {
      ...buildUserMessage({
        subject: `New course assignment: ${assignmentTitle}`,
        displayName,
        lines: [
          `${assignmentTitle} has been published for ${courseTitle}.`,
          "Open the course assessments area to review and submit it.",
        ],
      }),
    };
  }

  if (type === "COURSE_ASSIGNED") {
    return {
      ...buildUserMessage({
        subject: `Course assigned: ${courseTitle}`,
        displayName,
        lines: [
          `${courseTitle} has been assigned to you.`,
          "Open your instructor dashboard to manage the course.",
        ],
      }),
    };
  }

  if (type === "ENROLLMENT_CANCELLED") {
    return withAdminMessage(
      {
        ...buildUserMessage({
          subject: `Enrollment cancelled for ${courseTitle}`,
          displayName,
          lines: [
            `Your enrollment for ${courseTitle} has been cancelled.`,
            data.refundReviewStatus === "PENDING_REVIEW"
              ? "Your request is awaiting admin review."
              : null,
          ],
        }),
      },
      buildAdminMessage({
        subject: "[Bilge LMS] Course cancellation",
        heading: "Course cancellation submitted",
        fields: [
          ["Student", displayName],
          ["Email", user.email],
          ["Course", courseTitle],
          ["Reason", data.reasonLabel || data.reasonOption],
          ["Details", data.reasonText],
          ["Refund review", data.refundReviewStatus],
          ["Cancellation ID", data.cancellationId],
        ],
      })
    );
  }

  if (type === "COURSE_SWITCH_REQUESTED") {
    const targetCourseTitle = normalizeString(data.targetCourseTitle) || "the selected course";
    return withAdminMessage(
      {
        ...buildUserMessage({
          subject: `Course switch requested: ${courseTitle}`,
          displayName,
          lines: [
            `Your enrollment for ${courseTitle} has been cancelled and your switch request to ${targetCourseTitle} is awaiting admin review.`,
            data.switchFinancialSummary || null,
          ],
        }),
      },
      buildAdminMessage({
        subject: "[Bilge LMS] Course switch request",
        heading: "Course switch request submitted",
        fields: [
          ["Student", displayName],
          ["Email", user.email],
          ["Current course", courseTitle],
          ["Requested course", targetCourseTitle],
          ["Reason", data.reasonLabel || data.reasonOption],
          ["Details", data.reasonText],
          ["Review status", data.refundReviewStatus],
          ["Cancellation ID", data.cancellationId],
        ],
      })
    );
  }

  if (type === "ENROLLMENT_CANCELLATION_REVIEWED") {
    const statusLabel = normalizeString(data.statusLabel) || normalizeString(data.status) || "reviewed";
    const decisionNote = normalizeString(data.decisionNote) || null;
    return withAdminMessage(
      {
        ...buildUserMessage({
          subject: `Cancellation review update for ${courseTitle}`,
          displayName,
          lines: [
            `Your cancellation request for ${courseTitle} has been reviewed: ${statusLabel}.`,
            decisionNote,
          ],
        }),
      },
      buildAdminMessage({
        subject: "[Bilge LMS] Cancellation review update",
        heading: "Cancellation review update",
        fields: [
          ["Student", displayName],
          ["Email", user.email],
          ["Course", courseTitle],
          ["Status", statusLabel],
          ["Decision note", decisionNote],
          ["Cancellation ID", data.cancellationId],
        ],
      })
    );
  }

  if (type === "COURSE_SWITCH_REVIEWED") {
    const targetCourseTitle = normalizeString(data.targetCourseTitle) || "the requested course";
    const statusLabel = normalizeString(data.statusLabel) || normalizeString(data.status) || "reviewed";
    const decisionNote = normalizeString(data.decisionNote) || null;
    return withAdminMessage(
      {
        ...buildUserMessage({
          subject: `Course switch update for ${courseTitle}`,
          displayName,
          lines: [
            `Your switch request from ${courseTitle} to ${targetCourseTitle} has been reviewed: ${statusLabel}.`,
            decisionNote,
          ],
        }),
      },
      buildAdminMessage({
        subject: "[Bilge LMS] Course switch review update",
        heading: "Course switch review update",
        fields: [
          ["Student", displayName],
          ["Email", user.email],
          ["Current course", courseTitle],
          ["Requested course", targetCourseTitle],
          ["Status", statusLabel],
          ["Decision note", decisionNote],
          ["Cancellation ID", data.cancellationId],
        ],
      })
    );
  }

  if (type === "LIVE_SESSION_SCHEDULED") {
    const sessionLabel = normalizeString(data.sessionTypeLabel) || "Live session";
    const scheduledLabel = formatDateTime(data.scheduledStartTime);
    return {
      ...buildUserMessage({
        subject: `${sessionLabel} scheduled for ${courseTitle}`,
        displayName,
        lines: [
          `${sessionLabel} has been scheduled for ${courseTitle}.`,
          scheduledLabel ? `Scheduled time: ${scheduledLabel} EAT.` : null,
          data.meetingUrl ? `Join link: ${data.meetingUrl}` : null,
        ],
      }),
    };
  }

  if (type === "LIVE_SESSION_UPDATED") {
    const sessionLabel = normalizeString(data.sessionTypeLabel) || "Live session";
    const statusLabel = normalizeString(data.statusLabel) || normalizeString(data.status) || "updated";
    return {
      ...buildUserMessage({
        subject: `${sessionLabel} update for ${courseTitle}`,
        displayName,
        lines: [
          `${sessionLabel} for ${courseTitle} has been updated: ${statusLabel}.`,
          data.meetingUrl ? `Join link: ${data.meetingUrl}` : null,
        ],
      }),
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
    };
  }

  throw new Error(`Unsupported notification type: ${type}`);
};

const sendNotificationEmail = async ({ user, recipient, subject, text, html }) => {
  const config = getMailConfig();
  const destination = normalizeString(recipient || user?.email).toLowerCase();

  if (!config.isConfigured) {
    console.warn(`${DELIVERY_LOG_PREFIX} Email service is not configured. Skipping email delivery.`);
    return { delivered: false, skipped: true, reason: "not_configured" };
  }

  if (!destination) {
    return { delivered: false, skipped: true, reason: "missing_email" };
  }

  await sendBrevoEmail({
    to: [destination],
    replyTo: config.replyTo || undefined,
    subject,
    text,
    html,
  });

  return { delivered: true, skipped: false, recipient: destination };
};

export const processNotificationPayload = async (payload = {}) => {
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
    console.error(`${DELIVERY_LOG_PREFIX} Email delivery failed for ${type}.`, error);
    failures.push({ channel: "email", error });
  }

  if (content.adminEmailSubject) {
    try {
      const adminEmailResult = await sendNotificationEmail({
        recipient: INSTITUTE_NOTIFICATION_EMAIL,
        subject: content.adminEmailSubject,
        text: content.adminEmailText,
        html: content.adminEmailHtml,
      });
      results.push({ channel: "admin_email", ...adminEmailResult });
    } catch (error) {
      console.error(`${DELIVERY_LOG_PREFIX} Admin email delivery failed for ${type}.`, error);
      failures.push({ channel: "admin_email", error });
    }
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`${DELIVERY_LOG_PREFIX} Notifications are delivered directly through Brevo.`);
}
