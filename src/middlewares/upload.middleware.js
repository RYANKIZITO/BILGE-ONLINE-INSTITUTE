import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";

const uploadDir = path.join(process.cwd(), "uploads");
const lessonVideoTempDir = path.join(process.cwd(), "tmp", "lesson-videos");

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
const allowedImageExts = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const allowedImageMimes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
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

const profilePhotoUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();

    if (!allowedImageExts.has(ext) || !allowedImageMimes.has(file.mimetype)) {
      req.fileValidationError =
        "Only profile photos in JPG, PNG, or WebP format are allowed.";
      return cb(null, false);
    }

    return cb(null, true);
  },
});

const careerDocumentUpload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 5,
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
  profilePhotoUpload.single("profilePhoto")(req, res, (err) => {
    if (err) {
      req.fileValidationError =
        err.code === "LIMIT_FILE_SIZE"
          ? "Profile photo is too large. Max size is 5MB."
          : "Profile photo upload failed. Please try again.";
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
          : "Document upload failed. Please review your files and try again.";
    }

    return next();
  });
};
