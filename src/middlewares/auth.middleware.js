// src/middlewares/auth.middleware.js
import { prisma } from "../config/prisma.js";
import { DEFAULT_LANGUAGE_PREFERENCE, normalizeLanguagePreference } from "../utils/language.js";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const isRootSuperAdminEmail = (email) => {
  const rootEmail = normalizeEmail(process.env.ROOT_SUPERADMIN_EMAIL || "");
  if (!rootEmail) return false;
  return normalizeEmail(email) === rootEmail;
};

export const isAuthenticated = (req, res, next) => {
  if (req.session.user) return next();
  return res.redirect("/login");
};

export const requireCompletedProfile = async (req, res, next) => {
  if (!req.session?.user) {
    return res.redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: req.session.user.id },
    select: {
      email: true,
      name: true,
      fullName: true,
      profileCompleted: true,
      countryCode: true,
      phoneNumber: true,
      themePreference: true,
      languagePreference: true
    }
  });

  if (!user) {
    req.session.destroy(() => {
      res.redirect("/login");
    });
    return;
  }

  if (isRootSuperAdminEmail(user.email)) {
    return next();
  }

  if (!user.profileCompleted) {
    return res.redirect("/complete-profile");
  }

  req.session.user = {
    ...req.session.user,
    name: user.fullName || user.name,
    fullName: user.fullName,
    email: user.email,
    countryCode: user.countryCode || null,
    phoneNumber: user.phoneNumber || null,
    profileCompleted: true,
    themePreference: user.themePreference || "light",
    languagePreference:
      normalizeLanguagePreference(user.languagePreference, {
        fallback: DEFAULT_LANGUAGE_PREFERENCE,
      }) || DEFAULT_LANGUAGE_PREFERENCE
  };

  return next();
};
