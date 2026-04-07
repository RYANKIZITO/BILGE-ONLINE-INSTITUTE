import { prisma } from "../../config/prisma.js";
import {
  getCareersContent,
  getLeadershipProfilesContent,
} from "../website/website.service.js";

const CONTENT_STATUSES = ["DRAFT", "PUBLISHED"];
const LEADERSHIP_GROUPS = [
  { value: "trustee", label: "Board of Trustees" },
  { value: "administration", label: "Institute Administration" },
];

const toSlug = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const normalizeText = (value) => String(value || "").trim();
const normalizeDateInput = (value) => {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};
const normalizeCheckbox = (value) =>
  value === true || value === "true" || value === "on" || value === "1";
const parseInteger = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseLineList = (value) =>
  String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

const parseDelimitedList = (value, expectedFields) =>
  String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const segments = line.split("|").map((part) => part.trim());
      const item = {};
      expectedFields.forEach((field, index) => {
        item[field] = segments[index] || "";
      });
      return item;
    })
    .filter((item) => expectedFields.every((field) => item[field]));

const buildDelimitedList = (items = [], fields = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => fields.map((field) => normalizeText(item?.[field])).join(" | "))
    .join("\n");

const loadCmsLeadershipProfiles = async () => {
  const leadership = await getLeadershipProfilesContent();
  return {
    trustees: leadership.trustees.map((item, index) => ({
      ...item,
      sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index,
    })),
    administrators: leadership.administrators.map((item, index) => ({
      ...item,
      sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index,
    })),
  };
};

const loadInstructorCmsProfiles = async () =>
  prisma.user.findMany({
    where: { role: "INSTRUCTOR" },
    orderBy: [{ fullName: "asc" }, { name: "asc" }],
    include: {
      instructorProfile: true,
      courses: {
        where: { published: true, status: "READY" },
        select: { id: true },
      },
    },
  });

const loadCmsPageData = async () => {
  const [leadership, instructorUsers, blogCategories, blogPosts, careers] =
    await Promise.all([
      loadCmsLeadershipProfiles(),
      loadInstructorCmsProfiles(),
      prisma.blogCategory.findMany({
        orderBy: [{ name: "asc" }],
      }),
      prisma.blogPost.findMany({
        include: { category: true },
        orderBy: [{ updatedAt: "desc" }],
      }),
      getCareersContent(),
    ]);

  return {
    leadership,
    instructors: instructorUsers.map((user) => ({
      id: user.id,
      name: user.fullName || user.name,
      email: user.email,
      profilePhotoUrl: user.profilePhotoUrl || "",
      publishedCourseCount: user.courses.length,
      profile: user.instructorProfile || null,
    })),
    blogCategories,
    blogPosts,
    careers,
  };
};

const setFlash = (req, type, message) => {
  req.session.flash = { type, message };
};

const redirectToCms = (res, hash = "") => res.redirect(`/admin/cms${hash}`);

const getUploadedProfilePhotoUrl = (req) =>
  req.file?.filename ? `/uploads/${req.file.filename}` : null;

const upsertSiteSetting = async (key, value) =>
  prisma.siteSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });

const buildUniqueSlug = async (modelName, value, excludeId = null) => {
  const baseSlug = toSlug(value) || modelName;
  let slug = baseSlug;
  let counter = 2;

  while (true) {
    const existing = await prisma[modelName].findFirst({
      where: {
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
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

const buildInstructorSlug = async (value, excludeUserId = null) => {
  const baseSlug = toSlug(value) || "instructor";
  let slug = baseSlug;
  let counter = 2;

  while (true) {
    const existing = await prisma.instructorProfile.findFirst({
      where: {
        slug,
        ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
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

export const getAdminCmsPage = async (req, res, next) => {
  try {
    const flash = req.session.flash || null;
    req.session.flash = null;
    const data = await loadCmsPageData();

    return res.render("admin/cms/index", {
      user: req.session.user,
      themePreference: req.session.user?.themePreference || "light",
      flash,
      today: new Date().toISOString().slice(0, 10),
      leadershipGroups: LEADERSHIP_GROUPS,
      blogStatuses: CONTENT_STATUSES,
      careersFormState: buildCmsFormState(data.careers),
      ...data,
    });
  } catch (error) {
    return next(error);
  }
};

export const createLeadershipProfile = async (req, res, next) => {
  try {
    if (req.fileValidationError) {
      setFlash(req, "error", req.fileValidationError);
      return redirectToCms(res, "#leadership");
    }

    const group = normalizeText(req.body.group);
    const leadership = await loadCmsLeadershipProfiles();
    const targetKey = group === "administration" ? "administrators" : "trustees";
    const currentGroup = leadership[targetKey];
    const name = normalizeText(req.body.name);
    const role = normalizeText(req.body.role);
    const office = normalizeText(req.body.office);
    const summary = normalizeText(req.body.summary);

    if (!role || !office || !summary) {
      setFlash(req, "error", "Role, office, and summary are required for leadership profiles.");
      return redirectToCms(res, "#leadership");
    }

    currentGroup.push({
      id: `${targetKey}-${toSlug(name || role)}-${Date.now()}`,
      sortOrder: parseInteger(req.body.sortOrder, currentGroup.length),
      name: name || null,
      role,
      office,
      summary,
      label: normalizeText(req.body.label) || (group === "administration" ? "Institute leadership" : "Trustee"),
      profilePhotoUrl: getUploadedProfilePhotoUrl(req),
      resumeHighlights: parseLineList(req.body.resumeHighlights),
    });

    await upsertSiteSetting("leadership_profiles", leadership);
    setFlash(req, "success", "Leadership profile created.");
    return redirectToCms(res, "#leadership");
  } catch (error) {
    return next(error);
  }
};

export const updateLeadershipProfile = async (req, res, next) => {
  try {
    if (req.fileValidationError) {
      setFlash(req, "error", req.fileValidationError);
      return redirectToCms(res, "#leadership");
    }

    const profileId = req.params.id;
    const group = normalizeText(req.body.group);
    const leadership = await loadCmsLeadershipProfiles();
    const targetKey = group === "administration" ? "administrators" : "trustees";
    const role = normalizeText(req.body.role);
    const office = normalizeText(req.body.office);
    const summary = normalizeText(req.body.summary);
    const existingProfile =
      leadership.trustees.find((item) => item.id === profileId) ||
      leadership.administrators.find((item) => item.id === profileId) ||
      null;

    if (!role || !office || !summary) {
      setFlash(req, "error", "Role, office, and summary are required for leadership profiles.");
      return redirectToCms(res, "#leadership");
    }

    leadership.trustees = leadership.trustees.filter((item) => item.id !== profileId);
    leadership.administrators = leadership.administrators.filter((item) => item.id !== profileId);

    leadership[targetKey].push({
      id: profileId,
      sortOrder: parseInteger(req.body.sortOrder, leadership[targetKey].length),
      name: normalizeText(req.body.name) || null,
      role,
      office,
      summary,
      label:
        normalizeText(req.body.label) ||
        (group === "administration" ? "Institute leadership" : "Trustee"),
      profilePhotoUrl: getUploadedProfilePhotoUrl(req) || existingProfile?.profilePhotoUrl || null,
      resumeHighlights: parseLineList(req.body.resumeHighlights),
    });

    await upsertSiteSetting("leadership_profiles", leadership);
    setFlash(req, "success", "Leadership profile updated.");
    return redirectToCms(res, "#leadership");
  } catch (error) {
    return next(error);
  }
};

export const deleteLeadershipProfile = async (req, res, next) => {
  try {
    const profileId = req.params.id;
    const leadership = await loadCmsLeadershipProfiles();
    leadership.trustees = leadership.trustees.filter((item) => item.id !== profileId);
    leadership.administrators = leadership.administrators.filter((item) => item.id !== profileId);
    await upsertSiteSetting("leadership_profiles", leadership);
    setFlash(req, "success", "Leadership profile removed.");
    return redirectToCms(res, "#leadership");
  } catch (error) {
    return next(error);
  }
};

export const updateInstructorCmsProfile = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, fullName: true, role: true },
    });

    if (!user || user.role !== "INSTRUCTOR") {
      setFlash(req, "error", "Instructor was not found.");
      return redirectToCms(res, "#instructors");
    }

    const headline = normalizeText(req.body.headline);
    const shortBio = normalizeText(req.body.shortBio);
    const longBio = normalizeText(req.body.longBio);
    const expertise = parseLineList(req.body.expertise);
    const fullName = normalizeText(req.body.fullName);
    const profilePhotoUrl = normalizeText(req.body.profilePhotoUrl);
    const slug = await buildInstructorSlug(
      normalizeText(req.body.slug) || fullName || user.fullName || user.name,
      user.id
    );

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          fullName: fullName || null,
          profilePhotoUrl: profilePhotoUrl || null,
        },
      });

      await tx.instructorProfile.upsert({
        where: { userId: user.id },
        update: {
          slug,
          headline: headline || null,
          shortBio: shortBio || null,
          longBio: longBio || null,
          expertise,
          featured: normalizeCheckbox(req.body.featured),
          visible: normalizeCheckbox(req.body.visible),
          linkedinUrl: normalizeText(req.body.linkedinUrl) || null,
          twitterUrl: normalizeText(req.body.twitterUrl) || null,
          websiteUrl: normalizeText(req.body.websiteUrl) || null,
        },
        create: {
          userId: user.id,
          slug,
          headline: headline || null,
          shortBio: shortBio || null,
          longBio: longBio || null,
          expertise,
          featured: normalizeCheckbox(req.body.featured),
          visible: normalizeCheckbox(req.body.visible) || false,
          linkedinUrl: normalizeText(req.body.linkedinUrl) || null,
          twitterUrl: normalizeText(req.body.twitterUrl) || null,
          websiteUrl: normalizeText(req.body.websiteUrl) || null,
        },
      });
    });

    setFlash(req, "success", "Instructor profile updated.");
    return redirectToCms(res, "#instructors");
  } catch (error) {
    return next(error);
  }
};

export const createBlogCategoryCms = async (req, res, next) => {
  try {
    const name = normalizeText(req.body.name);
    const description = normalizeText(req.body.description);

    if (!name) {
      setFlash(req, "error", "Category name is required.");
      return redirectToCms(res, "#blog-categories");
    }

    const slug = await buildUniqueSlug("blogCategory", name);

    await prisma.blogCategory.create({
      data: { name, slug, description: description || null },
    });

    setFlash(req, "success", "Blog category created.");
    return redirectToCms(res, "#blog-categories");
  } catch (error) {
    return next(error);
  }
};

export const updateBlogCategoryCms = async (req, res, next) => {
  try {
    const id = req.params.id;
    const name = normalizeText(req.body.name);
    const description = normalizeText(req.body.description);

    if (!name) {
      setFlash(req, "error", "Category name is required.");
      return redirectToCms(res, "#blog-categories");
    }

    const slug = await buildUniqueSlug("blogCategory", name, id);

    await prisma.blogCategory.update({
      where: { id },
      data: { name, slug, description: description || null },
    });

    setFlash(req, "success", "Blog category updated.");
    return redirectToCms(res, "#blog-categories");
  } catch (error) {
    return next(error);
  }
};

export const deleteBlogCategoryCms = async (req, res, next) => {
  try {
    const id = req.params.id;
    const attachedPosts = await prisma.blogPost.count({ where: { categoryId: id } });

    if (attachedPosts > 0) {
      setFlash(req, "error", "Move or delete the posts in this category before deleting it.");
      return redirectToCms(res, "#blog-categories");
    }

    await prisma.blogCategory.delete({ where: { id } });
    setFlash(req, "success", "Blog category deleted.");
    return redirectToCms(res, "#blog-categories");
  } catch (error) {
    return next(error);
  }
};

export const createBlogPostCms = async (req, res, next) => {
  try {
    const title = normalizeText(req.body.title);
    const excerpt = normalizeText(req.body.excerpt);
    const content = normalizeText(req.body.content);

    if (!title || !excerpt || !content) {
      setFlash(req, "error", "Title, excerpt, and content are required for blog posts.");
      return redirectToCms(res, "#blog-posts");
    }

    const slug = await buildUniqueSlug("blogPost", title);
    await prisma.blogPost.create({
      data: {
        title,
        slug,
        excerpt,
        content,
        featuredImageUrl: normalizeText(req.body.featuredImageUrl) || null,
        authorName: normalizeText(req.body.authorName) || "Bilge Online Institute",
        metaTitle: normalizeText(req.body.metaTitle) || null,
        metaDescription: normalizeText(req.body.metaDescription) || null,
        featured: normalizeCheckbox(req.body.featured),
        status: CONTENT_STATUSES.includes(normalizeText(req.body.status))
          ? normalizeText(req.body.status)
          : "PUBLISHED",
        publishedAt:
          normalizeText(req.body.status) === "PUBLISHED" ? new Date() : null,
        categoryId: normalizeText(req.body.categoryId) || null,
      },
    });

    setFlash(req, "success", "Insight post created.");
    return redirectToCms(res, "#blog-posts");
  } catch (error) {
    return next(error);
  }
};

export const updateBlogPostCms = async (req, res, next) => {
  try {
    const id = req.params.id;
    const title = normalizeText(req.body.title);
    const excerpt = normalizeText(req.body.excerpt);
    const content = normalizeText(req.body.content);
    const status = CONTENT_STATUSES.includes(normalizeText(req.body.status))
      ? normalizeText(req.body.status)
      : "PUBLISHED";

    if (!title || !excerpt || !content) {
      setFlash(req, "error", "Title, excerpt, and content are required for blog posts.");
      return redirectToCms(res, "#blog-posts");
    }

    const existing = await prisma.blogPost.findUnique({
      where: { id },
      select: { publishedAt: true },
    });
    const slug = await buildUniqueSlug("blogPost", title, id);

    await prisma.blogPost.update({
      where: { id },
      data: {
        title,
        slug,
        excerpt,
        content,
        featuredImageUrl: normalizeText(req.body.featuredImageUrl) || null,
        authorName: normalizeText(req.body.authorName) || "Bilge Online Institute",
        metaTitle: normalizeText(req.body.metaTitle) || null,
        metaDescription: normalizeText(req.body.metaDescription) || null,
        featured: normalizeCheckbox(req.body.featured),
        status,
        publishedAt: status === "PUBLISHED" ? existing?.publishedAt || new Date() : null,
        categoryId: normalizeText(req.body.categoryId) || null,
      },
    });

    setFlash(req, "success", "Insight post updated.");
    return redirectToCms(res, "#blog-posts");
  } catch (error) {
    return next(error);
  }
};

export const deleteBlogPostCms = async (req, res, next) => {
  try {
    await prisma.blogPost.delete({ where: { id: req.params.id } });
    setFlash(req, "success", "Insight post deleted.");
    return redirectToCms(res, "#blog-posts");
  } catch (error) {
    return next(error);
  }
};

export const updateCareersCms = async (req, res, next) => {
  try {
    const current = await getCareersContent();
    const nextValue = {
      ...current,
      hero: {
        eyebrow: normalizeText(req.body.heroEyebrow) || current.hero.eyebrow,
        title: normalizeText(req.body.heroTitle) || current.hero.title,
        subtitle: normalizeText(req.body.heroSubtitle) || current.hero.subtitle,
      },
      metrics: parseDelimitedList(req.body.metrics, ["value", "label"]),
      highlights: parseDelimitedList(req.body.highlights, ["title", "body"]),
      openings: parseDelimitedList(req.body.openings, ["title", "meta", "body"]),
      principles: parseLineList(req.body.principles),
      process: parseDelimitedList(req.body.process, ["title", "body"]),
      employmentTypeOptions: parseLineList(req.body.employmentTypeOptions),
      experienceLevelOptions: parseLineList(req.body.experienceLevelOptions),
      vacancies: current.vacancies,
    };

    await upsertSiteSetting("careers_content", nextValue);
    setFlash(req, "success", "Careers page settings updated.");
    return redirectToCms(res, "#careers");
  } catch (error) {
    return next(error);
  }
};

export const createCareerVacancyCms = async (req, res, next) => {
  try {
    const current = await getCareersContent();
    const title = normalizeText(req.body.title);
    const body = normalizeText(req.body.body);

    if (!title || !body) {
      setFlash(req, "error", "Vacancy title and description are required.");
      return redirectToCms(res, "#careers-vacancies");
    }

    current.vacancies.push({
      id: `vacancy-${toSlug(title)}-${Date.now()}`,
      title,
      meta: normalizeText(req.body.meta),
      body,
      active: normalizeCheckbox(req.body.active),
      deadlineDate: normalizeDateInput(req.body.deadlineDate),
      sortOrder: parseInteger(req.body.sortOrder, current.vacancies.length),
    });

    await upsertSiteSetting("careers_content", current);
    setFlash(req, "success", "Career vacancy created.");
    return redirectToCms(res, "#careers-vacancies");
  } catch (error) {
    return next(error);
  }
};

export const updateCareerVacancyCms = async (req, res, next) => {
  try {
    const current = await getCareersContent();
    const title = normalizeText(req.body.title);
    const body = normalizeText(req.body.body);

    if (!title || !body) {
      setFlash(req, "error", "Vacancy title and description are required.");
      return redirectToCms(res, "#careers-vacancies");
    }

    current.vacancies = current.vacancies.map((vacancy) =>
      vacancy.id === req.params.id
        ? {
            ...vacancy,
            title,
            meta: normalizeText(req.body.meta),
            body,
            active: normalizeCheckbox(req.body.active),
            deadlineDate: normalizeDateInput(req.body.deadlineDate),
            sortOrder: parseInteger(req.body.sortOrder, vacancy.sortOrder),
          }
        : vacancy
    );

    await upsertSiteSetting("careers_content", current);
    setFlash(req, "success", "Career vacancy updated.");
    return redirectToCms(res, "#careers-vacancies");
  } catch (error) {
    return next(error);
  }
};

export const deleteCareerVacancyCms = async (req, res, next) => {
  try {
    const current = await getCareersContent();
    current.vacancies = current.vacancies.filter((vacancy) => vacancy.id !== req.params.id);
    await upsertSiteSetting("careers_content", current);
    setFlash(req, "success", "Career vacancy removed.");
    return redirectToCms(res, "#careers-vacancies");
  } catch (error) {
    return next(error);
  }
};

export const buildCmsFormState = (careers) => ({
  metricsText: buildDelimitedList(careers.metrics, ["value", "label"]),
  highlightsText: buildDelimitedList(careers.highlights, ["title", "body"]),
  openingsText: buildDelimitedList(careers.openings, ["title", "meta", "body"]),
  principlesText: careers.principles.join("\n"),
  processText: buildDelimitedList(careers.process, ["title", "body"]),
  employmentTypeOptionsText: careers.employmentTypeOptions.join("\n"),
  experienceLevelOptionsText: careers.experienceLevelOptions.join("\n"),
});
