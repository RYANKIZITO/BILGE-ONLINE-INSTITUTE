import multer from "multer";
import path from "path";
import fs from "fs";

const uploadsDir = path.resolve("uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ext || ".jpg";

    const filename =
      "certificate-photo-" +
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      safeExt;

    cb(null, filename);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [".jpg", ".jpeg", ".png", ".webp"];
  const ext = path.extname(file.originalname || "").toLowerCase();

  if (!allowed.includes(ext)) {
    return cb(new Error("Only JPG, JPEG, PNG and WEBP images are allowed"));
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

export default upload.single("photo");