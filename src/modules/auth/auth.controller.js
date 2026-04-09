// src/modules/auth/auth.controller.js
import crypto from "crypto";
import { prisma } from "../../config/prisma.js";
import { hashPassword, verifyPassword } from "../../utils/password.js";
import { signToken } from "../../utils/jwt.js";
import { assignStudentCode } from "../../utils/student-code.js";
import {
  buildAuthPageModel,
  completeAppleAuthentication,
  completeGoogleAuthentication,
  createAppleAuthorizationUrl,
  createGoogleAuthorizationUrl,
  persistSession,
} from "./auth.services.js";
import { listPendingSwitchTopUpsForUser } from "../payments/switch-top-up.service.js";
import { DEFAULT_LANGUAGE_PREFERENCE, normalizeLanguagePreference } from "../../utils/language.js";
import { notify } from "../../../services/notificationService.js";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const renderAuthPage = (res, view, error, status = 400, formData = {}) =>
  res.status(status).render(`auth/${view}`, buildAuthPageModel(error, { formData }));

const buildSessionUser = (user) => ({
  id: user.id,
  role: user.role,
  name: user.fullName || user.name,
  fullName: user.fullName,
  studentCode: user.studentCode || null,
  email: user.email,
  profileCompleted: !!user.profileCompleted,
  countryCode: user.countryCode || null,
  phoneNumber: user.phoneNumber || null,
  profilePhotoUrl: user.profilePhotoUrl || null,
  themePreference: user.themePreference || "light",
  languagePreference:
    normalizeLanguagePreference(user.languagePreference, {
      fallback: DEFAULT_LANGUAGE_PREFERENCE,
    }) || DEFAULT_LANGUAGE_PREFERENCE,
});

const createLoginAuditLog = async (user, metadata = {}) => {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "LOGIN",
        targetType: "USER",
        targetId: user.id,
        metadata: {
          email: user.email,
          ...metadata,
        },
      },
    });
  } catch (err) {
    console.error("AuditLog LOGIN failed", err?.message || err);
  }
};

const queueNotification = (payload) => {
  notify(payload).catch((error) => {
    console.error("[notifications] Failed to queue auth notification.", error);
  });
};

const completeLogin = async (req, res, user, metadata = {}) => {
  const requestedLanguagePreference = normalizeLanguagePreference(
    metadata?.languagePreference ?? req.body?.languagePreference ?? req.query?.languagePreference,
    { fallback: null }
  );

  let sessionUser = user;
  if (
    requestedLanguagePreference &&
    requestedLanguagePreference !==
      (normalizeLanguagePreference(user.languagePreference, {
        fallback: DEFAULT_LANGUAGE_PREFERENCE,
      }) || DEFAULT_LANGUAGE_PREFERENCE)
  ) {
    sessionUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        languagePreference: requestedLanguagePreference,
      },
    });
  }

  req.session.user = buildSessionUser(sessionUser);
  await persistSession(req);

  const token = signToken(sessionUser);
  res.cookie("token", token, { httpOnly: true });

  await createLoginAuditLog(sessionUser, metadata);

  const rootEmail = String(process.env.ROOT_SUPERADMIN_EMAIL || "").toLowerCase();
  const isRootSuperAdmin =
    rootEmail && sessionUser.email && sessionUser.email.toLowerCase() === rootEmail;

  if (!isRootSuperAdmin && !sessionUser.profileCompleted) {
    return res.redirect("/complete-profile");
  }

  if (sessionUser.role === "STUDENT") {
    const pendingSwitchTopUps = await listPendingSwitchTopUpsForUser(sessionUser.id);

    if (pendingSwitchTopUps.length === 1) {
      return res.redirect(`/payments/switch-top-up/${pendingSwitchTopUps[0].id}`);
    }

    if (pendingSwitchTopUps.length > 1) {
      req.session.flash = {
        type: "info",
        message: "You have approved programme switches waiting for top-up. Complete them from My Courses.",
      };
      await persistSession(req);
      return res.redirect("/my-courses");
    }
  }

  return res.redirect("/dashboard");
};

const getProviderField = (provider) => (provider === "apple" ? "appleId" : "googleId");

const findOrCreateSocialUser = async ({ provider, providerUserId, email, name }) => {
  const providerField = getProviderField(provider);

  let user = await prisma.user.findFirst({
    where: {
      [providerField]: providerUserId,
    },
  });

  if (user) {
    if (user.role === "STUDENT" && !user.studentCode) {
      user = await assignStudentCode(user.id, user.fullName || user.name);
    }

    return { user, created: false };
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("This account did not provide an email address.");
  }

  const resolvedName = String(name || "").trim() || normalizedEmail.split("@")[0] || "Student";

  user = await prisma.user.findFirst({
    where: {
      email: {
        equals: normalizedEmail,
        mode: "insensitive",
      },
    },
  });

  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        [providerField]: providerUserId,
        fullName: user.fullName || resolvedName,
        name: user.name || resolvedName,
      },
    });

    return { user, created: false };
  }

  const randomPassword = await hashPassword(`${crypto.randomUUID()}-${provider}-${providerUserId}`);
  user = await prisma.user.create({
    data: {
      name: resolvedName,
      fullName: resolvedName,
      email: normalizedEmail,
      password: randomPassword,
      role: "STUDENT",
      profileCompleted: false,
      [providerField]: providerUserId,
    },
  });

  user = await assignStudentCode(user.id, user.fullName || user.name);

  return { user, created: true };
};

const resolveCallbackView = (mode) => (mode === "register" ? "register" : "login");

export const showLogin = (req, res) => {
  res.render("auth/login", buildAuthPageModel());
};

export const showRegister = (req, res) => {
  res.render("auth/register", buildAuthPageModel());
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = normalizeEmail(email);

  const user = normalizedEmail
    ? await prisma.user.findFirst({
        where: {
          email: {
            equals: normalizedEmail,
            mode: "insensitive",
          },
        },
      })
    : null;
  if (!user) return renderAuthPage(res, "login", "Invalid credentials", 400, { email: normalizedEmail });

  const valid = await verifyPassword(password, user.password);
  if (!valid) return renderAuthPage(res, "login", "Invalid credentials", 400, { email: normalizedEmail });

  return completeLogin(req, res, user);
};

export const register = async (req, res) => {
  const { name, email, password } = req.body;
  const normalizedName = String(name || "").trim();
  const normalizedEmail = normalizeEmail(email);
  const uploadedProfilePhotoUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const languagePreference =
    normalizeLanguagePreference(req.body?.languagePreference, {
      fallback: DEFAULT_LANGUAGE_PREFERENCE,
    }) || DEFAULT_LANGUAGE_PREFERENCE;

  if (!normalizedName || !normalizedEmail || !password) {
    return renderAuthPage(res, "register", "All fields are required.", 400, {
      name: normalizedName,
      email: normalizedEmail,
    });
  }

  if (req.fileValidationError) {
    return renderAuthPage(res, "register", req.fileValidationError, 400, {
      name: normalizedName,
      email: normalizedEmail,
    });
  }

  if (!uploadedProfilePhotoUrl) {
    return renderAuthPage(res, "register", "Profile picture is required.", 400, {
      name: normalizedName,
      email: normalizedEmail,
    });
  }

  const existing = await prisma.user.findFirst({
    where: {
      email: {
        equals: normalizedEmail,
        mode: "insensitive",
      },
    },
  });
  if (existing) {
    return renderAuthPage(
      res,
      "register",
      "An account with this email already exists. Sign in instead or use a different email.",
      400,
      {
        name: normalizedName,
        email: normalizedEmail,
      }
    );
  }

  const hashed = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      name: normalizedName,
      fullName: normalizedName,
      email: normalizedEmail,
      password: hashed,
      role: "STUDENT",
      profileCompleted: false,
      profilePhotoUrl: uploadedProfilePhotoUrl,
      languagePreference,
    },
  });

  const studentUser = await assignStudentCode(user.id, user.fullName || user.name);

  queueNotification({
    type: "USER_REGISTERED",
    user: studentUser,
  });

  return completeLogin(req, res, studentUser);
};

export const startGoogleAuth = async (req, res) => {
  const mode = req.query.mode === "register" ? "register" : "login";

  try {
    const url = await createGoogleAuthorizationUrl(req, mode);
    return res.redirect(url);
  } catch (err) {
    return renderAuthPage(res, mode, err.message);
  }
};

export const googleCallback = async (req, res) => {
  const fallbackMode = req.session?.oauthRequest?.mode;

  try {
    if (req.query.error) {
      throw new Error("Google sign-in was cancelled or denied.");
    }

    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    if (!code || !state) {
      throw new Error("Google sign-in returned an incomplete response.");
    }

    const socialProfile = await completeGoogleAuthentication(req, code, state);
    const { user, created } = await findOrCreateSocialUser(socialProfile);

    if (created) {
      queueNotification({
        type: "USER_REGISTERED",
        user,
      });
    }

    return completeLogin(req, res, user, {
      provider: socialProfile.provider,
      socialSignup: created,
      languagePreference: socialProfile.languagePreference,
    });
  } catch (err) {
    const view = resolveCallbackView(fallbackMode);
    return renderAuthPage(res, view, err.message);
  }
};

export const startAppleAuth = async (req, res) => {
  const mode = req.query.mode === "register" ? "register" : "login";

  try {
    const url = await createAppleAuthorizationUrl(req, mode);
    return res.redirect(url);
  } catch (err) {
    return renderAuthPage(res, mode, err.message);
  }
};

export const appleCallback = async (req, res) => {
  const fallbackMode = req.session?.oauthRequest?.mode;

  try {
    const providerError = req.method === "POST" ? req.body.error : req.query.error;
    if (providerError) {
      throw new Error("Apple sign-in was cancelled or denied.");
    }

    const code = String((req.body?.code ?? req.query?.code) || "");
    const state = String((req.body?.state ?? req.query?.state) || "");
    const user = req.body?.user;

    if (!code || !state) {
      throw new Error("Apple sign-in returned an incomplete response.");
    }

    const socialProfile = await completeAppleAuthentication(req, { code, state, user });
    const result = await findOrCreateSocialUser(socialProfile);

    if (result.created) {
      queueNotification({
        type: "USER_REGISTERED",
        user: result.user,
      });
    }

    return completeLogin(req, res, result.user, {
      provider: socialProfile.provider,
      socialSignup: result.created,
      languagePreference: socialProfile.languagePreference,
    });
  } catch (err) {
    const view = resolveCallbackView(fallbackMode);
    return renderAuthPage(res, view, err.message);
  }
};
