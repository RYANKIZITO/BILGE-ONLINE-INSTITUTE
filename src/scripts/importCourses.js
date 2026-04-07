import fs from "fs/promises";
import path from "path";
import mammoth from "mammoth";
import { prisma } from "../config/prisma.js";
import { fileURLToPath } from "url";

const DATA_DIR = path.join(process.cwd(), "data");
const CATALOG_FILE = path.join(DATA_DIR, "Online course catalogue.docx");
const DEFAULT_CATEGORY_NAME = "Tech & Digital Skills";

const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const sanitizeText = (value) =>
  String(value || "")
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const sanitizeTextPreserveNewlines = (value) =>
  String(value || "")
    .replace(/\\n/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

const extractLines = (text) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

const findSystemInstructor = async () => {
  const email = "system@bilge.local";
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) return existing;

  return prisma.user.create({
    data: {
      name: "System Instructor",
      email,
      password: "SYSTEM_ACCOUNT_NO_LOGIN",
      role: "INSTRUCTOR",
    },
  });
};

const extractDetailedTitle = (lines) => {
  const isSkip = (line) =>
    /^COURSE\s*#?\d+/i.test(line) || /FLAGSHIP PROGRAM/i.test(line);

  const candidate = lines.find((line) => !isSkip(line) && line.length >= 6);
  return sanitizeText(candidate || lines[0] || "Untitled Program");
};

const extractHeadings = (lines, title) => {
  const normalizeHeading = (line) =>
    line.replace(/^\s*(\d+[\.\)]\s+|[-•]\s+)/, "").trim();

  const headingCandidates = lines.filter((line) => {
    const normalized = normalizeHeading(line);
    return /^(who this course is for|what you will learn|requirements|overview|introduction|course outline|modules|lessons|objectives|outcomes|curriculum|assessment)/i.test(
      normalized
    );
  });

  const unique = Array.from(
    new Set(
      headingCandidates
        .map((line) => sanitizeText(normalizeHeading(line)))
        .filter((line) => line && line.toLowerCase() !== title.toLowerCase())
    )
  );

  return unique;
};

const normalizeCategoryKey = (value) =>
  sanitizeText(value)
    .toLowerCase()
    .replace(/\s*&\s*/g, " and ")
    .replace(/\//g, " ")
    .replace(/[-–—]/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const CATEGORY_ALIASES = {
  "tech and digital skills": "Tech & Digital Skills",
  "business and management": "Business & Management",
  "finance and professional services": "Finance & Professional Services",
  "marketing and communications": "Marketing & Communications",
  "personal and professional development": "Personal & Professional Development",
  "emerging future focused domains": "Emerging / Future-Focused Domains",
  "emerging and future focused domains": "Emerging / Future-Focused Domains",
  "language and communication": "Language & Communication",
  "languages and communication": "Language & Communication",
  "soft skills and life skills": "Soft Skills & Life Skills",
  "specialized healthcare": "Specialized Healthcare",
  "education": "Education",

  "sustainability": "Emerging / Future-Focused Domains",
};

const loadCategoryMap = async () => {
  const categories = await prisma.category.findMany({
    select: { id: true, name: true },
  });

  if (categories.length === 0) {
    throw new Error("No categories found. Seed Category before importing courses.");
  }

  const byName = categories.reduce((acc, category) => {
    acc[category.name] = category.id;
    return acc;
  }, {});

  const normalizedToDbName = categories.reduce((acc, category) => {
    acc[normalizeCategoryKey(category.name)] = category.name;
    return acc;
  }, {});

  return {
    byName,
    normalizedToDbName,
  };
};

const resolveCategoryName = (rawName, categoryMap) => {
  const cleaned = sanitizeText(rawName);
  if (!cleaned) return null;

  if (categoryMap.byName[cleaned]) {
    return cleaned;
  }

  const normalized = normalizeCategoryKey(cleaned);

  if (
    CATEGORY_ALIASES[normalized] &&
    categoryMap.byName[CATEGORY_ALIASES[normalized]]
  ) {
    return CATEGORY_ALIASES[normalized];
  }

  if (categoryMap.normalizedToDbName[normalized]) {
    return categoryMap.normalizedToDbName[normalized];
  }

  return null;
};

const upsertCourse = async ({
  title,
  description,
  published,
  status,
  instructorId,
  categoryId,
}) => {
  const safeTitle = sanitizeText(title);
  const safeDescription = sanitizeText(description);
  const slug = slugify(safeTitle);

  return prisma.course.upsert({
    where: { slug },
    update: {
      title: safeTitle,
      description: safeDescription,
      published,
      status,
      instructorId,
      categoryId,
    },
    create: {
      title: safeTitle,
      description: safeDescription,
      published,
      status,
      slug,
      price: 0,
      instructorId,
      categoryId,
    },
  });
};

export const importCourses = async ({ disconnect = false } = {}) => {
  let catalogCount = 0;
  let detailedCount = 0;
  let lessonCount = 0;

  try {
    const instructor = await findSystemInstructor();
    const categoryMap = await loadCategoryMap();
    const categoryIdByName = categoryMap.byName;

    if (!categoryIdByName[DEFAULT_CATEGORY_NAME]) {
      throw new Error(
        `Default category not found in DB: ${DEFAULT_CATEGORY_NAME}`
      );
    }

    const catalogBuffer = await fs.readFile(CATALOG_FILE);
    const catalogText = (await mammoth.extractRawText({ buffer: catalogBuffer })).value;
    const rawCatalogTitles = extractLines(catalogText);

    const catalogEntries = [];
    const catalogCategoryBySlug = {};

    const getCategoryHeading = (line) => {
      const match = line.match(/^(?:[IVXLCDM]+|[A-Z])\.\s+(.+)$/i);
      const candidate = match ? sanitizeText(match[1]) : sanitizeText(line);
      return resolveCategoryName(candidate, categoryMap);
    };

    let currentCategory = null;

    for (const rawLine of rawCatalogTitles) {
      const line = sanitizeText(rawLine);

      if (!line || line.length < 4) continue;
      if (/@/.test(line)) continue;
      if (/bilge online institute/i.test(line)) continue;
      if (/comprehensive online courses/i.test(line)) continue;
      if (/^[\W_]+$/.test(line)) continue;

      const categoryHeading = getCategoryHeading(line);

      if (categoryHeading) {
        currentCategory = categoryHeading;
        continue;
      }

      if (!currentCategory) {
        throw new Error(`Missing category heading for catalog course: ${line}`);
      }

      const title = line.replace(/^\d+\.\s+|^\d+\)\s+|^\d+\s*-\s+/, "");
      const slug = slugify(title);

      catalogEntries.push({
        title,
        slug,
        categoryName: currentCategory,
      });

      catalogCategoryBySlug[slug] = currentCategory;
    }

    const entries = await fs.readdir(DATA_DIR);
    const docxFiles = entries.filter(
      (f) => f.startsWith("Course_") && f.endsWith(".docx")
    );

    for (const file of docxFiles) {
      const buffer = await fs.readFile(path.join(DATA_DIR, file));
      const { value } = await mammoth.extractRawText({ buffer });
      const lines = extractLines(value);
      const title = extractDetailedTitle(lines);
      const headings = extractHeadings(lines, title);
      const description = sanitizeText(
        lines[1] || "Course overview will be available soon."
      );
      const overviewContent = sanitizeTextPreserveNewlines(value);
      const slug = slugify(title);

      const categoryName = catalogCategoryBySlug[slug];
      let categoryId = categoryName ? categoryIdByName[categoryName] : null;

      if (!categoryId) {
        const existing = await prisma.course.findUnique({
          where: { slug },
          select: { categoryId: true },
        });

        categoryId = existing?.categoryId || null;
      }

      if (!categoryId) {
        console.warn(
          `Category missing for detailed course "${title}". Assigning to ${DEFAULT_CATEGORY_NAME}.`
        );
        categoryId = categoryIdByName[DEFAULT_CATEGORY_NAME];
      }

      const course = await upsertCourse({
        title,
        description,
        published: true,
        status: "READY",
        instructorId: instructor.id,
        categoryId,
      });

      await prisma.lesson.deleteMany({ where: { courseId: course.id } });

      const lessonPayload = [
        {
          courseId: course.id,
          title: "Overview",
          content: overviewContent,
          position: 1,
          published: true,
        },
        ...headings.map((heading, index) => ({
          courseId: course.id,
          title: sanitizeText(heading),
          content: "",
          position: index + 2,
          published: true,
        })),
      ];

      await prisma.lesson.createMany({
        data: lessonPayload,
      });

      detailedCount += 1;
      lessonCount += lessonPayload.length;
    }

    for (const entry of catalogEntries) {
      const categoryId = categoryIdByName[entry.categoryName];

      const existing = await prisma.course.findUnique({
        where: { slug: entry.slug },
        select: { status: true },
      });

      if (existing?.status === "READY") {
        await prisma.course.update({
          where: { slug: entry.slug },
          data: { categoryId },
        });
        continue;
      }

      await upsertCourse({
        title: entry.title,
        description:
          "This programme is part of the Bilge Online Institute professional catalog. Detailed curriculum outline will be released soon.",
        published: true,
        status: "COMING_SOON",
        instructorId: instructor.id,
        categoryId,
      });

      catalogCount += 1;
    }

    console.log(
      `Import complete. Catalog courses: ${catalogCount}, detailed courses: ${detailedCount}, lessons: ${lessonCount}`
    );

    return { catalogCount, detailedCount, lessonCount };
  } finally {
    if (disconnect) {
      await prisma.$disconnect();
    }
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  importCourses({ disconnect: true }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}