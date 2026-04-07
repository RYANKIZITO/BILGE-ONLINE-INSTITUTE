const CATEGORY_THEME_MAP = {
  "Tech & Digital Skills": {
    accent: "#6fa8ff",
    accentSoft: "#8dc7ff",
    accentDark: "#183a6d",
    glow: "#1b4f9c",
  },
  "Business & Management": {
    accent: "#c9a34a",
    accentSoft: "#e4c57a",
    accentDark: "#5a4320",
    glow: "#8d6a25",
  },
  "Finance & Professional Services": {
    accent: "#54b5a6",
    accentSoft: "#93dccf",
    accentDark: "#174e49",
    glow: "#217c73",
  },
  "Marketing & Communications": {
    accent: "#d97d56",
    accentSoft: "#f0b192",
    accentDark: "#5b291d",
    glow: "#9a4e32",
  },
  "Personal & Professional Development": {
    accent: "#b678d8",
    accentSoft: "#dcb1ef",
    accentDark: "#4b255d",
    glow: "#7d42a3",
  },
  "Emerging / Future-Focused Domains": {
    accent: "#64cfc3",
    accentSoft: "#9ef0e7",
    accentDark: "#174740",
    glow: "#258a80",
  },
  "Language & Communication": {
    accent: "#d66c88",
    accentSoft: "#f0a7ba",
    accentDark: "#592437",
    glow: "#9a3e5b",
  },
  "Soft Skills & Life Skills": {
    accent: "#79b66d",
    accentSoft: "#b7e0a8",
    accentDark: "#284a23",
    glow: "#4b7f41",
  },
  Education: {
    accent: "#7b92d8",
    accentSoft: "#b7c5f1",
    accentDark: "#2c3560",
    glow: "#495ea7",
  },
  Sustainability: {
    accent: "#5ea16e",
    accentSoft: "#9fdbab",
    accentDark: "#203f28",
    glow: "#397548",
  },
  General: {
    accent: "#c9a34a",
    accentSoft: "#e4c57a",
    accentDark: "#5a4320",
    glow: "#8d6a25",
  },
};

const escapeXml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const splitTitle = (title, maxLength = 24) => {
  const words = String(title || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
      continue;
    }

    if (`${currentLine} ${word}`.length <= maxLength) {
      currentLine = `${currentLine} ${word}`;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;

    if (lines.length === 2) {
      break;
    }
  }

  if (currentLine && lines.length < 3) {
    lines.push(currentLine);
  }

  if (words.length && lines.length === 0) {
    lines.push(words.join(" "));
  }

  return lines.slice(0, 3);
};

const getVariantSize = (variant) =>
  variant === "hero"
    ? { width: 1600, height: 900, titleSize: 62, brandSize: 24 }
    : { width: 1200, height: 1500, titleSize: 72, brandSize: 22 };

export const renderProgrammeCoverSvg = ({
  title,
  category = "General",
  variant = "card",
}) => {
  const theme = CATEGORY_THEME_MAP[category] || CATEGORY_THEME_MAP.General;
  const size = getVariantSize(variant);
  const safeTitle = escapeXml(title);
  const safeCategory = escapeXml(category);
  const safeCategoryLabel = escapeXml(String(category || "General").toUpperCase());
  const titleLines = splitTitle(title, variant === "hero" ? 30 : 24);
  const startY = variant === "hero" ? 330 : 520;
  const lineHeight = variant === "hero" ? 84 : 96;

  const titleMarkup = titleLines
    .map(
      (line, index) =>
        `<text x="90" y="${startY + index * lineHeight}" fill="#F7F3EB" font-size="${size.titleSize}" font-family="Georgia, Times New Roman, serif" font-weight="700">${escapeXml(line)}</text>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}" role="img" aria-label="${safeTitle}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0B0B0B" />
      <stop offset="55%" stop-color="#151515" />
      <stop offset="100%" stop-color="#1B1B1B" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.accentSoft}" />
      <stop offset="100%" stop-color="${theme.accent}" />
    </linearGradient>
    <radialGradient id="glow" cx="72%" cy="18%" r="48%">
      <stop offset="0%" stop-color="${theme.glow}" stop-opacity="0.48" />
      <stop offset="100%" stop-color="${theme.glow}" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="${size.width}" height="${size.height}" rx="38" fill="url(#bg)" />
  <rect width="${size.width}" height="${size.height}" rx="38" fill="url(#glow)" />
  <circle cx="${variant === "hero" ? 1300 : 910}" cy="${variant === "hero" ? 170 : 220}" r="${variant === "hero" ? 210 : 180}" fill="${theme.accent}" fill-opacity="0.12" />
  <circle cx="${variant === "hero" ? 1460 : 1040}" cy="${variant === "hero" ? 280 : 360}" r="${variant === "hero" ? 120 : 110}" fill="${theme.accentSoft}" fill-opacity="0.14" />
  <rect x="90" y="${variant === "hero" ? 90 : 110}" width="${variant === "hero" ? 360 : 320}" height="44" rx="22" fill="${theme.accent}" fill-opacity="0.18" stroke="${theme.accent}" stroke-opacity="0.35" />
  <text x="120" y="${variant === "hero" ? 120 : 140}" fill="${theme.accentSoft}" font-size="20" font-family="Segoe UI, Arial, sans-serif" font-weight="700" letter-spacing="2">${safeCategoryLabel}</text>
  <rect x="90" y="${variant === "hero" ? 660 : 1050}" width="${variant === "hero" ? 360 : 320}" height="4" rx="2" fill="url(#accent)" />
  ${titleMarkup}
  <text x="90" y="${variant === "hero" ? 760 : 1160}" fill="#CFC6B6" font-size="28" font-family="Segoe UI, Arial, sans-serif">Bilge Online Institute</text>
  <text x="90" y="${variant === "hero" ? 810 : 1210}" fill="#A89F91" font-size="22" font-family="Segoe UI, Arial, sans-serif">Premium digital learning with institutional depth</text>
  <text x="${size.width - 90}" y="${size.height - 72}" text-anchor="end" fill="${theme.accentSoft}" font-size="${size.brandSize}" font-family="Segoe UI, Arial, sans-serif" font-weight="700" letter-spacing="3">BILGE</text>
  <text x="${size.width - 90}" y="${size.height - 40}" text-anchor="end" fill="#A89F91" font-size="18" font-family="Segoe UI, Arial, sans-serif">Programme Cover</text>
</svg>`;
};
