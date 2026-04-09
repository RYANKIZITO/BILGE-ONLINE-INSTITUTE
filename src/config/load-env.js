import fs from "fs";
import path from "path";

const ENV_PATH = path.join(process.cwd(), ".env");

const normalizeEnvValue = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  const isWrappedInDoubleQuotes = trimmed.startsWith("\"") && trimmed.endsWith("\"");
  const isWrappedInSingleQuotes = trimmed.startsWith("'") && trimmed.endsWith("'");

  if (isWrappedInDoubleQuotes || isWrappedInSingleQuotes) {
    const innerValue = trimmed.slice(1, -1);
    return innerValue
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t");
  }

  return trimmed;
};

try {
  if (fs.existsSync(ENV_PATH)) {
    const fileContent = fs.readFileSync(ENV_PATH, "utf8");

    fileContent.split(/\r?\n/).forEach((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith("#")) {
        return;
      }

      const separatorIndex = trimmedLine.indexOf("=");
      if (separatorIndex <= 0) {
        return;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();
      const existingValue = process.env[key];
      const hasUsableExistingValue = String(existingValue || "").trim() !== "";

      if (!key || hasUsableExistingValue) {
        return;
      }

      const rawValue = trimmedLine.slice(separatorIndex + 1);
      process.env[key] = normalizeEnvValue(rawValue);
    });
  }
} catch (error) {
  console.warn("[env-loader] Failed to load .env file:", error);
}
