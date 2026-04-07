import fs from "fs";
import path from "path";
import { Upload } from "tus-js-client";

const CLOUDFLARE_API_BASE_URL = "https://api.cloudflare.com/client/v4";
const STREAM_CHUNK_SIZE_BYTES = 50 * 1024 * 1024;
const STREAM_RETRY_DELAYS_MS = [0, 3000, 5000, 10000, 20000];
const STREAM_URL_PATTERN =
  /^https?:\/\/([^/]+\.(?:cloudflarestream\.com|videodelivery\.net))\/([a-z0-9]{32,})(?:\/[^?#]*)?(?:[?#].*)?$/i;

const normalizeString = (value) => String(value || "").trim();

const getCloudflareStreamConfig = () => {
  const accountId = normalizeString(
    process.env.CLOUDFLARE_STREAM_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID
  );
  const apiToken = normalizeString(
    process.env.CLOUDFLARE_STREAM_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN
  );

  if (!accountId || !apiToken) {
    throw new Error(
      "Cloudflare Stream is not configured. Add CLOUDFLARE_STREAM_ACCOUNT_ID and CLOUDFLARE_STREAM_API_TOKEN before uploading lesson videos."
    );
  }

  return { accountId, apiToken };
};

const buildCloudflareStreamApiUrl = (accountId, resourcePath) =>
  `${CLOUDFLARE_API_BASE_URL}/accounts/${accountId}/stream${resourcePath}`;

const decodeHtmlAttribute = (value) =>
  String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');

const extractCloudflareApiErrorMessage = async (response) => {
  const fallback = `Cloudflare Stream request failed with ${response.status} ${response.statusText}.`;
  const rawBody = await response.text();

  if (!rawBody) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawBody);
    const apiErrors = Array.isArray(parsed?.errors)
      ? parsed.errors
          .map((item) => normalizeString(item?.message))
          .filter(Boolean)
      : [];

    if (apiErrors.length > 0) {
      return apiErrors.join(" ");
    }

    if (typeof parsed?.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    // Fall back to raw response text when the body is not JSON.
  }

  return rawBody.trim() || fallback;
};

const removeLocalUploadFile = async (filePath) => {
  const normalizedPath = normalizeString(filePath);
  if (!normalizedPath) {
    return;
  }

  try {
    await fs.promises.unlink(normalizedPath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("Failed to remove temporary lesson upload", error);
    }
  }
};

const getUploadSize = (videoFile) => {
  const declaredSize = Number(videoFile?.size || 0);
  if (Number.isFinite(declaredSize) && declaredSize > 0) {
    return declaredSize;
  }

  const filePath = normalizeString(videoFile?.path);
  if (!filePath) {
    return 0;
  }

  return fs.statSync(filePath).size;
};

const encodeTusMetadata = (metadata) =>
  Object.entries(metadata)
    .map(([key, value]) => [key, normalizeString(value)])
    .filter(([, value]) => value)
    .map(([key, value]) => `${key} ${Buffer.from(value).toString("base64")}`)
    .join(",");

const resolveMaxDurationSeconds = (options = {}) => {
  const requestedDuration = Number(options.maxDurationSeconds || 0);
  if (Number.isFinite(requestedDuration) && requestedDuration > 0) {
    return Math.max(1, Math.floor(requestedDuration));
  }

  const configuredDuration = Number(
    process.env.CLOUDFLARE_STREAM_MAX_DURATION_SECONDS || 14400
  );

  if (Number.isFinite(configuredDuration) && configuredDuration > 0) {
    return Math.max(1, Math.floor(configuredDuration));
  }

  return 14400;
};

const buildCloudflarePlaybackUrls = (rawUrl) => {
  const value = normalizeString(rawUrl);
  const match = value.match(STREAM_URL_PATTERN);

  if (!match) {
    return null;
  }

  const protocolMatch = value.match(/^https?:\/\//i);
  const protocol = protocolMatch ? protocolMatch[0].slice(0, -2) : "https";
  const origin = `${protocol}://${match[1]}`;
  const uid = match[2];

  return {
    uid,
    origin,
    iframeUrl: `${origin}/${uid}/iframe`,
    watchUrl: `${origin}/${uid}/watch`,
    manifestUrl: `${origin}/${uid}/manifest/video.m3u8`,
  };
};

const getCloudflareStreamEmbedHtml = async (uid) => {
  const { accountId, apiToken } = getCloudflareStreamConfig();
  const response = await fetch(buildCloudflareStreamApiUrl(accountId, `/${uid}/embed`), {
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await extractCloudflareApiErrorMessage(response));
  }

  return response.text();
};

const getCloudflareStreamVideoDetails = async (uid) => {
  const { accountId, apiToken } = getCloudflareStreamConfig();
  const response = await fetch(buildCloudflareStreamApiUrl(accountId, `/${uid}`), {
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await extractCloudflareApiErrorMessage(response));
  }

  const payload = await response.json();
  if (!payload?.result) {
    throw new Error("Cloudflare Stream did not return video details for the uploaded lesson.");
  }

  return payload.result;
};

const getPlaybackUrlsFromEmbedHtml = (html) => {
  const iframeSrcMatch = String(html || "").match(/\bsrc=(["'])(.*?)\1/i);
  if (!iframeSrcMatch) {
    return null;
  }

  return buildCloudflarePlaybackUrls(decodeHtmlAttribute(iframeSrcMatch[2]));
};

const getPlaybackUrlsFromVideoDetails = async (uid) => {
  const details = await getCloudflareStreamVideoDetails(uid);
  const detailCandidates = [details.preview, details.thumbnail]
    .map((item) => buildCloudflarePlaybackUrls(item))
    .filter(Boolean);

  if (detailCandidates.length > 0) {
    return {
      ...detailCandidates[0],
      readyToStream: details.readyToStream === true,
      status: normalizeString(details.status?.state || details.status),
    };
  }

  const embedHtml = await getCloudflareStreamEmbedHtml(uid);
  const embedUrls = getPlaybackUrlsFromEmbedHtml(embedHtml);

  if (!embedUrls) {
    throw new Error(
      "Cloudflare Stream upload completed, but the playback URL could not be determined."
    );
  }

  return {
    ...embedUrls,
    readyToStream: details.readyToStream === true,
    status: normalizeString(details.status?.state || details.status),
  };
};

const provisionCloudflareTusUpload = async (videoFile, options = {}) => {
  const { accountId, apiToken } = getCloudflareStreamConfig();
  const uploadSize = getUploadSize(videoFile);
  const filePath = normalizeString(videoFile?.path);
  const fallbackName = path.basename(filePath);
  const videoName =
    normalizeString(options.videoName) ||
    normalizeString(videoFile?.originalname) ||
    fallbackName;
  const mimeType = normalizeString(videoFile?.mimetype) || "application/octet-stream";
  const creatorId = normalizeString(options.creatorId);
  const response = await fetch(
    `${buildCloudflareStreamApiUrl(accountId, "")}?direct_user=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(uploadSize),
        "Upload-Metadata": encodeTusMetadata({
          name: videoName,
          filetype: mimeType,
          creator: creatorId,
          maxDurationSeconds: String(resolveMaxDurationSeconds(options)),
        }),
      },
    }
  );

  if (!response.ok) {
    throw new Error(await extractCloudflareApiErrorMessage(response));
  }

  const uploadUrl = normalizeString(response.headers.get("Location"));
  const mediaId = normalizeString(response.headers.get("stream-media-id"));

  if (!uploadUrl) {
    throw new Error(
      "Cloudflare Stream did not return a resumable upload URL for this lesson video."
    );
  }

  return {
    uploadUrl,
    mediaId,
  };
};

export const parseCloudflareStreamVideoUrl = (rawUrl) =>
  buildCloudflarePlaybackUrls(rawUrl);

export const isCloudflareStreamVideoUrl = (rawUrl) =>
  Boolean(parseCloudflareStreamVideoUrl(rawUrl));

export const uploadLessonVideoToCloudflareStream = async (videoFile, options = {}) => {
  const filePath = normalizeString(videoFile?.path);

  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("Uploaded lesson video was not found on disk.");
  }

  const uploadSize = getUploadSize(videoFile);

  let mediaId = "";

  try {
    const provisionedUpload = await provisionCloudflareTusUpload(videoFile, options);
    mediaId = provisionedUpload.mediaId || mediaId;
    const fileStream = fs.createReadStream(filePath);

    await new Promise((resolve, reject) => {
      const upload = new Upload(fileStream, {
        uploadUrl: provisionedUpload.uploadUrl,
        chunkSize: STREAM_CHUNK_SIZE_BYTES,
        retryDelays: STREAM_RETRY_DELAYS_MS,
        uploadSize,
        removeFingerprintOnSuccess: true,
        onError: (error) => {
          reject(error);
        },
        onSuccess: () => {
          resolve();
        },
        onAfterResponse: (_req, res) => {
          return Promise.resolve().then(() => {
            const mediaIdHeader = res?.getHeader?.("stream-media-id");
            if (mediaIdHeader) {
              mediaId = normalizeString(mediaIdHeader);
            }
          });
        },
      });

      upload.start();
    });

    if (!mediaId) {
      throw new Error(
        "Cloudflare Stream accepted the upload, but did not return a media ID."
      );
    }

    const playback = await getPlaybackUrlsFromVideoDetails(mediaId);

    return {
      mediaId,
      ...playback,
    };
  } catch (error) {
    if (mediaId) {
      await deleteCloudflareStreamVideoByUrl(`https://customer.cloudflarestream.com/${mediaId}/watch`).catch(
        (cleanupError) => {
          console.error(
            "Failed to clean up Cloudflare Stream video after upload error",
            cleanupError
          );
        }
      );
    }

    throw new Error(
      normalizeString(error?.message) ||
        "Lesson video upload to Cloudflare Stream failed."
    );
  } finally {
    await removeLocalUploadFile(filePath);
  }
};

export const deleteCloudflareStreamVideoByUrl = async (rawUrl) => {
  const parsed = parseCloudflareStreamVideoUrl(rawUrl);
  if (!parsed) {
    return false;
  }

  const { accountId, apiToken } = getCloudflareStreamConfig();
  const response = await fetch(buildCloudflareStreamApiUrl(accountId, `/${parsed.uid}`), {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  });

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    throw new Error(await extractCloudflareApiErrorMessage(response));
  }

  return true;
};
