import { prisma } from "../../config/prisma.js";
import { hashPassword } from "../../utils/password.js";

const ROLE_OPTIONS = ["ADMIN", "INSTRUCTOR", "STUDENT"];
const CREATE_ROLE_OPTIONS = ["ADMIN", "INSTRUCTOR"];

const ROOT_SUPERADMIN_EMAIL = (
  process.env.ROOT_SUPERADMIN_EMAIL || process.env.ROOT_SUPERADMIN_EMAIL || ""
).toLowerCase() || null;

const logAudit = async (data) => {
  try {
    await prisma.auditLog.create({ data });
  } catch (err) {
    console.error("AuditLog write failed", err?.message || err);
  }
};

export const listAdminUsers = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();

    const requester = await prisma.user.findUnique({
      where: { id: req.session.user.id },
      select: { email: true, role: true },
    });

    const requesterEmail = requester?.email?.toLowerCase() || null;
    const requesterRole = requester?.role || req.session.user.role;

    const filters = [];

    if (q) {
      filters.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    if (requesterRole !== "SUPER_ADMIN") {
      filters.push({ role: { not: "SUPER_ADMIN" } });
    } else if (
      ROOT_SUPERADMIN_EMAIL &&
      requesterEmail !== ROOT_SUPERADMIN_EMAIL
    ) {
      filters.push({
        NOT: {
          email: { equals: ROOT_SUPERADMIN_EMAIL, mode: "insensitive" },
        },
      });
    }

    const where = filters.length ? { AND: filters } : {};

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        courses: {
          orderBy: { title: "asc" },
          select: {
            id: true,
            title: true,
          },
        },
        payments: {
          where: {
            status: "SUCCESS",
          },
          select: {
            id: true,
          },
          take: 1,
        },
      },
    });

    const [assignableCourses, instructorOptions] = await Promise.all([
      prisma.course.findMany({
        orderBy: [{ title: "asc" }],
        select: {
          id: true,
          title: true,
          slug: true,
        },
      }),
      prisma.user.findMany({
        where: { role: "INSTRUCTOR" },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        select: {
          id: true,
          name: true,
          email: true,
        },
      }),
    ]);

    const flash = req.session.flash || null;
    req.session.flash = null;

    return res.render("admin/settings/users", {
      users,
      q,
      currentUserId: req.session.user.id,
      currentUserRole: req.session.user.role,
      flash,
      roleOptions: ROLE_OPTIONS,
      createRoleOptions: CREATE_ROLE_OPTIONS,
      assignableCourses,
      instructorOptions,
    });
  } catch (err) {
    return next(err);
  }
};

export const createAdminUser = async (req, res, next) => {
  try {
    const requesterRole = req.session.user?.role;

    if (requesterRole !== "SUPER_ADMIN" && requesterRole !== "ADMIN") {
      return res.status(403).send("Forbidden");
    }

    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "").trim();
    const role = String(req.body.role || "ADMIN").trim();

    if (!name || !email || !password) {
      req.session.flash = {
        type: "error",
        message: "All fields are required",
      };
      return res.redirect("/admin/settings/users");
    }

    if (!CREATE_ROLE_OPTIONS.includes(role)) {
      req.session.flash = {
        type: "error",
        message: "Invalid creation role",
      };
      return res.redirect("/admin/settings/users");
    }

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      req.session.flash = {
        type: "error",
        message: "Email already in use",
      };
      return res.redirect("/admin/settings/users");
    }

    let selectedCourseIds = req.body.courseIds || [];

    if (!Array.isArray(selectedCourseIds)) {
      selectedCourseIds = [selectedCourseIds];
    }

    selectedCourseIds = selectedCourseIds
      .map((id) => String(id || "").trim())
      .filter(Boolean);

    if (role === "INSTRUCTOR" && selectedCourseIds.length === 0) {
      req.session.flash = {
        type: "error",
        message: "Select at least one course/program for the instructor",
      };
      return res.redirect("/admin/settings/users");
    }

    const hashed = await hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        role,
      },
    });

    if (role === "INSTRUCTOR" && selectedCourseIds.length > 0) {
      await prisma.course.updateMany({
        where: {
          id: { in: selectedCourseIds },
        },
        data: {
          instructorId: newUser.id,
        },
      });
    }

    await logAudit({
      actorUserId: req.session.user.id,
      action: role === "INSTRUCTOR" ? "CREATE_INSTRUCTOR" : "CREATE_ADMIN",
      targetType: "USER",
      targetId: newUser.id,
      metadata: {
        email: newUser.email,
        role: newUser.role,
        assignedCourseIds: role === "INSTRUCTOR" ? selectedCourseIds : [],
      },
    });

    req.session.flash = {
      type: "success",
      message:
        role === "INSTRUCTOR"
          ? "Instructor created and course assignments saved"
          : "Admin user created",
    };

    return res.redirect("/admin/settings/users");
  } catch (err) {
    return next(err);
  }
};

export const updateAdminUserRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const role = String(req.body.role || "").trim();
    const q = String(req.query.q || "").trim();
    const redirectSuffix = q ? `?q=${encodeURIComponent(q)}` : "";

    const requester = await prisma.user.findUnique({
      where: { id: req.session.user.id },
      select: { email: true, role: true },
    });

    const requesterEmail = requester?.email?.toLowerCase() || null;
    const requesterRole = requester?.role || req.session.user.role;

    if (id === req.session.user.id) {
      req.session.flash = {
        type: "error",
        message: "You cannot change your own role",
      };
      return res.status(400).redirect(`/admin/settings/users${redirectSuffix}`);
    }

    if (!ROLE_OPTIONS.includes(role)) {
      req.session.flash = { type: "error", message: "Invalid role" };
      return res.status(400).redirect(`/admin/settings/users${redirectSuffix}`);
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, email: true },
    });

    if (!targetUser) {
      req.session.flash = { type: "error", message: "User not found" };
      return res.status(404).redirect(`/admin/settings/users${redirectSuffix}`);
    }

    if (requesterRole !== "SUPER_ADMIN" && targetUser.role === "SUPER_ADMIN") {
      return res.status(403).send("Forbidden");
    }

    if (
      ROOT_SUPERADMIN_EMAIL &&
      targetUser.email?.toLowerCase() === ROOT_SUPERADMIN_EMAIL &&
      requesterEmail !== ROOT_SUPERADMIN_EMAIL
    ) {
      return res.status(403).send("Forbidden");
    }

    await prisma.user.update({
      where: { id },
      data: { role },
    });

    await logAudit({
      actorUserId: req.session.user.id,
      action: "ROLE_CHANGE",
      targetType: "USER",
      targetId: targetUser.id,
      metadata: {
        email: targetUser.email,
        fromRole: targetUser.role,
        toRole: role,
      },
    });

    req.session.flash = { type: "success", message: "User role updated" };
    return res.redirect(`/admin/settings/users${redirectSuffix}`);
  } catch (err) {
    return next(err);
  }
};

export const reassignInstructorCourses = async (req, res, next) => {
  try {
    const { id } = req.params;
    const targetInstructorId = String(req.body.targetInstructorId || "").trim();
    const q = String(req.query.q || "").trim();
    const redirectSuffix = q ? `?q=${encodeURIComponent(q)}` : "";

    if (!targetInstructorId || targetInstructorId === id) {
      req.session.flash = {
        type: "error",
        message: "Select another instructor to receive the assigned courses.",
      };
      return res.status(400).redirect(`/admin/settings/users${redirectSuffix}`);
    }

    const [sourceInstructor, targetInstructor] = await Promise.all([
      prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          courses: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
      prisma.user.findFirst({
        where: { id: targetInstructorId, role: "INSTRUCTOR" },
        select: { id: true, name: true, email: true },
      }),
    ]);

    if (!sourceInstructor || sourceInstructor.role !== "INSTRUCTOR") {
      req.session.flash = { type: "error", message: "Instructor not found" };
      return res.status(404).redirect(`/admin/settings/users${redirectSuffix}`);
    }

    if (!targetInstructor) {
      req.session.flash = {
        type: "error",
        message: "Select a valid instructor to receive the courses.",
      };
      return res.status(400).redirect(`/admin/settings/users${redirectSuffix}`);
    }

    if (sourceInstructor.courses.length === 0) {
      req.session.flash = {
        type: "error",
        message: "This instructor has no courses to reassign.",
      };
      return res.status(400).redirect(`/admin/settings/users${redirectSuffix}`);
    }

    const courseIds = sourceInstructor.courses.map((course) => course.id);

    await prisma.course.updateMany({
      where: {
        instructorId: sourceInstructor.id,
      },
      data: {
        instructorId: targetInstructor.id,
      },
    });

    await logAudit({
      actorUserId: req.session.user.id,
      action: "REASSIGN_INSTRUCTOR_COURSES",
      targetType: "USER",
      targetId: sourceInstructor.id,
      metadata: {
        fromInstructorEmail: sourceInstructor.email,
        toInstructorEmail: targetInstructor.email,
        courseIds,
      },
    });

    req.session.flash = {
      type: "success",
      message: `Reassigned ${courseIds.length} course/program${courseIds.length === 1 ? "" : "s"} to ${targetInstructor.name}.`,
    };
    return res.redirect(`/admin/settings/users${redirectSuffix}`);
  } catch (err) {
    return next(err);
  }
};

export const deleteAdminUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const q = String(req.query.q || "").trim();
    const targetInstructorId = String(req.body.targetInstructorId || "").trim();
    const redirectSuffix = q ? `?q=${encodeURIComponent(q)}` : "";

    const requester = await prisma.user.findUnique({
      where: { id: req.session.user.id },
      select: { email: true, role: true },
    });

    const requesterEmail = requester?.email?.toLowerCase() || null;
    const requesterRole = requester?.role || req.session.user.role;

    if (id === req.session.user.id) {
      req.session.flash = {
        type: "error",
        message: "You cannot delete your own account",
      };
      return res.status(400).redirect(`/admin/settings/users${redirectSuffix}`);
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        email: true,
        name: true,
        courses: {
          select: {
            id: true,
            title: true,
          },
        },
        payments: {
          where: { status: "SUCCESS" },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!targetUser) {
      req.session.flash = { type: "error", message: "User not found" };
      return res.status(404).redirect(`/admin/settings/users${redirectSuffix}`);
    }

    if (requesterRole !== "SUPER_ADMIN" && targetUser.role === "SUPER_ADMIN") {
      return res.status(403).send("Forbidden");
    }

    if (
      ROOT_SUPERADMIN_EMAIL &&
      targetUser.email?.toLowerCase() === ROOT_SUPERADMIN_EMAIL &&
      requesterEmail !== ROOT_SUPERADMIN_EMAIL
    ) {
      return res.status(403).send("Forbidden");
    }

    if (targetUser.payments.length > 0) {
      req.session.flash = {
        type: "error",
        message: "Users with successful payment history cannot be deleted because it would affect revenue records.",
      };
      return res.status(400).redirect(`/admin/settings/users${redirectSuffix}`);
    }

    let courseReassignmentTarget = null;
    const assignedCourseIds = targetUser.courses.map((course) => course.id);

    if (assignedCourseIds.length > 0) {
      if (!targetInstructorId || targetInstructorId === targetUser.id) {
        req.session.flash = {
          type: "error",
          message: "Select another instructor to receive this user's courses before deleting.",
        };
        return res.status(400).redirect(`/admin/settings/users${redirectSuffix}`);
      }

      courseReassignmentTarget = await prisma.user.findFirst({
        where: { id: targetInstructorId, role: "INSTRUCTOR" },
        select: { id: true, name: true, email: true },
      });

      if (!courseReassignmentTarget) {
        req.session.flash = {
          type: "error",
          message: "Select a valid instructor to receive this user's courses.",
        };
        return res.status(400).redirect(`/admin/settings/users${redirectSuffix}`);
      }
    }

    await prisma.$transaction(async (tx) => {
      if (courseReassignmentTarget) {
        await tx.course.updateMany({
          where: {
            instructorId: targetUser.id,
          },
          data: {
            instructorId: courseReassignmentTarget.id,
          },
        });
      }

      await tx.certificate.deleteMany({ where: { userId: targetUser.id } });
      await tx.payment.deleteMany({ where: { userId: targetUser.id } });
      await tx.progress.deleteMany({ where: { userId: targetUser.id } });
      await tx.enrollment.deleteMany({ where: { userId: targetUser.id } });
      await tx.user.delete({ where: { id: targetUser.id } });
    });

    await logAudit({
      actorUserId: req.session.user.id,
      action: "DELETE_USER",
      targetType: "USER",
      targetId: targetUser.id,
      metadata: {
        email: targetUser.email,
        role: targetUser.role,
        reassignedCourseIds: courseReassignmentTarget ? assignedCourseIds : [],
        reassignedToInstructorEmail: courseReassignmentTarget?.email || null,
      },
    });

    req.session.flash = { type: "success", message: "User deleted" };
    return res.redirect(`/admin/settings/users${redirectSuffix}`);
  } catch (err) {
    return next(err);
  }
};
