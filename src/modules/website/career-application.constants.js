export const CAREER_EMAIL_ATTACHMENT_MAX_TOTAL_BYTES = 15 * 1024 * 1024;
export const CAREER_EMAIL_ATTACHMENT_MAX_TOTAL_LABEL = "15MB";

export const getCareerApplicationFileList = ({
  resumeFile = null,
  introVideo = null,
  supportingDocuments = [],
} = {}) =>
  [resumeFile, introVideo, ...(Array.isArray(supportingDocuments) ? supportingDocuments : [])]
    .filter(Boolean);

export const getCareerApplicationTotalBytes = (files = {}) =>
  getCareerApplicationFileList(files).reduce(
    (total, file) => total + Math.max(0, Number(file?.size) || 0),
    0
  );
