import { prisma } from "../../config/prisma.js";
import { DEFAULT_LANGUAGE_PREFERENCE, normalizeLanguagePreference } from "../../utils/language.js";

const normalizeText = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

const normalizePhone = (value) =>
  String(value || "")
    .replace(/[\s\-()]+/g, "")
    .trim();

const buildCountryOptions = () => {
  const codes = [
    "UG", "KE", "TZ", "RW", "BI", "SS", "ET", "NG", "GH", "ZA",
    "US", "GB", "CA", "AU", "NZ", "IN", "AE", "SA", "DE", "FR"
  ];

  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

  return codes
    .map((code) => ({
      code,
      name: displayNames.of(code) || code
    }))
    .filter((country) => country.name && country.code)
    .sort((a, b) => a.name.localeCompare(b.name));
};

const isRootSuperAdmin = (email) => {
  const rootEmail = String(process.env.ROOT_SUPERADMIN_EMAIL || "").toLowerCase();
  if (!rootEmail) return false;
  return String(email || "").toLowerCase() === rootEmail;
};

const buildFormData = (source = {}, user = {}) => ({
  fullName: source.fullName ?? user.fullName ?? user.name ?? "",
  dateOfBirth: source.dateOfBirth ?? (user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : ""),
  countryCode: source.countryCode ?? user.countryCode ?? "",
  nationality: source.nationality ?? user.nationality ?? "",
  nationalIdNumber: source.nationalIdNumber ?? user.nationalIdNumber ?? "",
  parentNames: source.parentNames ?? user.parentNames ?? "",
  phoneNumber: source.phoneNumber ?? user.phoneNumber ?? "",
  themePreference: source.themePreference ?? user.themePreference ?? "light",
  profilePhotoUrl: source.profilePhotoUrl ?? user.profilePhotoUrl ?? "",
});

const getUploadedProfilePhotoUrl = (req) => (req.file ? `/uploads/${req.file.filename}` : null);
const saveSession = (req) =>
  new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });

export const showCompleteProfile = async (req, res) => {
  if (!req.session?.user) {
    return res.redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: req.session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      fullName: true,
      dateOfBirth: true,
      countryCode: true,
      nationality: true,
      nationalIdNumber: true,
      parentNames: true,
      phoneNumber: true,
      themePreference: true,
      profilePhotoUrl: true,
      profileCompleted: true
    }
  });

  if (!user) {
    return res.redirect("/login");
  }

  if (isRootSuperAdmin(user.email) || user.profileCompleted) {
    return res.redirect("/dashboard");
  }

  const countries = buildCountryOptions();
  const formData = buildFormData({}, user);

  return res.render("auth/complete-profile", {
    error: null,
    formData,
    countries
  });
};

export const submitCompleteProfile = async (req, res) => {
  if (!req.session?.user) {
    return res.redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: req.session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      fullName: true,
      profilePhotoUrl: true,
      profileCompleted: true,
    }
  });

  if (!user) {
    return res.redirect("/login");
  }

  if (isRootSuperAdmin(user.email)) {
    return res.redirect("/dashboard");
  }

  const countries = buildCountryOptions();
  const countryCodes = new Set(countries.map((country) => country.code));

  const fullName = normalizeText(req.body.fullName);
  const dateOfBirthRaw = normalizeText(req.body.dateOfBirth);
  const countryCode = normalizeText(req.body.countryCode).toUpperCase();
  const nationality = normalizeText(req.body.nationality);
  const nationalIdNumber = normalizeText(req.body.nationalIdNumber);
  const parentNames = normalizeText(req.body.parentNames);
  const phoneNumber = normalizePhone(req.body.phoneNumber);
  const uploadedProfilePhotoUrl = getUploadedProfilePhotoUrl(req);

  if (req.fileValidationError) {
    return res.render("auth/complete-profile", {
      error: req.fileValidationError,
      formData: buildFormData(
        {
          fullName,
          dateOfBirth: dateOfBirthRaw,
          countryCode,
          nationality,
          nationalIdNumber,
          parentNames,
          phoneNumber,
          profilePhotoUrl: user.profilePhotoUrl || "",
        },
        user
      ),
      countries
    });
  }

  if (
    !fullName ||
    !dateOfBirthRaw ||
    !countryCode ||
    !nationality ||
    !nationalIdNumber ||
    !parentNames ||
    !phoneNumber ||
    !(uploadedProfilePhotoUrl || user.profilePhotoUrl)
  ) {
    return res.render("auth/complete-profile", {
      error: "All fields, including a profile picture, are required.",
      formData: buildFormData(
        {
          fullName,
          dateOfBirth: dateOfBirthRaw,
          countryCode,
          nationality,
          nationalIdNumber,
          parentNames,
          phoneNumber,
          profilePhotoUrl: user.profilePhotoUrl || "",
        },
        user
      ),
      countries
    });
  }

  if (!countryCodes.has(countryCode)) {
    return res.render("auth/complete-profile", {
      error: "Please select a valid country of origin.",
      formData: buildFormData(
        {
          fullName,
          dateOfBirth: dateOfBirthRaw,
          countryCode,
          nationality,
          nationalIdNumber,
          parentNames,
          phoneNumber
        },
        user
      ),
      countries
    });
  }

  const dateOfBirth = new Date(dateOfBirthRaw);
  if (Number.isNaN(dateOfBirth.getTime())) {
    return res.render("auth/complete-profile", {
      error: "Please enter a valid date of birth.",
      formData: buildFormData(
        {
          fullName,
          dateOfBirth: dateOfBirthRaw,
          countryCode,
          nationality,
          nationalIdNumber,
          parentNames,
          phoneNumber
        },
        user
      ),
      countries
    });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: fullName,
      fullName,
      dateOfBirth,
      countryCode,
      nationality,
      nationalIdNumber,
      parentNames,
      phoneNumber,
      profilePhotoUrl: uploadedProfilePhotoUrl || user.profilePhotoUrl || null,
      profileCompleted: true
    }
  });

  req.session.user = {
    ...req.session.user,
    name: updated.fullName || updated.name,
    fullName: updated.fullName,
    countryCode: updated.countryCode,
    phoneNumber: updated.phoneNumber,
    profilePhotoUrl: updated.profilePhotoUrl || null,
    profileCompleted: true,
    languagePreference:
      normalizeLanguagePreference(req.session.user?.languagePreference, {
        fallback: DEFAULT_LANGUAGE_PREFERENCE,
      }) || DEFAULT_LANGUAGE_PREFERENCE
  };

  return res.redirect("/dashboard");
};

export const showAccountSettings = async (req, res) => {
  if (!req.session?.user) {
    return res.redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: req.session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      fullName: true,
      dateOfBirth: true,
      countryCode: true,
      nationality: true,
      nationalIdNumber: true,
      parentNames: true,
      phoneNumber: true,
      themePreference: true,
      profilePhotoUrl: true,
      profileCompleted: true
    }
  });

  if (!user) {
    return res.redirect("/login");
  }

  const countries = buildCountryOptions();
  const formData = buildFormData({}, user);

  return res.render("account/settings", {
    error: null,
    formData,
    countries
  });
};

export const submitAccountSettings = async (req, res) => {
  if (!req.session?.user) {
    return res.redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: req.session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      fullName: true,
      dateOfBirth: true,
      countryCode: true,
      nationality: true,
      nationalIdNumber: true,
      parentNames: true,
      phoneNumber: true,
      themePreference: true,
      profilePhotoUrl: true,
      role: true
    }
  });

  if (!user) {
    return res.redirect("/login");
  }

  const countries = buildCountryOptions();
  const countryCodes = new Set(countries.map((country) => country.code));

  const fullName = normalizeText(req.body.fullName);
  const dateOfBirthRaw = normalizeText(req.body.dateOfBirth);
  const countryCode = normalizeText(req.body.countryCode).toUpperCase();
  const nationality = normalizeText(req.body.nationality);
  const nationalIdNumber = normalizeText(req.body.nationalIdNumber);
  const parentNames = normalizeText(req.body.parentNames);
  const phoneNumber = normalizePhone(req.body.phoneNumber);
  const themePreference = normalizeText(req.body.themePreference).toLowerCase();
  const uploadedProfilePhotoUrl = getUploadedProfilePhotoUrl(req);

  if (req.fileValidationError) {
    return res.render("account/settings", {
      error: req.fileValidationError,
      formData: buildFormData(
        {
          fullName,
          dateOfBirth: dateOfBirthRaw,
          countryCode,
          nationality,
          nationalIdNumber,
          parentNames,
          phoneNumber,
          themePreference,
          profilePhotoUrl: user.profilePhotoUrl || "",
        },
        user
      ),
      countries
    });
  }

  if (
    !fullName ||
    !dateOfBirthRaw ||
    !countryCode ||
    !nationality ||
    !nationalIdNumber ||
    !parentNames ||
    !phoneNumber
  ) {
    return res.render("account/settings", {
      error: "All fields are required.",
      formData: buildFormData(
        {
          fullName,
          dateOfBirth: dateOfBirthRaw,
          countryCode,
          nationality,
          nationalIdNumber,
          parentNames,
          phoneNumber,
          themePreference,
          profilePhotoUrl: user.profilePhotoUrl || "",
        },
        user
      ),
      countries
    });
  }

  if (!countryCodes.has(countryCode)) {
    return res.render("account/settings", {
      error: "Please select a valid country of origin.",
      formData: buildFormData(
        {
          fullName,
          dateOfBirth: dateOfBirthRaw,
          countryCode,
          nationality,
          nationalIdNumber,
          parentNames,
          phoneNumber,
          themePreference,
          profilePhotoUrl: user.profilePhotoUrl || "",
        },
        user
      ),
      countries
    });
  }

  if (themePreference !== "light" && themePreference !== "dark") {
    return res.render("account/settings", {
      error: "Please select a valid theme preference.",
      formData: buildFormData(
        {
          fullName,
          dateOfBirth: dateOfBirthRaw,
          countryCode,
          nationality,
          nationalIdNumber,
          parentNames,
          phoneNumber,
          themePreference,
          profilePhotoUrl: user.profilePhotoUrl || "",
        },
        user
      ),
      countries
    });
  }

  const dateOfBirth = new Date(dateOfBirthRaw);
  if (Number.isNaN(dateOfBirth.getTime())) {
    return res.render("account/settings", {
      error: "Please enter a valid date of birth.",
      formData: buildFormData(
        {
          fullName,
          dateOfBirth: dateOfBirthRaw,
          countryCode,
          nationality,
          nationalIdNumber,
          parentNames,
          phoneNumber,
          themePreference,
          profilePhotoUrl: user.profilePhotoUrl || "",
        },
        user
      ),
      countries
    });
  }

  const existingDob = user.dateOfBirth
    ? user.dateOfBirth.toISOString().slice(0, 10)
    : "";

  const changesDetected =
    fullName !== (user.fullName || user.name || "") ||
    dateOfBirthRaw !== existingDob ||
    countryCode !== (user.countryCode || "") ||
    nationality !== (user.nationality || "") ||
    nationalIdNumber !== (user.nationalIdNumber || "") ||
    parentNames !== (user.parentNames || "") ||
    phoneNumber !== (user.phoneNumber || "") ||
    themePreference !== (user.themePreference || "light") ||
    uploadedProfilePhotoUrl !== null;

  const updated = changesDetected
    ? await prisma.user.update({
        where: { id: user.id },
        data: {
          name: fullName,
          fullName,
          dateOfBirth,
          countryCode,
          nationality,
          nationalIdNumber,
          parentNames,
          phoneNumber,
          themePreference,
          profilePhotoUrl: uploadedProfilePhotoUrl || user.profilePhotoUrl || null,
          profileCompleted: true
        }
      })
    : user;

  req.session.user = {
    ...req.session.user,
    name: updated.fullName || updated.name,
    fullName: updated.fullName,
    countryCode: updated.countryCode,
    phoneNumber: updated.phoneNumber,
    profilePhotoUrl: updated.profilePhotoUrl || null,
    profileCompleted: true,
    themePreference: updated.themePreference || "light",
    languagePreference:
      normalizeLanguagePreference(req.session.user?.languagePreference, {
        fallback: DEFAULT_LANGUAGE_PREFERENCE,
      }) || DEFAULT_LANGUAGE_PREFERENCE
  };

  req.session.flash = {
    type: changesDetected ? "success" : "info",
    message: changesDetected ? "Changes saved successfully" : "No changes detected"
  };

  const role = user.role || req.session.user?.role || "STUDENT";
  const roleRedirects = {
    STUDENT: "/student/dashboard",
    INSTRUCTOR: "/instructor/dashboard",
    ADMIN: "/admin/dashboard",
    SUPER_ADMIN: "/super-admin/dashboard"
  };

  return res.redirect(roleRedirects[role] || "/dashboard");
};

export const updateLanguagePreference = async (req, res, next) => {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({
        ok: false,
        message: "Authentication required.",
      });
    }

    const languagePreference = normalizeLanguagePreference(req.body?.languagePreference, {
      fallback: null,
    });

    if (!languagePreference) {
      return res.status(400).json({
        ok: false,
        message: "Please provide a valid language preference.",
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.session.user.id },
      data: {
        languagePreference,
      },
      select: {
        languagePreference: true,
      },
    });

    req.session.user = {
      ...req.session.user,
      languagePreference:
        normalizeLanguagePreference(updatedUser.languagePreference, {
          fallback: DEFAULT_LANGUAGE_PREFERENCE,
        }) || DEFAULT_LANGUAGE_PREFERENCE,
    };

    await saveSession(req);

    return res.json({
      ok: true,
      languagePreference: req.session.user.languagePreference,
    });
  } catch (err) {
    return next(err);
  }
};
