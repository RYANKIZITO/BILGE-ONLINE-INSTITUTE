const normalizeString = (value) => String(value || "").trim();

const hasRenderUrl = () => Boolean(normalizeString(process.env.RENDER_EXTERNAL_URL));

const isLocalhostUrl = (value) => /https?:\/\/(localhost|127(?:\.\d{1,3}){3})[:/]/i.test(String(value || ""));

export const getPublicAppUrl = () => {
  const renderUrl = normalizeString(process.env.RENDER_EXTERNAL_URL);
  const appUrl = normalizeString(process.env.APP_URL);
  const resolved = renderUrl || appUrl;

  if (!resolved) {
    throw new Error("APP_URL or RENDER_EXTERNAL_URL not configured");
  }

  return resolved.replace(/\/+$/, "");
};

export const resolvePublicUrl = (explicitValue, fallbackPath) => {
  const normalized = normalizeString(explicitValue);
  const appUrl = getPublicAppUrl();

  if (!normalized) {
    return `${appUrl}${fallbackPath}`;
  }

  if (hasRenderUrl() && isLocalhostUrl(normalized)) {
    return `${appUrl}${fallbackPath}`;
  }

  return normalized;
};
