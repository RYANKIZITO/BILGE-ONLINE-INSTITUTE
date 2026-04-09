import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import multer from "multer";
import {
  CAREER_EMAIL_ATTACHMENT_MAX_TOTAL_BYTES,
  CAREER_EMAIL_ATTACHMENT_MAX_TOTAL_LABEL,
  getCareerApplicationTotalBytes,
} from "../modules/website/career-application.constants.js";

const uploadDir = path.join(process.cwd(), "uploads");
const lessonVideoTempDir = path.join(process.cwd(), "tmp", "lesson-videos");
const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const allowedVideoExts = new Set([".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv"]);
const allowedVideoMimes = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "video/x-msvideo",
  "video/x-matroska",
]);

const allowedDocxExts = new Set([".docx"]);
const allowedDocxMimes = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const allowedCareerDocExts = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".rtf",
  ".txt",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
]);
const allowedCareerDocMimes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const allowedCareerVideoExts = new Set([".mp4", ".webm", ".mov", ".m4v"]);
const allowedCareerVideoMimes = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
]);
const allowedStandardImageExts = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const allowedStandardImageMimes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const allowedHeicImageExts = new Set([".heic", ".heif"]);
const allowedHeicImageMimes = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "application/octet-stream",
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const destinationDir =
      file.fieldname === "videoFile" ? lessonVideoTempDir : uploadDir;

    fs.mkdirSync(destinationDir, { recursive: true });
    cb(null, destinationDir);
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();

    const base = path
      .basename(file.originalname || "", ext)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const safeBase =
      base ||
      (file.fieldname === "docxFile"
        ? "docx"
        : file.fieldname === "resumeFile"
          ? "resume"
          : file.fieldname === "profilePhoto"
            ? "profile-photo"
          : file.fieldname === "introVideo"
            ? "intro-video"
          : file.fieldname === "supportingDocuments"
            ? "document"
            : "video");

    const uniqueId =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : crypto.randomBytes(16).toString("hex");

    cb(null, `${Date.now()}-${safeBase}-${uniqueId}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();

    if (file.fieldname === "docxFile") {
      if (!allowedDocxExts.has(ext) || !allowedDocxMimes.has(file.mimetype)) {
        req.fileValidationError = "Only .docx files are allowed.";
        return cb(null, false);
      }

      return cb(null, true);
    }

    if (!allowedVideoExts.has(ext) || !allowedVideoMimes.has(file.mimetype)) {
      req.fileValidationError =
        "Only common video files are allowed: mp4, webm, mov, m4v, avi, or mkv.";
      return cb(null, false);
    }

    return cb(null, true);
  },
});

const resolveFfmpegPath = () => {
  const configured = String(process.env.FFMPEG_PATH || "").trim();
  const candidates = [
    configured,
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
    path.join(process.cwd(), "tools", "ffmpeg", "bin", "ffmpeg.exe"),
    path.join(process.cwd(), "tools", "ffmpeg", "bin", "ffmpeg"),
    "ffmpeg",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === "ffmpeg" || fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return "ffmpeg";
};

const runFfmpeg = (ffmpegPath, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
      if (stderr.length > 12000) {
        stderr = stderr.slice(-12000);
      }
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });

const removeUploadedFile = async (filePath) => {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("Failed to clean up uploaded file", error);
    }
  }
};

const isHeicImageFile = (file) => {
  const ext = path.extname(file?.originalname || file?.filename || "").toLowerCase();
  const mime = String(file?.mimetype || "").toLowerCase();
  return allowedHeicImageExts.has(ext) || allowedHeicImageMimes.has(mime);
};

const isAllowedProfilePhoto = (file) => {
  const ext = path.extname(file?.originalname || "").toLowerCase();
  const mime = String(file?.mimetype || "").toLowerCase();

  if (allowedStandardImageExts.has(ext)) {
    return allowedStandardImageMimes.has(mime);
  }

  if (allowedHeicImageExts.has(ext)) {
    return allowedHeicImageMimes.has(mime) || mime === "";
  }

  return false;
};

const convertHeicProfilePhotoToJpeg = async (file) => {
  const ffmpegPath = resolveFfmpegPath();
  const parsed = path.parse(file.path);
  const outputPath = path.join(parsed.dir, `${parsed.name}.jpg`);

  try {
    await runFfmpeg(ffmpegPath, [
      "-y",
      "-i",
      file.path,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outputPath,
    ]);
  } catch (error) {
    await removeUploadedFile(outputPath);
    throw error;
  }

  const stats = await fs.promises.stat(outputPath);
  if (!stats.size) {
    throw new Error("Converted profile photo is empty.");
  }

  await removeUploadedFile(file.path);

  file.path = outputPath;
  file.filename = path.basename(outputPath);
  file.mimetype = "image/jpeg";
  file.size = stats.size;

  return file;
};

const profilePhotoUpload = multer({
  storage,
  limits: { fileSize: PROFILE_PHOTO_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (!isAllowedProfilePhoto(file)) {
      req.fileValidationError =
        "Only profile photos in JPG, PNG, WebP, HEIC, or HEIF format are allowed.";
      return cb(null, false);
    }

    return cb(null, true);
  },
});

const careerDocumentUpload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 6,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();

    if (file.fieldname === "introVideo") {
      if (!allowedCareerVideoExts.has(ext) || !allowedCareerVideoMimes.has(file.mimetype)) {
        req.fileValidationError =
          "Intro videos must be MP4, WebM, MOV, or M4V and 10MB or less.";
        return cb(null, false);
      }

      return cb(null, true);
    }

    if (!allowedCareerDocExts.has(ext) || !allowedCareerDocMimes.has(file.mimetype)) {
      req.fileValidationError =
        "Only PDF, DOC, DOCX, RTF, TXT, JPG, PNG, or WebP files up to 10MB are allowed.";
      return cb(null, false);
    }

    return cb(null, true);
  },
});

export const uploadLessonVideo = (req, res, next) => {
  upload.fields([
    { name: "videoFile", maxCount: 1 },
    { name: "docxFile", maxCount: 1 },
  ])(req, res, (err) => {
    if (err) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "File is too large. Max size is 500MB."
          : "File upload failed. Please try again.";

      req.session.flash = { type: "error", message };
      const backTo = req.get("referer") || "/instructor/dashboard";
      return res.redirect(backTo);
    }

    if (req.fileValidationError) {
      req.session.flash = { type: "error", message: req.fileValidationError };
      const backTo = req.get("referer") || "/instructor/dashboard";
      return res.redirect(backTo);
    }

    return next();
  });
};

export const uploadProfilePhoto = (req, res, next) => {
  profilePhotoUpload.single("profilePhoto")(req, res, async (err) => {
    if (err) {
      req.fileValidationError =
        err.code === "LIMIT_FILE_SIZE"
          ? "Profile photo is larger than 5MB. Please choose an image under 5MB."
          : "Profile photo upload failed. Please try again.";

      return next();
    }

    if (req.file && isHeicImageFile(req.file)) {
      try {
        await convertHeicProfilePhotoToJpeg(req.file);
      } catch (error) {
        await removeUploadedFile(req.file.path);
        req.file = undefined;
        req.fileValidationError =
          "HEIC/HEIF photos are supported, but this image could not be processed right now. Please try a JPG or PNG photo.";
      }
    }

    return next();
  });
};

export const uploadCareerApplicationFiles = (req, res, next) => {
  careerDocumentUpload.fields([
    { name: "resumeFile", maxCount: 1 },
    { name: "introVideo", maxCount: 1 },
    { name: "supportingDocuments", maxCount: 4 },
  ])(req, res, (err) => {
    if (err) {
      req.fileValidationError =
        err.code === "LIMIT_FILE_SIZE"
          ? "One of the uploaded files is too large. Each file must be 10MB or less."
          : err.code === "LIMIT_FILE_COUNT"
            ? "You can upload up to 1 resume, 1 intro video, and 4 supporting documents."
            : "Document upload failed. Please review your files and try again.";
    }

    if (!req.fileValidationError) {
      const totalUploadBytes = getCareerApplicationTotalBytes({
        resumeFile: req.files?.resumeFile?.[0] || null,
        introVideo: req.files?.introVideo?.[0] || null,
        supportingDocuments: req.files?.supportingDocuments || [],
      });

      if (totalUploadBytes > CAREER_EMAIL_ATTACHMENT_MAX_TOTAL_BYTES) {
        req.fileValidationError = `Career application uploads must be ${CAREER_EMAIL_ATTACHMENT_MAX_TOTAL_LABEL} or less in total because they are delivered as email attachments.`;
      }
    }

    return next();
  });
};
