import { prisma } from "../../config/prisma.js";

const STATUSES = ["DRAFT", "COMING_SOON", "READY"];
const DEFAULT_CREATE_VALUES = {
  title: "",
  description: "",
  categoryId: "",
  instructorId: "",
  status: "DRAFT",
  published: false,
};

const toSlug = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const buildUniqueSlug = async (title, excludeCourseId = null) => {
  const baseSlug = toSlug(title) || "course";
  let slug = baseSlug;
  let counter = 2;

  for (;;) {
    const existing = await prisma.course.findFirst({
      where: {
        slug,
        ...(excludeCourseId ? { id: { not: excludeCourseId } } : {}),
      },
      select: { id: true },
    });

    if (!existing) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }
};

const loadCourseFormOptions = async () => {
  const [categories, instructors] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { role: "INSTRUCTOR" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  return { categories, instructors };
};

const normalizeCoursePayload = (body = {}) => ({
  title: String(body.title || "").trim(),
  description: String(body.description || "").trim(),
  categoryId: String(body.categoryId || "").trim(),
  instructorId: String(body.instructorId || "").trim(),
  status: String(body.status || "DRAFT").trim(),
  published: body.published === "on",
});

const renderCourseForm = async ({
  res,
  view,
  course,
  values,
  flash = null,
  status = 200,
}) => {
  const { categories, instructors } = await loadCourseFormOptions();

  return res.status(status).render(view, {
    course,
    values,
    categories,
    instructors,
    statuses: STATUSES,
    flash,
  });
};

const deleteCourseTree = async (courseId) => {
  await prisma.$transaction(async (tx) => {
    const lessons = await tx.lesson.findMany({
      where: { courseId },
      select: { id: true },
    });
    const lessonIds = lessons.map((lesson) => lesson.id);

    if (lessonIds.length > 0) {
      await tx.progress.deleteMany({
        where: {
          lessonId: { in: lessonIds },
        },
      });
    }

    await tx.certificate.deleteMany({ where: { courseId } });
    await tx.enrollment.deleteMany({ where: { courseId } });
    await tx.payment.deleteMany({ where: { courseId } });
    await tx.lesson.deleteMany({ where: { courseId } });
    await tx.course.delete({ where: { id: courseId } });
  });
};

export const listAdminCourses = async (req, res, next) => {
  try {
    const courses = await prisma.course.findMany({
      orderBy: [{ category: { name: "asc" } }, { title: "asc" }],
      include: {
        category: { select: { id: true, name: true } },
        instructor: { select: { id: true, name: true, email: true } },
        _count: { select: { enrollments: true } },
      },
    });

    const flash = req.session.flash || null;
    req.session.flash = null;

    return res.render("admin/courses/index", {
      courses,
      flash,
    });
  } catch (err) {
    return next(err);
  }
};

export const newAdminCourseForm = async (req, res, next) => {
  try {
    const flash = req.session.flash || null;
    req.session.flash = null;

    return renderCourseForm({
      res,
      view: "admin/courses/new",
      course: null,
      values: DEFAULT_CREATE_VALUES,
      flash,
    });
  } catch (err) {
    return next(err);
  }
};

export const createAdminCourse = async (req, res, next) => {
  const values = normalizeCoursePayload(req.body);

  try {
    if (!values.title || !values.description || !values.categoryId || !values.instructorId) {
      return renderCourseForm({
        res,
        view: "admin/courses/new",
        course: null,
        values,
        flash: { type: "error", message: "Title, description, category, and instructor are required" },
        status: 400,
      });
    }

    if (!STATUSES.includes(values.status)) {
      return renderCourseForm({
        res,
        view: "admin/courses/new",
        course: null,
        values,
        flash: { type: "error", message: "Invalid status" },
        status: 400,
      });
    }

    const [category, instructor] = await Promise.all([
      prisma.category.findUnique({
        where: { id: values.categoryId },
        select: { id: true },
      }),
      prisma.user.findFirst({
        where: { id: values.instructorId, role: "INSTRUCTOR" },
        select: { id: true },
      }),
    ]);

    if (!category) {
      return renderCourseForm({
        res,
        view: "admin/courses/new",
        course: null,
        values,
        flash: { type: "error", message: "Invalid category" },
        status: 400,
      });
    }

    if (!instructor) {
      return renderCourseForm({
        res,
        view: "admin/courses/new",
        course: null,
        values,
        flash: { type: "error", message: "Select a valid instructor" },
        status: 400,
      });
    }

    const slug = await buildUniqueSlug(values.title);

    await prisma.course.create({
      data: {
        title: values.title,
        slug,
        description: values.description,
        categoryId: values.categoryId,
        instructorId: values.instructorId,
        status: values.status,
        published: values.published,
        publishedAt: values.published ? new Date() : null,
      },
    });

    req.session.flash = { type: "success", message: "Course created" };
    return res.redirect("/admin/courses");
  } catch (err) {
    if (err?.code === "P2002") {
      return renderCourseForm({
        res,
        view: "admin/courses/new",
        course: null,
        values,
        flash: { type: "error", message: "A course with that title or slug already exists" },
        status: 400,
      });
    }

    return next(err);
  }
};

export const editAdminCourse = async (req, res, next) => {
  try {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: { category: { select: { id: true, name: true } } },
    });

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/admin/courses");
    }

    const flash = req.session.flash || null;
    req.session.flash = null;

    return renderCourseForm({
      res,
      view: "admin/courses/edit",
      course,
      values: {
        title: course.title,
        description: course.description,
        categoryId: course.categoryId,
        instructorId: course.instructorId,
        status: course.status,
        published: course.published,
      },
      flash,
    });
  } catch (err) {
    return next(err);
  }
};

export const updateAdminCourse = async (req, res, next) => {
  const values = normalizeCoursePayload(req.body);

  try {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: { category: { select: { id: true, name: true } } },
    });

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/admin/courses");
    }

    if (!values.title || !values.description || !values.categoryId || !values.instructorId) {
      return renderCourseForm({
        res,
        view: "admin/courses/edit",
        course,
        values,
        flash: { type: "error", message: "Title, description, category, and instructor are required" },
        status: 400,
      });
    }

    if (!STATUSES.includes(values.status)) {
      return renderCourseForm({
        res,
        view: "admin/courses/edit",
        course,
        values,
        flash: { type: "error", message: "Invalid status" },
        status: 400,
      });
    }

    const [category, instructor, slug] = await Promise.all([
      prisma.category.findUnique({
        where: { id: values.categoryId },
        select: { id: true },
      }),
      prisma.user.findFirst({
        where: { id: values.instructorId, role: "INSTRUCTOR" },
        select: { id: true },
      }),
      values.title === course.title ? Promise.resolve(course.slug) : buildUniqueSlug(values.title, course.id),
    ]);

    if (!category) {
      return renderCourseForm({
        res,
        view: "admin/courses/edit",
        course,
        values,
        flash: { type: "error", message: "Invalid category" },
        status: 400,
      });
    }

    if (!instructor) {
      return renderCourseForm({
        res,
        view: "admin/courses/edit",
        course,
        values,
        flash: { type: "error", message: "Select a valid instructor" },
        status: 400,
      });
    }

    await prisma.course.update({
      where: { id: req.params.id },
      data: {
        title: values.title,
        slug,
        description: values.description,
        categoryId: values.categoryId,
        instructorId: values.instructorId,
        status: values.status,
        published: values.published,
        publishedAt: values.published
          ? course.publishedAt || new Date()
          : null,
      },
    });

    req.session.flash = { type: "success", message: "Course updated" };
    return res.redirect("/admin/courses");
  } catch (err) {
    if (err?.code === "P2002") {
      const course = await prisma.course.findUnique({
        where: { id: req.params.id },
        include: { category: { select: { id: true, name: true } } },
      });

      if (course) {
        return renderCourseForm({
          res,
          view: "admin/courses/edit",
          course,
          values,
          flash: { type: "error", message: "A course with that title or slug already exists" },
          status: 400,
        });
      }
    }

    return next(err);
  }
};

export const deleteAdminCourse = async (req, res, next) => {
  try {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      select: { id: true, title: true },
    });

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/admin/courses");
    }

    await deleteCourseTree(course.id);

    req.session.flash = { type: "success", message: `Course deleted: ${course.title}` };
    return res.redirect("/admin/courses");
  } catch (err) {
    return next(err);
  }
};
