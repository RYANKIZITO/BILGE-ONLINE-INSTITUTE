export const DEFAULT_LANGUAGE_PREFERENCE = "en";

const LANGUAGE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z]{2})?$/;

export const normalizeLanguagePreference = (value, { fallback = null } = {}) => {
  const trimmed = String(value || "").trim();
  if (!trimmed || !LANGUAGE_PATTERN.test(trimmed)) {
    return fallback;
  }

  const [base, region] = trimmed.split("-");
  return region ? `${base.toLowerCase()}-${region.toUpperCase()}` : base.toLowerCase();
};
