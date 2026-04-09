import { Role } from "@prisma/client";
import { hashPassword } from "../utils/password.js";

const ROOT_SUPERADMIN_SETTING_KEY = "system_root_superadmin";
const SECOND_SUPERADMIN_SETTING_KEY = "system_second_superadmin";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const readRequiredSuperAdminEnv = (prefix, label) => {
  const requiredKeys = [`${prefix}_EMAIL`, `${prefix}_PASSWORD`, `${prefix}_NAME`];
  const missing = requiredKeys.filter((key) => !String(process.env[key] || "").trim());

  if (missing.length > 0) {
    throw new Error(`Missing required ${label} environment variable(s): ${missing.join(", ")}`);
  }

  return {
    email: normalizeEmail(process.env[`${prefix}_EMAIL`]),
    password: String(process.env[`${prefix}_PASSWORD`]),
    name: String(process.env[`${prefix}_NAME`]).trim(),
  };
};

const readManagedSuperAdminSetting = async (prisma, key) => {
  const setting = await prisma.siteSetting.findUnique({
    where: { key },
    select: { value: true },
  });

  const value = setting?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const userId = typeof value.userId === "string" ? value.userId.trim() : "";
  const email = typeof value.email === "string" ? normalizeEmail(value.email) : "";

  if (!userId && !email) {
    return null;
  }

  return {
    userId: userId || null,
    email: email || null,
  };
};

const writeManagedSuperAdminSetting = async (prisma, key, user) => {
  await prisma.siteSetting.upsert({
    where: { key },
    update: {
      value: {
        userId: user.id,
        email: normalizeEmail(user.email),
      },
    },
    create: {
      key,
      value: {
        userId: user.id,
        email: normalizeEmail(user.email),
      },
    },
  });
};

const findUserByEmail = async (prisma, email) => {
  if (!email) {
    return null;
  }

  return prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
  });
};

const findStoredManagedUser = async (prisma, settingKey) => {
  const stored = await readManagedSuperAdminSetting(prisma, settingKey);
  if (!stored?.userId) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: stored.userId },
  });
};

const syncRootSuperAdmin = async (prisma, config) => {
  const storedUser = await findStoredManagedUser(prisma, ROOT_SUPERADMIN_SETTING_KEY);
  const existingUser = storedUser || (await findUserByEmail(prisma, config.email));
  const hashedPassword = await hashPassword(config.password);

  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: config.name,
          email: config.email,
          password: hashedPassword,
          role: Role.SUPER_ADMIN,
        },
      })
    : await prisma.user.create({
        data: {
          name: config.name,
          email: config.email,
          password: hashedPassword,
          role: Role.SUPER_ADMIN,
        },
      });

  await writeManagedSuperAdminSetting(prisma, ROOT_SUPERADMIN_SETTING_KEY, user);
  return user;
};

const findSecondSuperAdminCandidate = async (prisma, rootEmail, configuredEmail) => {
  const normalizedRootEmail = normalizeEmail(rootEmail);
  const normalizedConfiguredEmail = normalizeEmail(configuredEmail);

  const existingByEmail = await findUserByEmail(prisma, normalizedConfiguredEmail);
  if (existingByEmail) {
    return existingByEmail;
  }

  const candidates = await prisma.user.findMany({
    where: {
      role: Role.SUPER_ADMIN,
      ...(normalizedRootEmail
        ? {
            NOT: {
              email: {
                equals: normalizedRootEmail,
                mode: "insensitive",
              },
            },
          }
        : {}),
    },
    orderBy: [{ createdAt: "asc" }],
  });

  if (candidates.length === 1) {
    return candidates[0];
  }

  return null;
};

const syncSecondSuperAdmin = async (prisma, config, rootUser) => {
  if (normalizeEmail(config.email) === normalizeEmail(rootUser?.email)) {
    throw new Error("SECOND_SUPERADMIN_EMAIL must be different from ROOT_SUPERADMIN_EMAIL.");
  }

  const storedUser = await findStoredManagedUser(prisma, SECOND_SUPERADMIN_SETTING_KEY);
  const candidateUser =
    storedUser ||
    (await findSecondSuperAdminCandidate(prisma, rootUser?.email, config.email));
  if (
    candidateUser &&
    (candidateUser.id === rootUser?.id ||
      normalizeEmail(candidateUser.email) === normalizeEmail(rootUser?.email))
  ) {
    throw new Error("Second superadmin sync resolved to the root superadmin, which is not allowed.");
  }

  const hashedPassword = await hashPassword(config.password);

  const user = candidateUser
    ? await prisma.user.update({
        where: { id: candidateUser.id },
        data: {
          name: config.name,
          email: config.email,
          password: hashedPassword,
          role: Role.SUPER_ADMIN,
        },
      })
    : await prisma.user.create({
        data: {
          name: config.name,
          email: config.email,
          password: hashedPassword,
          role: Role.SUPER_ADMIN,
        },
      });

  await writeManagedSuperAdminSetting(prisma, SECOND_SUPERADMIN_SETTING_KEY, user);
  return user;
};

export const syncConfiguredSuperAdmins = async (prisma) => {
  const rootConfig = readRequiredSuperAdminEnv("ROOT_SUPERADMIN", "ROOT_SUPERADMIN");
  const secondConfig = readRequiredSuperAdminEnv("SECOND_SUPERADMIN", "SECOND_SUPERADMIN");
  if (rootConfig.email === secondConfig.email) {
    throw new Error("ROOT_SUPERADMIN_EMAIL and SECOND_SUPERADMIN_EMAIL must be different.");
  }

  const rootUser = await syncRootSuperAdmin(prisma, rootConfig);
  const secondUser = await syncSecondSuperAdmin(prisma, secondConfig, rootUser);

  return {
    rootUser,
    secondUser,
  };
};
