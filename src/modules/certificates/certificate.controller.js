import { computeFinalCourseMark } from "../assessments/assessment.grading.service.js";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import puppeteer from "puppeteer";
import QRCode from "qrcode";
import { prisma } from "../../config/prisma.js";
import {
  ensureCertificateForCourseSlug,
  getStudentCertificateNumber,
} from "./certificate.service.js";

const PDF_BROWSER_PROFILE_DIR = path.join(process.cwd(), ".chrome-pdf-profile");

const getCertificateByVerificationCode = async (verificationCode) => {
  return prisma.certificate.findUnique({
    where: { verificationCode },
    select: {
      id: true,
      verificationCode: true,
      certificateNumber: true,
      issuedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          fullName: true,
          studentCode: true,
          email: true,
          dateOfBirth: true,
          parentNames: true,
          profilePhotoUrl: true,
        },
      },
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          instructor: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });
};

const getCertificateTranscript = async (courseId, studentId) => {
  const assessments = await prisma.assessment.findMany({
    where: {
      courseId,
      published: true,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      type: true,
      maxScore: true,
    },
  });

  const submissions = await prisma.assessmentSubmission.findMany({
    where: {
      studentId,
      assessment: { courseId },
    },
    orderBy: [{ assessmentId: "asc" }, { attempt: "desc" }],
    select: {
      assessmentId: true,
      score: true,
      attempt: true,
      submittedAt: true,
    },
  });

  const bestByAssessmentId = new Map();

  for (const submission of submissions) {
    const existing = bestByAssessmentId.get(submission.assessmentId);

    if (!existing || Number(submission.score || 0) > Number(existing.score || 0)) {
      bestByAssessmentId.set(submission.assessmentId, submission);
    }
  }

  return assessments.map((assessment) => {
    const best = bestByAssessmentId.get(assessment.id);

    return {
      title: assessment.title,
      type: assessment.type,
      maxScore: assessment.maxScore,
      score: best?.score ?? null,
      attempt: best?.attempt ?? null,
      submittedAt: best?.submittedAt ?? null,
    };
  });
};

const getCgpaFromMark = (score) => {
  const numericScore = Number(score) || 0;
  if (numericScore >= 80) return 4.0;
  if (numericScore >= 75) return 3.5;
  if (numericScore >= 70) return 3.0;
  if (numericScore >= 65) return 2.5;
  if (numericScore >= 60) return 2.0;
  if (numericScore >= 55) return 1.5;
  if (numericScore >= 50) return 1.0;
  return 0.0;
};

const ensurePdfBrowserProfileDir = async () => {
  await fs.mkdir(PDF_BROWSER_PROFILE_DIR, { recursive: true });
};

const clearChromeLockFiles = async () => {
  const lockFiles = ["SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile"];

  for (const fileName of lockFiles) {
    await fs.rm(path.join(PDF_BROWSER_PROFILE_DIR, fileName), {
      force: true,
    }).catch(() => {});
  }
};

const resolveWindowsBrowserExecutable = () => {
  if (process.platform !== "win32") {
    return null;
  }

  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

const buildCertificateFileName = (certificate) => {
  const studentName = String(
    certificate?.user?.fullName || certificate?.user?.name || "student"
  )
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  const courseTitle = String(certificate?.course?.title || "certificate")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return `bilge-certificate-${studentName || "student"}-${courseTitle || "programme"}.pdf`;
};

const injectBaseHref = (html, baseUrl) => {
  if (!baseUrl || typeof html !== "string" || !html.includes("<head>")) {
    return html;
  }

  return html.replace("<head>", `<head>\n  <base href="${baseUrl}" />`);
};

const renderViewToHtml = (req, view, payload) =>
  new Promise((resolve, reject) => {
    req.app.render(view, payload, (error, html) => {
      if (error) {
        reject(error);
        return;
      }

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      resolve(injectBaseHref(html, baseUrl));
    });
  });

const buildCertificateRenderModel = async (req, verificationCode) => {
  let certificate = await getCertificateByVerificationCode(verificationCode);

  if (!certificate) {
    return null;
  }

  const certificateNumber = await getStudentCertificateNumber(certificate.user.id, certificate.user);

  if (certificate.certificateNumber !== certificateNumber) {
    await prisma.certificate.update({
      where: { id: certificate.id },
      data: { certificateNumber },
    });

    certificate = await getCertificateByVerificationCode(verificationCode);
  }

  const verifyUrl = `${req.protocol}://${req.get("host")}/verify/${certificate.verificationCode}`;
  const qrCodeUrl = await QRCode.toDataURL(verifyUrl, {
    width: 170,
    margin: 1,
    color: {
      dark: "#111111",
      light: "#ffffff",
    },
  });

  return {
    certificate,
    verifyUrl,
    qrCodeUrl,
  };
};

const generateCertificatePdfBuffer = async (html) => {
  await ensurePdfBrowserProfileDir();
  await clearChromeLockFiles();

  const executablePath = resolveWindowsBrowserExecutable();
  const browser = await puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    userDataDir: PDF_BROWSER_PROFILE_DIR,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--font-render-hinting=medium",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
    await page.setContent(html, {
      waitUntil: ["load", "networkidle0"],
    });

    return await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0mm",
        right: "0mm",
        bottom: "0mm",
        left: "0mm",
      },
    });
  } finally {
    await browser.close();
  }
};

export const showCertificateEntry = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { slug } = req.params;

    const result = await ensureCertificateForCourseSlug(slug, userId);

    if (!result.ok) {
      req.session.flash = {
        type: "error",
        message:
          result.reason === "mark_too_low"
            ? "You must achieve at least 50% final course mark to qualify for a certificate."
            : "Complete the course before requesting your certificate.",
      };

      return res.redirect("/student/dashboard");
    }

    return res.redirect(`/certificates/${result.certificate.verificationCode}`);
  } catch (err) {
    return next(err);
  } finally {
    req.session.flash = null;
  }
};

export const uploadCertificatePhoto = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { slug } = req.params;

    const result = await ensureCertificateForCourseSlug(slug, userId);

    if (!result.ok) {
      req.session.flash = {
        type: "error",
        message:
          result.reason === "mark_too_low"
            ? "You must achieve at least 50% final course mark to qualify for a certificate."
            : "Complete the course before requesting your certificate.",
      };

      return res.redirect("/student/dashboard");
    }

    req.session.flash = {
      type: "info",
      message: "Photo upload is no longer required. Your certificate is ready.",
    };

    return res.redirect(`/certificates/${result.certificate.verificationCode}`);
  } catch (err) {
    return next(err);
  }
};

export const showCertificate = async (req, res, next) => {
  try {
    const { verificationCode } = req.params;
    const model = await buildCertificateRenderModel(req, verificationCode);

    if (!model) {
      return res.status(404).send("Certificate not found");
    }

    return res.render("student/certificates/show", {
      layout: false,
      user: req.session?.user || null,
      certificate: model.certificate,
      qrCodeUrl: model.qrCodeUrl,
      verifyUrl: model.verifyUrl,
      flash: req.session?.flash || null,
      isPdf: req.query.pdf === "1" || req.query.pdf === "true",
    });
  } catch (err) {
    return next(err);
  } finally {
    if (req.session) {
      req.session.flash = null;
    }
  }
};
export const verifyPublicCertificate = async (req, res, next) => {
  try {
    const { verificationCode } = req.params;

    let certificate = await getCertificateByVerificationCode(verificationCode);

    if (!certificate) {
      return res.status(404).render("verify", {
        valid: false,
        cert: null,
        transcriptRows: [],
      });
    }

    const certificateNumber = await getStudentCertificateNumber(certificate.user.id, certificate.user);

    if (certificate.certificateNumber !== certificateNumber) {
      await prisma.certificate.update({
        where: { id: certificate.id },
        data: { certificateNumber },
      });

      certificate = await getCertificateByVerificationCode(verificationCode);
    }

    const transcriptRows = await getCertificateTranscript(
      certificate.course.id,
      certificate.user.id
    );
    const gradeSummary = await computeFinalCourseMark(
      certificate.course.id,
      certificate.user.id
    );

    return res.render("verify", {
      valid: true,
      cert: certificate,
      transcriptRows,
      finalCourseMark: gradeSummary?.finalCourseMark ?? null,
    });
  } catch (err) {
    return next(err);
  }
};

export const getStudentTranscriptPage = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { courseId } = req.params;

    const enrollment = await prisma.enrollment.findFirst({
      where: { userId, courseId },
      select: {
        userId: true,
        user: {
          select: {
            id: true,
            name: true,
            fullName: true,
            studentCode: true,
            profilePhotoUrl: true,
          },
        },
        course: {
          select: {
            id: true,
            title: true,
            instructor: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!enrollment) {
      return res.status(404).send("Transcript not found");
    }

    const transcriptRows = await getCertificateTranscript(courseId, userId);
    const gradeSummary = await computeFinalCourseMark(courseId, userId);
    const finalCourseMark = gradeSummary?.finalCourseMark ?? null;
    const cgpaValue =
      finalCourseMark === null || finalCourseMark === undefined
        ? null
        : getCgpaFromMark(finalCourseMark);

    return res.render("student/transcript/show", {
      user: req.session.user,
      student: enrollment.user,
      course: enrollment.course,
      transcriptRows,
      finalCourseMark,
      cgpaValue,
    });
  } catch (err) {
    return next(err);
  }
};

export const downloadCertificatePdf = async (req, res, next) => {
  try {
    const { verificationCode } = req.params;
    const model = await buildCertificateRenderModel(req, verificationCode);

    if (!model) {
      return res.status(404).send("Certificate not found");
    }

    const html = await renderViewToHtml(req, "student/certificates/show", {
      layout: false,
      user: req.session?.user || null,
      certificate: model.certificate,
      qrCodeUrl: model.qrCodeUrl,
      verifyUrl: model.verifyUrl,
      flash: null,
      isPdf: true,
      themePreference: req.session?.user?.themePreference || "light",
    });

    const pdfBuffer = await generateCertificatePdfBuffer(html);
    const fileName = buildCertificateFileName(model.certificate);

    res.status(200);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", String(pdfBuffer.length));
    res.setHeader("Content-Transfer-Encoding", "binary");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");

    return res.end(pdfBuffer);
  } catch (err) {
    return next(err);
  }
};
