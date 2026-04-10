const DEFAULT_PAGE_SIZE = 9;

const normalizeString = (value) => String(value || "").trim();
const normalizeUrl = (value) => {
  const input = normalizeString(value);
  if (!input) {
    return "";
  }

  if (/^https?:\/\//i.test(input)) {
    return input;
  }

  return `https://${input}`;
};

export const parseWebsiteListParams = (query = {}, options = {}) => {
  const pageSize = Number(options.pageSize) || DEFAULT_PAGE_SIZE;
  const pageValue = Number.parseInt(String(query.page || "1"), 10);
  const page = Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;
  const search = normalizeString(query.search);
  const category = normalizeString(query.category);
  const sort = normalizeString(query.sort).toLowerCase() || "featured";
  const readyFirst =
    String(query.ready_first || "")
      .trim()
      .toLowerCase() === "1";

  return {
    page,
    pageSize,
    search,
    category,
    sort,
    readyFirst,
    skip: (page - 1) * pageSize,
  };
};

export const validateContactMessage = (body = {}) => {
  const payload = {
    name: normalizeString(body.name),
    email: normalizeString(body.email).toLowerCase(),
    phone: normalizeString(body.phone),
    subject: normalizeString(body.subject),
    interestArea: normalizeString(body.interestArea),
    message: normalizeString(body.message),
    website: normalizeString(body.website),
  };

  const errors = [];

  if (payload.website) {
    errors.push("Spam protection triggered.");
  }

  if (!payload.name) {
    errors.push("Full name is required.");
  }

  if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    errors.push("A valid email address is required.");
  }

  if (!payload.message || payload.message.length < 12) {
    errors.push("Please provide a message with a little more detail.");
  }

  return {
    isValid: errors.length === 0,
    errors,
    data: payload,
  };
};

export const validateCareerApplication = (body = {}, files = {}) => {
  const allowedRoles = Array.isArray(files?.allowedRoles)
    ? files.allowedRoles.map((role) => normalizeString(role)).filter(Boolean)
    : [];
  const payload = {
    fullName: normalizeString(body.fullName),
    email: normalizeString(body.email).toLowerCase(),
    phone: normalizeString(body.phone),
    location: normalizeString(body.location),
    role: normalizeString(body.role),
    employmentType: normalizeString(body.employmentType),
    experienceLevel: normalizeString(body.experienceLevel),
    linkedinUrl: normalizeUrl(body.linkedinUrl),
    portfolioUrl: normalizeUrl(body.portfolioUrl),
    availability: normalizeString(body.availability),
    salaryExpectation: normalizeString(body.salaryExpectation),
    coverLetter: normalizeString(body.coverLetter),
    website: normalizeString(body.website),
  };

  const errors = [];
  const resumeFile = files?.resumeFile || null;

  if (payload.website) {
    errors.push("Spam protection triggered.");
  }

  if (!payload.fullName) {
    errors.push("Full name is required.");
  }

  if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    errors.push("A valid email address is required.");
  }

  if (!payload.role) {
    errors.push("Please select the role you want to apply for.");
  } else if (allowedRoles.length > 0 && !allowedRoles.includes(payload.role)) {
    errors.push("The selected vacancy is no longer accepting applications.");
  }

  if (!payload.employmentType) {
    errors.push("Please select your preferred engagement type.");
  }

  if (!payload.experienceLevel) {
    errors.push("Please select your current experience level.");
  }

  if (!payload.coverLetter || payload.coverLetter.length < 80) {
    errors.push("Please provide a short cover letter of at least 80 characters.");
  }

  if (!resumeFile) {
    errors.push("Please upload your resume or CV.");
  }

  if (files?.requireOpenRoles && allowedRoles.length === 0) {
    errors.push("Applications for the current vacancies are closed right now.");
  }

  [payload.linkedinUrl, payload.portfolioUrl]
    .filter(Boolean)
    .forEach((url) => {
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          errors.push("Profile and portfolio links must start with http:// or https://.");
        }
      } catch {
        errors.push("Please enter a valid LinkedIn or portfolio URL.");
      }
    });

  return {
    isValid: errors.length === 0,
    errors,
    data: payload,
  };
};

export const buildPaginationModel = ({ page, pageSize, totalItems }) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  return {
    currentPage,
    totalPages,
    pageSize,
    totalItems,
    hasPrevious: currentPage > 1,
    hasNext: currentPage < totalPages,
    previousPage: currentPage - 1,
    nextPage: currentPage + 1,
  };
};
