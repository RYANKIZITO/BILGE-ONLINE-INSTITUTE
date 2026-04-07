import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const STREAM_SUFFIX = "-stream.mp4";
const STREAM_VIDEO_FILTER =
  "scale='min(960,iw)':'min(540,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";

const normalizeUploadUrl = (rawUrl) => {
  const value = String(rawUrl || "").trim();
  if (!value) return null;

  const uploadsMatch =
    value.match(/[\\/]+uploads[\\/]+(.+)$/i) || value.match(/^uploads[\\/]+(.+)$/i);

  if (uploadsMatch) {
    return `/uploads/${uploadsMatch[1].replace(/\\/g, "/")}`;
  }

  if (value.startsWith("/uploads/")) {
    return value;
  }

  if (value.startsWith("uploads/")) {
    return `/${value}`;
  }

  return null;
};

const getUploadAbsolutePath = (uploadUrl) => {
  const normalized = normalizeUploadUrl(uploadUrl);
  if (!normalized) return null;

  const relativePath = normalized.replace(/^\/uploads\//i, "");
  return path.join(UPLOADS_DIR, relativePath);
};

const getProcessedOutputPath = (inputPath) => {
  const parsed = path.parse(inputPath);
  if (parsed.base.toLowerCase().endsWith(STREAM_SUFFIX)) {
    return inputPath;
  }

  return path.join(parsed.dir, `${parsed.name}${STREAM_SUFFIX}`);
};

const getSourceInputPath = (requestedPath) => {
  const parsed = path.parse(requestedPath);

  if (!parsed.base.toLowerCase().endsWith(STREAM_SUFFIX)) {
    return requestedPath;
  }

  const originalPath = path.join(
    parsed.dir,
    parsed.base.replace(/-stream\.mp4$/i, ".mp4")
  );
  if (fs.existsSync(originalPath) && fs.statSync(originalPath).size > 0) {
    return originalPath;
  }

  return requestedPath;
};

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

const toPublicUploadUrl = (absolutePath) => {
  const relativePath = path.relative(UPLOADS_DIR, absolutePath).replace(/\\/g, "/");
  return `/uploads/${relativePath}`;
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

export const validateExternalLessonVideoUrl = (rawUrl) => {
  const value = String(rawUrl || "").trim();

  if (!value) {
    return null;
  }

  if (
    /^https?:\/\/[^/]+\.(?:cloudflarestream\.com|videodelivery\.net)\/[a-z0-9]{32,}\//i.test(
      value
    )
  ) {
    return null;
  }

  if (
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/)|vimeo\.com\/(?:video\/)?\d+)/i.test(
      value
    )
  ) {
    return null;
  }

  if (/\.(mp4|webm|ogg)(\?|#|$)/i.test(value)) {
    return null;
  }

  return "Use YouTube/Vimeo, a direct video file URL, or upload a video file so the system can send it to Cloudflare automatically.";
};

export const transcodeLessonUploadToStream = async (uploadUrl, options = {}) => {
  const force = options.force === true;
  const requestedPath = getUploadAbsolutePath(uploadUrl);
  if (!requestedPath || !fs.existsSync(requestedPath)) {
    throw new Error("Uploaded lesson video was not found on disk.");
  }

  // Keep the instructor's original upload untouched and write the streamable copy beside it.
  const inputPath = getSourceInputPath(requestedPath);
  const outputPath = getProcessedOutputPath(inputPath);
  if (!force && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
    return {
      inputPath,
      outputPath,
      sourceVideoUrl: toPublicUploadUrl(inputPath),
      videoUrl: toPublicUploadUrl(outputPath),
      alreadyProcessed: true,
    };
  }

  const ffmpegPath = resolveFfmpegPath();

  try {
    await runFfmpeg(ffmpegPath, [
      "-y",
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-profile:v",
      "main",
      "-crf",
      "25",
      "-vf",
      STREAM_VIDEO_FILTER,
      "-maxrate",
      "1800k",
      "-bufsize",
      "3600k",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "48",
      "-keyint_min",
      "48",
      "-sc_threshold",
      "0",
      "-movflags",
      "+faststart",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-ac",
      "2",
      outputPath,
    ]);
  } catch (error) {
    throw new Error(
      "Automatic video conversion is not available yet. Install ffmpeg or set FFMPEG_PATH so uploaded lesson videos can be processed."
    );
  }

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error("Automatic video conversion did not produce a playable output file.");
  }

  return {
    inputPath,
    outputPath,
    sourceVideoUrl: toPublicUploadUrl(inputPath),
    videoUrl: toPublicUploadUrl(outputPath),
    alreadyProcessed: false,
  };
};

export const shouldRepairUploadedLessonVideo = (rawUrl) => {
  const normalized = normalizeUploadUrl(rawUrl);
  return Boolean(normalized);
};
