import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import mammoth from "mammoth";
import { hashPassword } from "../src/utils/password.js";

const prisma = new PrismaClient();

const DATA_DIR = path.join(process.cwd(), "data");
const COURSE_DOCX_PATTERN = /^Course_.*\.docx$/i;

const COURSE_PRICING = [
  { title: "Data Science & Analytics", priceUgandanUsd: 180, priceForeignUsd: 250, currency: "USD" },
  { title: "Cloud Computing (AWS / Azure / Google Cloud)", priceUgandanUsd: 180, priceForeignUsd: 250, currency: "USD" },
  { title: "DevOps & CI/CD", priceUgandanUsd: 150, priceForeignUsd: 230, currency: "USD" },
  { title: "Mobile App Development (Android / iOS)", priceUgandanUsd: 150, priceForeignUsd: 230, currency: "USD" },
  { title: "Block chain & Cryptocurrency", priceUgandanUsd: 150, priceForeignUsd: 230, currency: "USD" },
  { title: "UX/UI Design", priceUgandanUsd: 120, priceForeignUsd: 230, currency: "USD" },
  { title: "Database Management & SQL", priceUgandanUsd: 120, priceForeignUsd: 230, currency: "USD" },
  { title: "Video Editing & Motion Graphics", priceUgandanUsd: 90, priceForeignUsd: 150, currency: "USD" },
  { title: "3D Design & Animation (Blender / Maya)", priceUgandanUsd: 90, priceForeignUsd: 150, currency: "USD" },
  { title: "Programming", priceUgandanUsd: 90, priceForeignUsd: 150, currency: "USD" },
  { title: "Cyber Security", priceUgandanUsd: 150, priceForeignUsd: 250, currency: "USD" },
  { title: "Website Designing", priceUgandanUsd: 120, priceForeignUsd: 230, currency: "USD" },
  { title: "AI and ML", priceUgandanUsd: 180, priceForeignUsd: 250, currency: "USD" },
  { title: "FinTech and E-commerce", priceUgandanUsd: 180, priceForeignUsd: 250, currency: "USD" },
  { title: "Computer applications", priceUgandanUsd: 60, priceForeignUsd: 100, currency: "USD" },
  { title: "Canvas, Adobe Photoshop illustrator", priceUgandanUsd: 60, priceForeignUsd: 100, currency: "USD" },
  { title: "Project Management", priceUgandanUsd: 120, priceForeignUsd: 180, currency: "USD" },
  { title: "Digital Marketing", priceUgandanUsd: 100, priceForeignUsd: 160, currency: "USD" },
  { title: "Entrepreneurship & Startup Fundamentals", priceUgandanUsd: 80, priceForeignUsd: 150, currency: "USD" },
  { title: "Operations & Supply Chain Management", priceUgandanUsd: 80, priceForeignUsd: 150, currency: "USD" },
  { title: "Strategic Leadership", priceUgandanUsd: 120, priceForeignUsd: 230, currency: "USD" },
  { title: "Business Analytics", priceUgandanUsd: 100, priceForeignUsd: 160, currency: "USD" },
  { title: "E-Commerce Management", priceUgandanUsd: 80, priceForeignUsd: 150, currency: "USD" },
  { title: "Remote Work / Virtual Collaboration Skills", priceUgandanUsd: 60, priceForeignUsd: 100, currency: "USD" },
  { title: "Customer Experience (CX) Management", priceUgandanUsd: 80, priceForeignUsd: 150, currency: "USD" },
  { title: "Public Administration", priceUgandanUsd: 60, priceForeignUsd: 100, currency: "USD" },
  { title: "Human Resource Management", priceUgandanUsd: 80, priceForeignUsd: 150, currency: "USD" },
  { title: "Business Administration", priceUgandanUsd: 80, priceForeignUsd: 150, currency: "USD" },
  { title: "Financial Modeling & Valuation", priceUgandanUsd: 120, priceForeignUsd: 230, currency: "USD" },
  { title: "Investment Analysis & Portfolio Management", priceUgandanUsd: 120, priceForeignUsd: 230, currency: "USD" },
  { title: "Accounting Essentials", priceUgandanUsd: 120, priceForeignUsd: 230, currency: "USD" },
  { title: "Risk Management", priceUgandanUsd: 90, priceForeignUsd: 160, currency: "USD" },
  { title: "Banking Operations", priceUgandanUsd: 100, priceForeignUsd: 160, currency: "USD" },
  { title: "Insurance Fundamentals", priceUgandanUsd: 120, priceForeignUsd: 230, currency: "USD" },
  { title: "Financial Planning & Wealth Management", priceUgandanUsd: 120, priceForeignUsd: 230, currency: "USD" },
  { title: "Family Business Management", priceUgandanUsd: 120, priceForeignUsd: 230, currency: "USD" },
  { title: "Content Marketing", priceUgandanUsd: 90, priceForeignUsd: 160, currency: "USD" },
  { title: "Social Media Strategy & Analytics", priceUgandanUsd: 90, priceForeignUsd: 160, currency: "USD" },
  { title: "Copywriting & Storytelling", priceUgandanUsd: 60, priceForeignUsd: 100, currency: "USD" },
  { title: "Brand Strategy", priceUgandanUsd: 90, priceForeignUsd: 150, currency: "USD" },
  { title: "Influencer Marketing", priceUgandanUsd: 70, priceForeignUsd: 120, currency: "USD" },
  { title: "Podcasting & Audio Production", priceUgandanUsd: 70, priceForeignUsd: 120, currency: "USD" },
  { title: "Emotional Intelligence", priceUgandanUsd: 40, priceForeignUsd: 70, currency: "USD" },
  { title: "Public Speaking & Presentation Skills", priceUgandanUsd: 50, priceForeignUsd: 90, currency: "USD" },
  { title: "Career Development & Interview Skills", priceUgandanUsd: 50, priceForeignUsd: 90, currency: "USD" },
  { title: "Time Management", priceUgandanUsd: 40, priceForeignUsd: 70, currency: "USD" },
  { title: "Robotics Process Automation (RPA)", priceUgandanUsd: 150, priceForeignUsd: 250, currency: "USD" },
  { title: "Ethical Hacking (Advanced Cyber)", priceUgandanUsd: 70, priceForeignUsd: 120, currency: "USD" },
  { title: "Quantum Computing Basics", priceUgandanUsd: 150, priceForeignUsd: 250, currency: "USD" },
  { title: "Digital Twins & Smart Cities", priceUgandanUsd: 80, priceForeignUsd: 150, currency: "USD" },
  { title: "Spanish", priceUgandanUsd: 70, priceForeignUsd: 120, currency: "USD" },
  { title: "Arabic", priceUgandanUsd: 70, priceForeignUsd: 120, currency: "USD" },
  { title: "Turkish", priceUgandanUsd: 80, priceForeignUsd: 150, currency: "USD" },
  { title: "English", priceUgandanUsd: 70, priceForeignUsd: 120, currency: "USD" },
  { title: "French", priceUgandanUsd: 80, priceForeignUsd: 150, currency: "USD" },
  { title: "Chinese", priceUgandanUsd: 80, priceForeignUsd: 150, currency: "USD" },
  { title: "German", priceUgandanUsd: 80, priceForeignUsd: 150, currency: "USD" },
  { title: "Swahili", priceUgandanUsd: 80, priceForeignUsd: 150, currency: "USD" },
  { title: "Conflict Resolution", priceUgandanUsd: 45, priceForeignUsd: 80, currency: "USD" },
  { title: "Leadership Fundamentals", priceUgandanUsd: 45, priceForeignUsd: 80, currency: "USD" },
  { title: "Negotiation Skills", priceUgandanUsd: 45, priceForeignUsd: 90, currency: "USD" },
  { title: "Instructional Design", priceUgandanUsd: 70, priceForeignUsd: 120, currency: "USD" },
  { title: "Online Teaching / E-Learning Design", priceUgandanUsd: 70, priceForeignUsd: 120, currency: "USD" },
  { title: "Psychology", priceUgandanUsd: 90, priceForeignUsd: 160, currency: "USD" },
  { title: "Renewable Energy Fundamentals", priceUgandanUsd: 130, priceForeignUsd: 220, currency: "USD" },
  { title: "Sustainability & Green Skills", priceUgandanUsd: 130, priceForeignUsd: 220, currency: "USD" }
];

const PRICING_TITLES = new Set(COURSE_PRICING.map((course) => course.title));

const normalizePricingTitle = (value) => {
  if (!value) return null;
  return String(value).trim();
};

const extractPricingTitleFromCourseTitle = (title) => {
  const raw = String(title || "").trim();
  if (!raw.toLowerCase().startsWith("certificate in ")) {
    return null;
  }
  const withoutPrefix = raw.slice("certificate in ".length).trim();
  const withoutParen = withoutPrefix.replace(/\s*\(.*\)\s*$/, "").trim();
  return normalizePricingTitle(withoutParen);
};

const SYSTEM_INSTRUCTOR = {
  name: "System Instructor",
  email: "system@bilge.local",
  password: "SYSTEM_ACCOUNT_NO_LOGIN"
};

const slugify = (text) =>
  String(text || "")
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
  String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

const extractDetailedTitle = (lines) => {
  const isSkip = (line) =>
    /^COURSE\s*#?\d+/i.test(line) || /FLAGSHIP PROGRAM/i.test(line);

  const candidate = lines.find((line) => !isSkip(line) && line.length >= 6);
  return sanitizeText(candidate || lines[0] || "Untitled Program");
};

const extractHeadings = (lines, title) => {
  const normalizeHeading = (line) =>
    line.replace(/^\s*(\d+[\.\)]\s+|[-\u2022]\s+)/, "").trim();

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

const deriveCourseStatus = ({
  overviewContent,
  lessonCount = 0,
  curriculumCount = 0,
  assessmentCount = 0
}) => {
  const hasOverview = Boolean(String(overviewContent || "").trim());
  const hasLessons = Number(lessonCount) > 0;
  const hasCurriculum = Number(curriculumCount) > 0;
  const hasAssessments = Number(assessmentCount) > 0;

  return hasOverview || hasLessons || hasCurriculum || hasAssessments
    ? "READY"
    : "COMING_SOON";
};

const buildCourseDescription = (pricingTitle) =>
  `Professional certificate training in ${pricingTitle}. Full curriculum and learning resources are available inside the course.`;

const COURSE_TITLE_OVERRIDES = {
  "Data Science & Analytics":
    "Certificate in Data Science & Analytics (Business/Data Analyst Track)",
  "Programming": "Certificate in Programming Fundamentals (Python Track)",
  "Website Designing":
    "Certificate in Website Designing (WordPress + Practical Web Foundations)",
  "Cyber Security":
    "Certificate in Cyber Security Fundamentals (Entry-Level Skills Track)",
  "Project Management":
    "Certificate in Project Management (Practical + Agile/Scrum Basics Track)",
  "Digital Marketing":
    "Certificate in Digital Marketing (SME + Practical Social Media & Ads Track)",
  "Business Administration":
    "Certificate in Business Administration Essentials (Practical SME + Corporate Readiness Track)",
  "Entrepreneurship & Startup Fundamentals":
    "Certificate in Entrepreneurship & Startup Fundamentals (Practical SME Business Launch Track)",
  "Canvas, Adobe Photoshop illustrator":
    "Certificate in Graphic Design (Canva + Adobe Basics) (Freelance + Business Branding Track)",
  "Video Editing & Motion Graphics":
    "Certificate in Video Editing & Motion Graphics (Content Creation + Freelance Track)",
  "Career Development & Interview Skills":
    "Certificate in Career Development & Interview Skills (Job Readiness + Employability Track)",
  "Public Speaking & Presentation Skills":
    "Certificate in Public Speaking & Presentation Skills (Professional Communication + Leadership Track)",
  "Block chain & Cryptocurrency": "Certificate in Blockchain & Cryptocurrency",
  "Computer applications": "Certificate in Computer applications"
};

const CATEGORY_DEFINITIONS = [
  {
    name: "Tech & Digital Skills",
    pricingTitles: [
      "Data Science & Analytics",
      "Cloud Computing (AWS / Azure / Google Cloud)",
      "DevOps & CI/CD",
      "Mobile App Development (Android / iOS)",
      "Block chain & Cryptocurrency",
      "UX/UI Design",
      "Database Management & SQL",
      "Video Editing & Motion Graphics",
      "3D Design & Animation (Blender / Maya)",
      "Programming",
      "Cyber Security",
      "Website Designing",
      "AI and ML",
      "FinTech and E-commerce",
      "Computer applications",
      "Canvas, Adobe Photoshop illustrator"
    ]
  },
  {
    name: "Business & Management",
    pricingTitles: [
      "Project Management",
      "Digital Marketing",
      "Entrepreneurship & Startup Fundamentals",
      "Operations & Supply Chain Management",
      "Strategic Leadership",
      "Business Analytics",
      "E-Commerce Management",
      "Remote Work / Virtual Collaboration Skills",
      "Customer Experience (CX) Management",
      "Public Administration",
      "Human Resource Management",
      "Business Administration",
      "Family Business Management"
    ]
  },
  {
    name: "Finance & Professional Services",
    pricingTitles: [
      "Financial Modeling & Valuation",
      "Investment Analysis & Portfolio Management",
      "Accounting Essentials",
      "Risk Management",
      "Banking Operations",
      "Insurance Fundamentals",
      "Financial Planning & Wealth Management"
    ]
  },
  {
    name: "Marketing & Communications",
    pricingTitles: [
      "Content Marketing",
      "Social Media Strategy & Analytics",
      "Copywriting & Storytelling",
      "Brand Strategy",
      "Influencer Marketing",
      "Podcasting & Audio Production"
    ]
  },
  {
    name: "Personal & Professional Development",
    pricingTitles: [
      "Emotional Intelligence",
      "Public Speaking & Presentation Skills",
      "Career Development & Interview Skills",
      "Time Management",
      "Negotiation Skills"
    ]
  },
  {
    name: "Emerging / Future-Focused Domains",
    pricingTitles: [
      "Robotics Process Automation (RPA)",
      "Ethical Hacking (Advanced Cyber)",
      "Quantum Computing Basics",
      "Sustainability & Green Skills",
      "Digital Twins & Smart Cities"
    ]
  },
  {
    name: "Language & Communication",
    pricingTitles: [
      "Spanish",
      "Arabic",
      "Turkish",
      "Chinese",
      "French",
      "Swahili",
      "English",
      "German"
    ]
  },
  {
    name: "Soft Skills & Life Skills",
    pricingTitles: [
      "Leadership Fundamentals",
      "Conflict Resolution"
    ]
  },
  {
    name: "Education",
    pricingTitles: [
      "Instructional Design",
      "Online Teaching / E-Learning Design",
      "Psychology"
    ]
  },
  {
    name: "Sustainability",
    pricingTitles: [
      "Renewable Energy Fundamentals"
    ]
  }
];

const CATEGORY_BY_PRICING_TITLE = CATEGORY_DEFINITIONS.reduce((acc, category) => {
  for (const title of category.pricingTitles) {
    acc[title] = category.name;
  }
  return acc;
}, {});

const getSuperAdminEnv = (prefix, label) => {
  const requiredKeys = [
    `${prefix}_EMAIL`,
    `${prefix}_PASSWORD`,
    `${prefix}_NAME`
  ];

  const missing = requiredKeys.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required ${label} environment variable(s): ${missing.join(", ")}`);
  }

  return {
    email: process.env[`${prefix}_EMAIL`],
    password: process.env[`${prefix}_PASSWORD`],
    name: process.env[`${prefix}_NAME`]
  };
};

const ensureSystemInstructor = async () => {
  const hashedPassword = await hashPassword(SYSTEM_INSTRUCTOR.password);

  return prisma.user.upsert({
    where: { email: SYSTEM_INSTRUCTOR.email },
    update: {
      name: SYSTEM_INSTRUCTOR.name,
      password: hashedPassword,
      role: "INSTRUCTOR"
    },
    create: {
      name: SYSTEM_INSTRUCTOR.name,
      email: SYSTEM_INSTRUCTOR.email,
      password: hashedPassword,
      role: "INSTRUCTOR"
    }
  });
};

const upsertCourseSeed = async ({
  title,
  slug,
  description,
  status,
  categoryId,
  instructorId,
  published,
  pricingTitle,
  priceUgandanUsd,
  priceForeignUsd,
  currency
}) => {
  const existingByPricing = await prisma.course.findFirst({
    where: { pricingTitle },
    select: { id: true }
  });

  const data = {
    title,
    slug,
    description,
    status,
    categoryId,
    instructorId,
    published,
    pricingTitle,
    priceUgandanUsd,
    priceForeignUsd,
    currency
  };

  if (existingByPricing) {
    return prisma.course.update({
      where: { id: existingByPricing.id },
      data
    });
  }

  return prisma.course.upsert({
    where: { slug },
    update: data,
    create: data
  });
};

const listSeededCourseDocxFiles = async () => {
  let entries = [];
  try {
    entries = await fs.readdir(DATA_DIR);
  } catch (err) {
    throw new Error(
      `Course content seed folder missing at ${DATA_DIR}. Ensure the data folder is present.`
    );
  }

  return entries.filter((entry) => COURSE_DOCX_PATTERN.test(entry)).sort();
};

const parseSeededCourseDocx = async (fileName) => {
  const buffer = await fs.readFile(path.join(DATA_DIR, fileName));
  const { value } = await mammoth.extractRawText({ buffer });
  const lines = extractLines(value);
  const title = extractDetailedTitle(lines);
  const headings = extractHeadings(lines, title);
  const overviewContent = sanitizeTextPreserveNewlines(value);

  return {
    title,
    slug: slugify(title),
    overviewContent:
      overviewContent || sanitizeText(lines[1] || "Course overview will be available soon."),
    headings,
    sourceFile: fileName
  };
};

const loadSeededCourseContent = async () => {
  const docxFiles = await listSeededCourseDocxFiles();
  if (docxFiles.length === 0) {
    throw new Error("No seeded course overview DOCX files found in the data folder.");
  }

  const parsedEntries = [];
  for (const fileName of docxFiles) {
    parsedEntries.push(await parseSeededCourseDocx(fileName));
  }

  return parsedEntries;
};

const seedCourseOverviewLessons = async (seededContent) => {
  const parsedEntries = seededContent ?? (await loadSeededCourseContent());

  for (const parsed of parsedEntries) {
    const course = await prisma.course.findUnique({
      where: { slug: parsed.slug },
      select: { id: true, title: true }
    });

    if (!course) {
      throw new Error(
        `Seeded course not found for DOCX overview "${parsed.title}" (${parsed.sourceFile}).`
      );
    }

    const existingLessons = await prisma.lesson.count({
      where: { courseId: course.id }
    });

    if (existingLessons > 0) {
      continue;
    }

    const lessonPayload = [
      {
        courseId: course.id,
        title: "Overview",
        content: parsed.overviewContent,
        position: 1,
        published: true
      },
      ...parsed.headings.map((heading, index) => ({
        courseId: course.id,
        title: sanitizeText(heading),
        content: "",
        position: index + 2,
        published: true
      }))
    ];

    await prisma.lesson.createMany({
      data: lessonPayload,
      skipDuplicates: true
    });
  }
};

const syncAllCourseStatuses = async () => {
  const courses = await prisma.course.findMany({
    select: { id: true, status: true }
  });

  for (const course of courses) {
    const [publishedLessonCount, publishedAssessmentCount] = await Promise.all([
      prisma.lesson.count({ where: { courseId: course.id, published: true } }),
      prisma.assessment.count({ where: { courseId: course.id, published: true } })
    ]);

    const newStatus = deriveCourseStatus({
      lessonCount: publishedLessonCount,
      assessmentCount: publishedAssessmentCount
    });

    if (course.status !== newStatus) {
      await prisma.course.update({
        where: { id: course.id },
        data: { status: newStatus }
      });
    }
  }
};

const upsertSiteSetting = async (key, value) =>
  prisma.siteSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  });

const seedWebsiteContent = async () => {
  const aboutSections = {
    mission:
      "Bilge Online Institute exists to provide clear programme information, guided admissions, and structured online learning with reliable academic records.",
    vision:
      "To grow into an online institute where learners can study across disciplines, access academic support, and complete programmes with recognized records and certificates.",
    values: [
      "Academic credibility",
      "Professional presentation",
      "Student-centered clarity",
      "Operational discipline",
      "Scalable digital learning"
    ]
  };

  await prisma.page.upsert({
    where: { slug: "about" },
    update: {
      title: "About Bilge Online Institute",
      excerpt:
        "Bilge Online Institute provides programme information, admissions guidance, and structured online learning with academic records and certificates.",
      heroTitle: "Learn about Bilge Online Institute, its programmes, and its academic approach.",
      heroSubtitle:
        "This page explains the institute's background, learning approach, admissions information, and the academic systems that support enrolled students.",
      content:
        "Bilge Online Institute publishes programme information, admissions guidance, and institutional details on the public website, then supports enrolled students through structured online learning, records, and certificates.",
      sections: aboutSections,
      metaTitle: "About Bilge Online Institute",
      metaDescription:
        "Learn the mission, vision, values, and institutional story behind Bilge Online Institute.",
      published: true
    },
    create: {
      slug: "about",
      title: "About Bilge Online Institute",
      excerpt:
        "Bilge Online Institute provides programme information, admissions guidance, and structured online learning with academic records and certificates.",
      heroTitle: "Learn about Bilge Online Institute, its programmes, and its academic approach.",
      heroSubtitle:
        "This page explains the institute's background, learning approach, admissions information, and the academic systems that support enrolled students.",
      content:
        "Bilge Online Institute publishes programme information, admissions guidance, and institutional details on the public website, then supports enrolled students through structured online learning, records, and certificates.",
      sections: aboutSections,
      metaTitle: "About Bilge Online Institute",
      metaDescription:
        "Learn the mission, vision, values, and institutional story behind Bilge Online Institute.",
      published: true
    }
  });

  await prisma.page.upsert({
    where: { slug: "admissions" },
    update: {
      title: "Admissions and Enrollment",
      excerpt:
        "Understand how to move from discovery into enrollment and learning at Bilge Online Institute.",
      heroTitle: "Admissions and enrollment information for Bilge Online Institute.",
      heroSubtitle:
        "Review the enrollment steps, payment expectations, account setup, and what happens after registration.",
      content:
        "The admissions page explains how to choose a programme, create an account, review tuition, and move into the LMS after enrollment.",
      sections: {
        steps: [
          "Create an account and complete your profile",
          "Explore published programmes and pricing",
          "Choose the right programme and begin enrollment",
          "Move into lessons, support, and final academic proof"
        ]
      },
      metaTitle: "Admissions | Bilge Online Institute",
      metaDescription:
        "Admissions guidance for Bilge Online Institute, including enrollment flow and what happens after joining.",
      published: true
    },
    create: {
      slug: "admissions",
      title: "Admissions and Enrollment",
      excerpt:
        "Understand how to move from discovery into enrollment and learning at Bilge Online Institute.",
      heroTitle: "Admissions and enrollment information for Bilge Online Institute.",
      heroSubtitle:
        "Review the enrollment steps, payment expectations, account setup, and what happens after registration.",
      content:
        "The admissions page explains how to choose a programme, create an account, review tuition, and move into the LMS after enrollment.",
      sections: {
        steps: [
          "Create an account and complete your profile",
          "Explore published programmes and pricing",
          "Choose the right programme and begin enrollment",
          "Move into lessons, support, and final academic proof"
        ]
      },
      metaTitle: "Admissions | Bilge Online Institute",
      metaDescription:
        "Admissions guidance for Bilge Online Institute, including enrollment flow and what happens after joining.",
      published: true
    }
  });

  await upsertSiteSetting("contact_details", {
    instituteName: "Bilge Online Institute",
    supportEmail: "Bilgeonlineinstitute@gmail.com",
    admissionsEmail: "Bilgeonlineinstitute@gmail.com",
    phone: "+256753116500",
    phoneSecondary: "+905518954615",
    address: "Kampala, Uganda",
    supportHours: "Monday to Saturday, 8:00 AM - 6:00 PM",
    socialLinks: [
      {
        platform: "facebook",
        label: "Facebook",
        href: "https://www.facebook.com/bilgeonlineinstitute"
      },
      {
        platform: "instagram",
        label: "Instagram",
        href: "https://www.instagram.com/bilgeonlineinstitute"
      },
      {
        platform: "linkedin",
        label: "LinkedIn",
        href: "https://www.linkedin.com/company/bilge-online-institute"
      },
      {
        platform: "youtube",
        label: "YouTube",
        href: "https://www.youtube.com/@bilgeonlineinstitute"
      },
      {
        platform: "x",
        label: "X",
        href: "https://x.com/bilgeonlineinst"
      },
      {
        platform: "tiktok",
        label: "TikTok",
        href: "https://www.tiktok.com/@bilgeonlineinstitute"
      }
    ]
  });

  await upsertSiteSetting("homepage_hero", {
    eyebrow: "Bilge Online Institute",
    title:
      "Explore programmes, admissions information, and guided online study at Bilge Online Institute.",
    subtitle:
      "Review programme options, understand the admissions process, and move into structured online learning with clear records and certificates."
  });

  const testimonialEntries = [
    {
      slug: "programme-strategy-perspective",
      quote:
        "Bilge feels like a real institute environment rather than a course shelf. The public site and the LMS now reinforce each other clearly.",
      name: "Programme Strategy Perspective",
      role: "Education Operations",
      organization: "Internal review",
      resultHighlight: "Trust and positioning",
      featured: true,
      sortOrder: 1
    },
    {
      slug: "digital-learning-operations-perspective",
      quote:
        "The website creates confidence before enrollment, and the LMS continues that confidence through records, support, and completion proof.",
      name: "Digital Learning Operations Perspective",
      role: "Institute Systems",
      organization: "Internal review",
      resultHighlight: "Continuity from website to LMS",
      featured: true,
      sortOrder: 2
    },
    {
      slug: "student-experience-perspective",
      quote:
        "Bilge now feels more premium and easier to trust because the public experience explains the learning journey before asking the student to commit.",
      name: "Student Experience Perspective",
      role: "Learner Journey",
      organization: "Internal review",
      resultHighlight: "Clearer conversion flow",
      featured: true,
      sortOrder: 3
    }
  ];

  for (const testimonial of testimonialEntries) {
    await prisma.testimonial.upsert({
      where: { slug: testimonial.slug },
      update: testimonial,
      create: testimonial
    });
  }

  const faqEntries = [
    {
      slug: "how-do-i-join-bilge",
      category: "Admissions & Enrollment",
      question: "How do I start studying with Bilge Online Institute?",
      answer:
        "Start by choosing a published programme, creating your account, and submitting your enrollment details. Once your enrollment is confirmed, you can complete your profile and move into the learning platform.",
      featured: true,
      sortOrder: 1
    },
    {
      slug: "can-i-study-online-from-anywhere",
      category: "Study Experience",
      question: "Can I study with Bilge fully online from anywhere?",
      answer:
        "Yes. Bilge is built for online learning, so you can follow lessons, assessments, and course guidance remotely as long as you have a reliable internet connection.",
      featured: true,
      sortOrder: 2
    },
    {
      slug: "how-do-payments-work",
      category: "Fees & Payment",
      question: "How do fees and payments work before I begin classes?",
      answer:
        "Each published programme shows its pricing clearly before enrollment. You can review the fee, complete payment through the available options, and then continue into your student journey once payment is confirmed.",
      featured: true,
      sortOrder: 3
    },
    {
      slug: "do-i-receive-a-certificate",
      category: "Certificates & Support",
      question: "Will I receive a certificate after completing my programme?",
      answer:
        "Yes. Bilge is designed to support academic records, transcripts, and certificates so learners can finish with credible proof of completion.",
      featured: true,
      sortOrder: 4
    },
    {
      slug: "how-do-i-choose-the-right-programme",
      category: "Getting Started",
      question: "How do I choose the right programme for my goals?",
      answer:
        "Review the programme description, duration, pricing, and subject area on the website. If you are unsure, use the contact form and Bilge can guide you toward the best-fit option.",
      featured: false,
      sortOrder: 5
    },
    {
      slug: "what-support-can-i-expect",
      category: "Certificates & Support",
      question: "What kind of support can I expect if I need help before enrolling?",
      answer:
        "You can contact Bilge through the website for admissions guidance, programme questions, fee clarification, and general support before making your final decision.",
      featured: false,
      sortOrder: 6
    }
  ];

  for (const faq of faqEntries) {
    await prisma.fAQ.upsert({
      where: { slug: faq.slug },
      update: faq,
      create: faq
    });
  }

  const blogCategoryStrategy = await prisma.blogCategory.upsert({
    where: { slug: "strategy" },
    update: {
      name: "Strategy",
      description: "Institutional strategy and digital learning architecture."
    },
    create: {
      slug: "strategy",
      name: "Strategy",
      description: "Institutional strategy and digital learning architecture."
    }
  });

  const blogCategoryLearning = await prisma.blogCategory.upsert({
    where: { slug: "learning-design" },
    update: {
      name: "Learning Design",
      description: "Programme, learner, and LMS design thinking."
    },
    create: {
      slug: "learning-design",
      name: "Learning Design",
      description: "Programme, learner, and LMS design thinking."
    }
  });

  const blogPosts = [
    {
      slug: "why-institute-websites-should-lead-into-real-academic-systems",
      title: "Why institute websites should lead into real academic systems",
      excerpt:
        "The strongest education brands do not stop at marketing pages. They guide visitors into real programme, learner, and completion workflows.",
      content:
        "A public website is the first promise an online institute makes. When that promise ends at static information, trust weakens. When it leads into a real LMS with learning continuity, student support, and proof of completion, the institute feels far more credible.",
      authorName: "Bilge Editorial Team",
      categoryId: blogCategoryStrategy.id,
      featured: true,
      status: "PUBLISHED",
      publishedAt: new Date()
    },
    {
      slug: "what-makes-an-lms-feel-credible-to-modern-learners",
      title: "What makes an LMS feel credible to modern learners",
      excerpt:
        "Modern learners trust systems that show structure, progression, and proof instead of simply listing lessons.",
      content:
        "Learners are more likely to stay engaged when the platform signals structure: guided courses, visible academic records, instructor support, and meaningful completion outcomes.",
      authorName: "Bilge Editorial Team",
      categoryId: blogCategoryLearning.id,
      featured: true,
      status: "PUBLISHED",
      publishedAt: new Date()
    },
    {
      slug: "designing-role-based-workflows-for-students-instructors-and-admins",
      title: "Designing role-based workflows for students, instructors, and admins",
      excerpt:
        "Role clarity improves confidence. The strongest platforms let each audience move through its own focused experience.",
      content:
        "When students, instructors, and administrators all see the same surface, the experience feels crowded and weak. Bilge is stronger when each role enters a clearer journey.",
      authorName: "Bilge Editorial Team",
      categoryId: blogCategoryStrategy.id,
      featured: false,
      status: "PUBLISHED",
      publishedAt: new Date()
    }
  ];

  for (const post of blogPosts) {
    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      update: post,
      create: post
    });
  }

  const instructors = await prisma.user.findMany({
    where: { role: "INSTRUCTOR" },
    select: {
      id: true,
      name: true,
      fullName: true
    }
  });

  for (const [index, instructor] of instructors.entries()) {
    const displayName = instructor.fullName || instructor.name;
    await prisma.instructorProfile.upsert({
      where: { userId: instructor.id },
      update: {
        slug: slugify(displayName),
        headline: "Instructor at Bilge Online Institute",
        shortBio:
          "Supports learners through structured online teaching, guided lessons, and practical programme delivery.",
        longBio:
          "This instructor contributes to the Bilge Online Institute learning environment through course delivery, student engagement, and support across published programmes.",
        expertise: [
          "Online teaching",
          "Programme delivery",
          "Learner support"
        ],
        featured: index < 4,
        visible: true
      },
      create: {
        userId: instructor.id,
        slug: slugify(displayName),
        headline: "Instructor at Bilge Online Institute",
        shortBio:
          "Supports learners through structured online teaching, guided lessons, and practical programme delivery.",
        longBio:
          "This instructor contributes to the Bilge Online Institute learning environment through course delivery, student engagement, and support across published programmes.",
        expertise: [
          "Online teaching",
          "Programme delivery",
          "Learner support"
        ],
        featured: index < 4,
        visible: true
      }
    });
  }

  const featuredCourses = await prisma.course.findMany({
    where: {
      published: true
    },
    orderBy: [
      { publishedAt: "desc" },
      { createdAt: "desc" }
    ],
    take: 6,
    select: { id: true }
  });

  if (featuredCourses.length > 0) {
    await prisma.course.updateMany({
      data: { featuredOnWebsite: false }
    });

    await prisma.course.updateMany({
      where: {
        id: { in: featuredCourses.map((course) => course.id) }
      },
      data: { featuredOnWebsite: true }
    });
  }
};

const main = async () => {
  const rootSuperAdmin = getSuperAdminEnv("ROOT_SUPERADMIN", "ROOT_SUPERADMIN");
  const secondSuperAdmin = getSuperAdminEnv("SECOND_SUPERADMIN", "SECOND_SUPERADMIN");

  const rootHashedPassword = await hashPassword(rootSuperAdmin.password);
  await prisma.user.upsert({
    where: { email: rootSuperAdmin.email },
    update: {
      name: rootSuperAdmin.name,
      password: rootHashedPassword,
      role: "SUPER_ADMIN"
    },
    create: {
      name: rootSuperAdmin.name,
      email: rootSuperAdmin.email,
      password: rootHashedPassword,
      role: "SUPER_ADMIN"
    }
  });

  const secondHashedPassword = await hashPassword(secondSuperAdmin.password);
  await prisma.user.upsert({
    where: { email: secondSuperAdmin.email },
    update: {
      name: secondSuperAdmin.name,
      password: secondHashedPassword,
      role: "SUPER_ADMIN"
    },
    create: {
      name: secondSuperAdmin.name,
      email: secondSuperAdmin.email,
      password: secondHashedPassword,
      role: "SUPER_ADMIN"
    }
  });

  const categoryIdByName = {};

  for (const category of CATEGORY_DEFINITIONS) {
    const saved = await prisma.category.upsert({
      where: { name: category.name },
      update: { name: category.name },
      create: { name: category.name }
    });

    categoryIdByName[saved.name] = saved.id;
  }

  const instructor = await ensureSystemInstructor();
  const seededContent = await loadSeededCourseContent();
  const seededContentBySlug = seededContent.reduce((acc, entry) => {
    acc[entry.slug] = entry;
    return acc;
  }, {});

  for (const pricing of COURSE_PRICING) {
    const categoryName = CATEGORY_BY_PRICING_TITLE[pricing.title];
    if (!categoryName) {
      throw new Error(`Missing category mapping for pricing title: ${pricing.title}`);
    }

    const categoryId = categoryIdByName[categoryName];
    if (!categoryId) {
      throw new Error(`Missing category record for pricing title: ${pricing.title}`);
    }

    const title = COURSE_TITLE_OVERRIDES[pricing.title] ?? `Certificate in ${pricing.title}`;
    const slug = slugify(title);
    const description = buildCourseDescription(pricing.title);
    const contentSeed = seededContentBySlug[slug];
    const status = deriveCourseStatus({
      overviewContent: contentSeed?.overviewContent,
      curriculumCount: contentSeed?.headings?.length || 0
    });

    await upsertCourseSeed({
      title,
      slug,
      description,
      status,
      categoryId,
      instructorId: instructor.id,
      published: true,
      pricingTitle: pricing.title,
      priceUgandanUsd: pricing.priceUgandanUsd,
      priceForeignUsd: pricing.priceForeignUsd,
      currency: pricing.currency
    });
  }

  const existingCourses = await prisma.course.findMany({
    select: {
      id: true,
      title: true,
      pricingTitle: true
    }
  });

  const unmappedCourses = [];
  const updates = [];

  for (const course of existingCourses) {
    const currentPricingTitle = normalizePricingTitle(course.pricingTitle);

    if (currentPricingTitle) {
      if (!PRICING_TITLES.has(currentPricingTitle)) {
        unmappedCourses.push(course.title);
        continue;
      }
      continue;
    }

    const directMatch = normalizePricingTitle(course.title);
    if (PRICING_TITLES.has(directMatch)) {
      updates.push({
        id: course.id,
        pricingTitle: directMatch
      });
      continue;
    }

    const extracted = extractPricingTitleFromCourseTitle(course.title);
    if (extracted && PRICING_TITLES.has(extracted)) {
      updates.push({
        id: course.id,
        pricingTitle: extracted
      });
      continue;
    }

    unmappedCourses.push(course.title);
  }

  if (unmappedCourses.length > 0) {
    throw new Error(
      `Unmapped courses (set pricingTitle manually or extend seed mapping): ${unmappedCourses.join(", ")}`
    );
  }

  for (const update of updates) {
    await prisma.course.update({
      where: { id: update.id },
      data: { pricingTitle: update.pricingTitle }
    });
  }

  for (const pricing of COURSE_PRICING) {
    await prisma.course.updateMany({
      where: { pricingTitle: pricing.title },
      data: {
        priceUgandanUsd: pricing.priceUgandanUsd,
        priceForeignUsd: pricing.priceForeignUsd,
        currency: pricing.currency
      }
    });
  }

  await seedCourseOverviewLessons(seededContent);
  await syncAllCourseStatuses();
  await seedWebsiteContent();
};

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
