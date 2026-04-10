import { prisma } from "../../config/prisma.js";
import { buildPaginationModel } from "./website.validation.js";

const DEFAULT_CONTACT_DETAILS = {
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
      href: "https://www.facebook.com/bilgeonlineinstitute",
    },
    {
      platform: "instagram",
      label: "Instagram",
      href: "https://www.instagram.com/bilgeonlineinstitute",
    },
    {
      platform: "linkedin",
      label: "LinkedIn",
      href: "https://www.linkedin.com/company/bilge-online-institute",
    },
    {
      platform: "youtube",
      label: "YouTube",
      href: "https://www.youtube.com/@bilgeonlineinstitute",
    },
    {
      platform: "x",
      label: "X",
      href: "https://x.com/bilgeonlineinst",
    },
    {
      platform: "tiktok",
      label: "TikTok",
      href: "https://www.tiktok.com/@bilgeonlineinstitute",
    },
  ],
};

const DEFAULT_HOMEPAGE_HERO = {
  eyebrow: "Bilge Online Institute",
  title:
    "Explore programmes, admissions information, and guided online study at Bilge Online Institute.",
  subtitle:
    "Review programme options, understand the admissions process, and move into structured online learning with clear records and certificates.",
};

const CAREERS_PAGE_CONTENT = {
  hero: {
    eyebrow: "Careers at Bilge",
    title: "Join the Bilge Online Institute Instructor Team",
    subtitle:
      "Shape the future of online learning. At Bilge Online Institute, we believe that world-class education starts with world-class instructors.",
  },
  metrics: [
    { value: "Remote", label: "Flexible online teaching from anywhere" },
    { value: "3-5 yrs", label: "Minimum proven industry or academic expertise" },
    { value: "30/4/2026", label: "Application deadline for this intake" },
  ],
  highlights: [
    {
      title: "Technology",
      body: "Web development, data science, AI, cybersecurity, cloud computing, and adjacent digital disciplines.",
    },
    {
      title: "Business & Management",
      body: "Digital marketing, project management, e-commerce, entrepreneurship, and practical business execution.",
    },
    {
      title: "Design & Creative",
      body: "UI/UX, graphic design, motion graphics, video editing, and creative production for modern learners.",
    },
    {
      title: "Languages & Communication",
      body: "English for specific purposes, business communication, and high-impact learner communication skills.",
    },
  ],
  openings: [
    {
      title: "Proven expertise",
      meta: "Minimum 3-5 years",
      body: "You bring strong industry or academic experience in your field and can teach from real-world practice.",
    },
    {
      title: "Teaching ability",
      meta: "Online learning readiness",
      body: "You have experience in teaching, mentoring, curriculum design, or a strong ability to guide learners clearly.",
    },
    {
      title: "Communication skills",
      meta: "Clarity and engagement",
      body: "You can explain complex topics in a way that keeps students engaged, supported, and progressing.",
    },
    {
      title: "Reliable technology",
      meta: "Professional setup",
      body: "You have stable internet, a dependable microphone or camera, and a quiet environment for quality delivery.",
    },
  ],
  principles: [
    "Flexible, remote teaching with the freedom to set your own schedule.",
    "Competitive compensation paid per course, module, or session.",
    "A supportive team with instructional and administrative help behind you.",
    "Professional growth and the opportunity to build your personal instructor brand with Bilge.",
    "Meaningful impact by reaching motivated learners from diverse backgrounds.",
  ],
  process: [
    {
      title: "Send your CV",
      body: "Share your CV highlighting the industry and teaching experience most relevant to the subject areas you want to teach.",
    },
    {
      title: "Add a brief introduction",
      body: "Include a short cover letter or a video of up to two minutes explaining what you want to teach, why you are the right fit, and any prior training or teaching experience.",
    },
    {
      title: "Submit before the deadline",
      body: "Applications for this intake should reach Bilge Online Institute by 30/4/2026 for review.",
    },
  ],
  vacancies: [
    {
      id: "technology-instructor",
      title: "Technology Instructor",
      meta: "Remote | Open",
      body: "Teach web development, data science, AI, cybersecurity, cloud computing, and adjacent digital disciplines.",
      active: true,
      deadlineDate: "2026-04-30",
      sortOrder: 0,
    },
    {
      id: "business-management-instructor",
      title: "Business & Management Instructor",
      meta: "Remote | Open",
      body: "Lead practical learning in digital marketing, project management, e-commerce, entrepreneurship, and business execution.",
      active: true,
      deadlineDate: "2026-04-30",
      sortOrder: 1,
    },
    {
      id: "design-creative-instructor",
      title: "Design & Creative Instructor",
      meta: "Remote | Open",
      body: "Support learners in UI/UX, graphic design, motion graphics, video editing, and creative production workflows.",
      active: true,
      deadlineDate: "2026-04-30",
      sortOrder: 2,
    },
    {
      id: "languages-communication-instructor",
      title: "Languages & Communication Instructor",
      meta: "Remote | Open",
      body: "Teach English for specific purposes, business communication, and communication skills for modern professional environments.",
      active: true,
      deadlineDate: "2026-04-30",
      sortOrder: 3,
    },
    {
      id: "other-subject-specialist-instructor",
      title: "Other Subject Specialist Instructor",
      meta: "Remote | Open",
      body: "Apply as a specialist instructor for adjacent subject areas that align with Bilge Online Institute's practical learning mission.",
      active: true,
      deadlineDate: "2026-04-30",
      sortOrder: 4,
    },
  ],
  roleOptions: [
    "Technology Instructor",
    "Business & Management Instructor",
    "Design & Creative Instructor",
    "Languages & Communication Instructor",
    "Other Subject Specialist Instructor",
  ],
  employmentTypeOptions: [
    "Full-time",
    "Part-time",
    "Contract",
    "Consulting",
    "Adjunct / Visiting",
    "Open to discussion",
  ],
  experienceLevelOptions: [
    "Entry level",
    "Mid level",
    "Senior level",
    "Lead / Head of function",
    "Executive / Advisor",
  ],
};

const PUBLIC_FAQ_CATEGORY_LABELS = {
  Students: "Admissions & Study",
  Institution: "About Bilge",
  General: "Getting Started",
};

const PUBLIC_FAQ_EXCLUDED_CATEGORIES = new Set(["Instructors", "Staff", "Administration"]);

const PUBLIC_FAQ_EXCLUDED_PATTERNS = [/instructor/i, /staff/i, /programme switch/i];

const isPublicLearnerFaq = (faq) => {
  const category = String(faq?.category || "").trim();
  if (PUBLIC_FAQ_EXCLUDED_CATEGORIES.has(category)) {
    return false;
  }

  const haystack = `${faq?.question || ""} ${faq?.answer || ""}`;
  return !PUBLIC_FAQ_EXCLUDED_PATTERNS.some((pattern) => pattern.test(haystack));
};

const mapPublicFaq = (faq) => ({
  ...faq,
  category: PUBLIC_FAQ_CATEGORY_LABELS[String(faq?.category || "").trim()] || String(faq?.category || "").trim() || "Getting Started",
});

const TRUSTEE_BOARD_CHAIN = [
  {
    name: "Mahmoud Elkholy",
    role: "Chairman Board",
    office: "Trustee Board",
    summary:
      "Provides governance stewardship and long-range strategic guidance, backed by senior HR leadership experience spanning transformation, workforce planning, recruitment, audit, and organizational development.",
    label: "Trustee leadership",
    profilePhotoUrl: "/public/website/faculty/mahmoud-elkholy.jpg",
    resumeHighlights: [
      "Senior HR professional with core strengths in HR transformation, HCM system enhancement, workforce analytics, and workforce planning",
      "Advanced study in Strategic HRM at the University of Wollongong, Dubai, alongside an earlier degree in English Language from Al Azhar University, Cairo",
      "Delivered several HR transformation initiatives covering cost optimization, organizational design and development, and policy review",
      "Exceeded recruitment KPIs for time-to-recruit and direct hiring, and achieved top Emiratization outcomes",
      "Led recruitment training for UAE national employees, temporary staff, trainees, and students, while supporting excellence awards, accreditations, and audits",
    ],
  },
  {
    name: "Dr. Abubakar Lujja, PhD",
    role: "Board Member | Family Business Specialist",
    office: "Trustee Board",
    summary:
      "Brings a deep understanding of business dynamics, especially within family-owned enterprises, adding strategic value to Bilge Online Institute's mission of delivering practical, career-focused education. His work bridges traditional business practice and modern strategic management, helping multi-generational businesses strengthen sustainability, governance, and long-term growth.",
    label: "Board member",
    profilePhotoUrl: "/public/website/faculty/abubakar-lujja.jpg",
    resumeHighlights: [
      "PhD in Business Management - Istanbul Universitesi, Turkey",
      "Master of Business Administration (MBA) - Anadolu University, Turkey",
      "Over a decade of management and entrepreneurship experience",
      "Family-business governance, sustainability, and growth strategy",
    ],
  },
  {
    role: "Trustee - Industry Relations",
    office: "Trustee Board",
    summary:
      "Strengthens industry partnerships, employer engagement, and institutional relevance across public programmes.",
    label: "Trustee",
    resumeHighlights: [
      "Industry partnerships",
      "Employer engagement",
      "External collaboration",
    ],
  },
  {
    role: "Trustee - Legal & Compliance",
    office: "Trustee Board",
    summary:
      "Supports legal oversight, policy integrity, governance compliance, and institutional risk awareness.",
    label: "Trustee",
    resumeHighlights: [
      "Legal oversight",
      "Policy and compliance",
      "Governance risk awareness",
    ],
  },
  {
    role: "Trustee - Strategy & Growth",
    office: "Trustee Board",
    summary:
      "Advises on institutional growth, innovation pathways, sustainability, and long-term expansion priorities.",
    label: "Trustee",
    resumeHighlights: [
      "Institutional strategy",
      "Growth planning",
      "Innovation and sustainability",
    ],
  },
];

const ADMINISTRATION_CHAIN = [
  {
    role: "Rector",
    office: "Office of the Rector",
    summary:
      "Provides institutional direction, strategic partnerships, and leadership oversight across Bilge Online Institute.",
    label: "Institute leadership",
    resumeHighlights: [
      "Institutional direction",
      "Strategic partnerships",
      "Leadership oversight",
    ],
  },
  {
    role: "Vice Rector",
    office: "Office of the Vice Rector",
    summary:
      "Supports institutional leadership, academic coordination, and executive oversight across the institute.",
    label: "Deputy leadership",
    resumeHighlights: [
      "Executive coordination",
      "Academic support leadership",
      "Institutional oversight",
    ],
  },
  {
    role: "Academic Registrar",
    office: "Academic Registry",
    summary:
      "Coordinates enrollment records, learner progression, academic documentation, and certificate issuance.",
    label: "Student records",
    resumeHighlights: [
      "Academic records management",
      "Learner progression tracking",
      "Certification documentation",
    ],
  },
  {
    role: "General Secretary",
    office: "Secretariat and Governance",
    summary:
      "Supports governance coordination, institutional communication, and executive administration.",
    label: "Governance support",
    resumeHighlights: [
      "Governance coordination",
      "Executive administration",
      "Institutional communication",
    ],
  },
  {
    role: "Financial Controller",
    office: "Finance and Control Office",
    summary:
      "Oversees financial stewardship, budgeting discipline, reporting, and internal financial controls.",
    label: "Financial stewardship",
    resumeHighlights: [
      "Budget and control discipline",
      "Financial reporting",
      "Stewardship oversight",
    ],
  },
  {
    role: "Head of Marketing",
    office: "Marketing and Communications",
    summary:
      "Leads institute visibility, brand communication, campaign planning, and public engagement channels.",
    label: "Marketing leadership",
    resumeHighlights: [
      "Brand communication",
      "Campaign planning",
      "Public engagement",
    ],
  },
  {
    role: "Head of I.T and Operations",
    office: "Digital Systems and Operations",
    summary:
      "Oversees digital infrastructure, systems reliability, platform operations, and service continuity.",
    label: "Operations oversight",
    resumeHighlights: [
      "Digital infrastructure",
      "Platform operations",
      "Service continuity",
    ],
  },
  {
    role: "Dean - Technology & Emerging Sciences",
    office: "Faculty of Technology & Emerging Sciences",
    summary:
      "Guides academic planning, faculty direction, and learner outcomes across technology and emerging sciences.",
    label: "Dean",
    resumeHighlights: [
      "Faculty academic planning",
      "Technology programme direction",
      "Learner outcome stewardship",
    ],
  },
  {
    role: "Dean - Business, Finance & Management",
    office: "Faculty of Business, Finance & Management",
    summary:
      "Leads academic quality, programme development, and faculty coordination across business and management fields.",
    label: "Dean",
    resumeHighlights: [
      "Business programme quality",
      "Faculty coordination",
      "Curriculum development",
    ],
  },
  {
    role: "Dean - Humanities & Professional Development",
    office: "Faculty of Humanities & Professional Development",
    summary:
      "Oversees programme standards, learner support, and faculty direction in humanities and professional growth.",
    label: "Dean",
    resumeHighlights: [
      "Humanities standards",
      "Professional development pathways",
      "Learner support leadership",
    ],
  },
  {
    role: "Dean - Specialized Sciences & Education",
    office: "Faculty of Specialized Sciences & Education",
    summary:
      "Provides faculty leadership for specialized sciences, education pathways, and academic progression.",
    label: "Dean",
    resumeHighlights: [
      "Specialized sciences leadership",
      "Education pathway oversight",
      "Academic progression support",
    ],
  },
];

const toSiteContentId = (value, fallbackPrefix = "item") =>
  slugify(String(value || "").trim()) || `${fallbackPrefix}-${Date.now()}`;

const normalizeLeadershipEntry = (entry = {}, group, index = 0) => {
  const resolvedName = String(entry?.name || "").trim();
  const resolvedRole = String(entry?.role || "").trim();
  const resolvedOffice = String(entry?.office || "").trim();
  const resolvedSummary = String(entry?.summary || "").trim();
  const resolvedLabel = String(entry?.label || "").trim();
  const resolvedHighlights = Array.isArray(entry?.resumeHighlights)
    ? entry.resumeHighlights
    : [];

  return {
    id:
      String(entry?.id || "").trim() ||
      `${group}-${toSiteContentId(resolvedName || resolvedRole, group)}`,
    sortOrder: Number.isFinite(Number(entry?.sortOrder)) ? Number(entry.sortOrder) : index,
    name: resolvedName || null,
    role: resolvedRole,
    office: resolvedOffice,
    summary: resolvedSummary,
    label: resolvedLabel || (group === "trustee" ? "Trustee" : "Institute leadership"),
    profilePhotoUrl: String(entry?.profilePhotoUrl || "").trim() || null,
    resumeHighlights: resolvedHighlights
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  };
};

const normalizeLeadershipProfiles = (value = {}) => {
  const trusteesSource =
    Array.isArray(value?.trustees) && value.trustees.length ? value.trustees : TRUSTEE_BOARD_CHAIN;
  const administratorsSource =
    Array.isArray(value?.administrators) && value.administrators.length
      ? value.administrators
      : ADMINISTRATION_CHAIN;

  const trustees = trusteesSource
    .map((item, index) => normalizeLeadershipEntry(item, "trustee", index))
    .filter((item) => item.role && item.office && item.summary);
  const administrators = administratorsSource
    .map((item, index) => normalizeLeadershipEntry(item, "administration", index))
    .filter((item) => item.role && item.office && item.summary);

  trustees.sort((a, b) => a.sortOrder - b.sortOrder || a.role.localeCompare(b.role));
  administrators.sort((a, b) => a.sortOrder - b.sortOrder || a.role.localeCompare(b.role));

  return { trustees, administrators };
};

const normalizeCareerVacancy = (vacancy = {}, index = 0) => {
  const title = String(vacancy?.title || "").trim();
  return {
    id:
      String(vacancy?.id || "").trim() ||
      `vacancy-${toSiteContentId(title, "vacancy")}`,
    title,
    meta: String(vacancy?.meta || "").trim(),
    body: String(vacancy?.body || "").trim(),
    active: vacancy?.active !== false,
    deadlineDate: normalizeDateInput(vacancy?.deadlineDate),
    sortOrder: Number.isFinite(Number(vacancy?.sortOrder)) ? Number(vacancy.sortOrder) : index,
  };
};

const normalizeDateInput = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) {
    return null;
  }

  const [, year, month, day] = matched;
  const candidate = new Date(`${year}-${month}-${day}T00:00:00`);
  if (Number.isNaN(candidate.getTime())) {
    return null;
  }

  return `${year}-${month}-${day}`;
};

const getCareerVacancyDeadlineMoment = (deadlineDate) => {
  const normalized = normalizeDateInput(deadlineDate);
  if (!normalized) {
    return null;
  }

  return new Date(`${normalized}T23:59:59.999`);
};

const isCareerVacancyOpen = (vacancy = {}, asOf = new Date()) => {
  if (vacancy?.active === false) {
    return false;
  }

  const deadlineMoment = getCareerVacancyDeadlineMoment(vacancy?.deadlineDate);
  if (!deadlineMoment) {
    return true;
  }

  return asOf.getTime() <= deadlineMoment.getTime();
};

const normalizePairItems = (items = [], fields) =>
  (Array.isArray(items) ? items : [])
    .map((item) => {
      const nextItem = {};
      fields.forEach((field) => {
        nextItem[field] = String(item?.[field] || "").trim();
      });
      return nextItem;
    })
    .filter((item) => fields.every((field) => item[field]));

const normalizeCareersPageContent = (value = {}) => {
  const base = value && typeof value === "object" ? value : {};
  const defaultVacancies = CAREERS_PAGE_CONTENT.vacancies;
  const vacanciesSource =
    Array.isArray(base.vacancies) && base.vacancies.length ? base.vacancies : defaultVacancies;
  const now = new Date();
  const vacancies = vacanciesSource
    .map((vacancy, index) => normalizeCareerVacancy(vacancy, index))
    .filter((vacancy) => vacancy.title && vacancy.body)
    .map((vacancy) => {
      const isOpen = isCareerVacancyOpen(vacancy, now);
      const deadlineMoment = getCareerVacancyDeadlineMoment(vacancy.deadlineDate);
      return {
        ...vacancy,
        isOpen,
        statusLabel: isOpen ? "Open" : vacancy.active === false ? "Closed manually" : "Deadline reached",
        deadlineLabel: vacancy.deadlineDate
          ? new Date(`${vacancy.deadlineDate}T00:00:00`).toLocaleDateString("en-GB")
          : "",
        deadlinePassed: deadlineMoment ? now.getTime() > deadlineMoment.getTime() : false,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  const activeRoleOptions = vacancies
    .filter((vacancy) => vacancy.isOpen)
    .map((vacancy) => vacancy.title);

  return {
    hero: {
      eyebrow: String(base?.hero?.eyebrow || CAREERS_PAGE_CONTENT.hero.eyebrow).trim(),
      title: String(base?.hero?.title || CAREERS_PAGE_CONTENT.hero.title).trim(),
      subtitle: String(base?.hero?.subtitle || CAREERS_PAGE_CONTENT.hero.subtitle).trim(),
    },
    metrics: normalizePairItems(
      base?.metrics?.length ? base.metrics : CAREERS_PAGE_CONTENT.metrics,
      ["value", "label"]
    ),
    highlights: normalizePairItems(
      base?.highlights?.length ? base.highlights : CAREERS_PAGE_CONTENT.highlights,
      ["title", "body"]
    ),
    openings: normalizePairItems(
      base?.openings?.length ? base.openings : CAREERS_PAGE_CONTENT.openings,
      ["title", "meta", "body"]
    ),
    principles: (Array.isArray(base?.principles) && base.principles.length
      ? base.principles
      : CAREERS_PAGE_CONTENT.principles
    )
      .map((item) => String(item || "").trim())
      .filter(Boolean),
    process: normalizePairItems(
      base?.process?.length ? base.process : CAREERS_PAGE_CONTENT.process,
      ["title", "body"]
    ),
    vacancies,
    roleOptions:
      activeRoleOptions.length > 0
        ? activeRoleOptions
        : vacancies.length > 0
          ? []
          : (Array.isArray(base?.roleOptions) && base.roleOptions.length
              ? base.roleOptions
              : CAREERS_PAGE_CONTENT.roleOptions
            )
            .map((item) => String(item || "").trim())
            .filter(Boolean),
    employmentTypeOptions: (
      Array.isArray(base?.employmentTypeOptions) && base.employmentTypeOptions.length
        ? base.employmentTypeOptions
        : CAREERS_PAGE_CONTENT.employmentTypeOptions
    )
      .map((item) => String(item || "").trim())
      .filter(Boolean),
    experienceLevelOptions: (
      Array.isArray(base?.experienceLevelOptions) && base.experienceLevelOptions.length
        ? base.experienceLevelOptions
        : CAREERS_PAGE_CONTENT.experienceLevelOptions
    )
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  };
};

const mapPublicLeadershipProfile = (profile, group) => {
  const slug = `${group}-${slugify(profile.name || profile.role)}`;

  return {
    ...profile,
    slug,
    group,
    profilePhotoUrl:
      profile.profilePhotoUrl || buildProfileAvatarDataUrl(profile.name || profile.role, profile.office),
    modalId: `public-profile-${slug}`,
  };
};

const truncateText = (value, maxLength = 170) => {
  const text = String(value || "").replace(/\s+/g, " ").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}...`;
};

const getInitials = (value, fallback = "B") =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || fallback;

const buildProfileAvatarDataUrl = (name, roleLabel = "Administrator") => {
  const initials = getInitials(name);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="${String(
      name || roleLabel
    ).replace(/"/g, "&quot;")}">
      <defs>
        <linearGradient id="adminGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f3d27a" />
          <stop offset="100%" stop-color="#b88922" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" rx="36" fill="#171310" />
      <circle cx="100" cy="84" r="42" fill="url(#adminGradient)" />
      <path d="M42 170c8-28 31-44 58-44s50 16 58 44" fill="url(#adminGradient)" opacity="0.92" />
      <text x="100" y="191" text-anchor="middle" fill="#f8f1e3" font-family="Georgia, serif" font-size="18" letter-spacing="2">${initials}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const slugify = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const buildSeo = ({
  title,
  description,
  path = "/",
}) => ({
  title,
  description,
  canonicalPath: path,
});

const getSiteSetting = async (key, fallback) => {
  const setting = await prisma.siteSetting.findUnique({
    where: { key },
    select: { value: true },
  });

  return setting?.value || fallback;
};

const normalizeContactDetails = (value = {}) => {
  const phone = String(value?.phone || DEFAULT_CONTACT_DETAILS.phone).trim();
  const phoneSecondary = String(
    value?.phoneSecondary || DEFAULT_CONTACT_DETAILS.phoneSecondary || ""
  ).trim();
  const rawSocialLinks =
    Array.isArray(value?.socialLinks) && value.socialLinks.length
      ? value.socialLinks
      : DEFAULT_CONTACT_DETAILS.socialLinks;
  const socialLinks = rawSocialLinks
    .map((social) => ({
      platform: String(social?.platform || social?.label || "")
        .toLowerCase()
        .trim(),
      label: String(social?.label || "").trim(),
      href: String(social?.href || "").trim(),
    }))
    .filter((social) => social.label && social.href);

  return {
    ...DEFAULT_CONTACT_DETAILS,
    ...(value || {}),
    phone,
    phoneSecondary,
    phoneDisplay: phoneSecondary ? `${phone} / ${phoneSecondary}` : phone,
    socialLinks,
  };
};

const buildProgrammeCoverUrl = (course, variant = "card") =>
  variant === "hero"
    ? `/programme-cover/${encodeURIComponent(String(course?.slug || "programme"))}/hero.svg`
    : `/programme-cover/${encodeURIComponent(String(course?.slug || "programme"))}.svg`;

const getPublishedPageBySlug = (slug) =>
  prisma.page.findFirst({
    where: {
      slug,
      published: true,
    },
  });

const mapCourseCard = (course) => ({
  id: course.id,
  slug: course.slug,
  title: course.title,
  shortDescription: truncateText(
    course.shortDescription || course.description,
    140
  ),
  description: course.description,
  categoryName: course.category?.name || "General",
  pricingTitle: course.pricingTitle || null,
  status: course.status || "COMING_SOON",
  level: course.level || "Professional certificate",
  estimatedDuration: course.estimatedDuration || "Structured online programme",
  instructorName: course.instructor?.fullName || course.instructor?.name || "Bilge Instructor",
  instructorPhotoUrl: course.instructor?.profilePhotoUrl || null,
  coverImageUrl: buildProgrammeCoverUrl(course, "card"),
  heroCoverImageUrl: buildProgrammeCoverUrl(course, "hero"),
  priceUgandanUsd: Number(course.priceUgandanUsd || 0),
  priceForeignUsd: Number(course.priceForeignUsd || 0),
  priceUsd: Number(course.priceUgandanUsd || course.priceForeignUsd || 0),
  currency: course.currency || "USD",
  assessmentCount: course._count?.assessments || 0,
  featuredOnWebsite: Boolean(course.featuredOnWebsite),
});

const matchesCourseTerms = (course, terms = []) => {
  if (!terms.length) {
    return false;
  }

  const haystack = [
    course.title,
    course.shortDescription,
    course.description,
    course.categoryName,
    course.level,
    course.instructorName,
  ]
    .join(" ")
    .toLowerCase();

  return terms.some((term) => haystack.includes(String(term).toLowerCase()));
};

const buildCourseSet = (courses, { count = 3, startIndex = 0, preferredTerms = [] } = {}) => {
  if (!Array.isArray(courses) || !courses.length || count <= 0) {
    return [];
  }

  const selected = [];
  const pushUnique = (course) => {
    if (!course || selected.some((item) => item.id === course.id)) {
      return;
    }
    selected.push(course);
  };

  courses
    .filter((course) => matchesCourseTerms(course, preferredTerms))
    .forEach(pushUnique);

  for (let index = 0; index < courses.length && selected.length < count; index += 1) {
    const candidate = courses[(startIndex + index) % courses.length];
    pushUnique(candidate);
  }

  return selected.slice(0, count);
};

const filterCoursesByCategory = (courses, categoryNames = []) => {
  const normalized = categoryNames.map((name) => String(name).toLowerCase());

  return courses.filter((course) =>
    normalized.includes(String(course.categoryName || "").toLowerCase())
  );
};

const buildDiscoveryCollections = (courses) => [
  {
    title: "Most popular",
    description: "Flagship Bilge programmes that anchor the institute catalogue.",
    href: "/programmes",
    courses: buildCourseSet(courses, { count: 3, startIndex: 0 }),
  },
  {
    title: "Weekly spotlight",
    description: "Curated attention on programmes gaining visibility this week.",
    href: "/programmes",
    courses: buildCourseSet(courses, { count: 3, startIndex: 3 }),
  },
  {
    title: "In-demand digital skills",
    description: "AI, data, software, and practical digital capability pathways.",
    href: "/programmes?category=Tech%20%26%20Digital%20Skills",
    courses: buildCourseSet(
      filterCoursesByCategory(courses, ["Tech & Digital Skills"]),
      {
      count: 3,
      startIndex: 0,
      preferredTerms: ["ai", "data", "python", "software", "digital", "analytics"],
      }
    ),
  },
];

const buildCareerPathways = (courses) => {
  const pathways = [
    {
      title: "Data Analyst",
      description:
        "Build the analytical discipline needed for reporting, dashboards, business insight, and evidence-based decisions.",
      href: "/programmes?search=Data",
      accent: "gold",
      terms: ["data", "analytics", "excel", "reporting"],
    },
    {
      title: "Cyber Security Analyst",
      description:
        "Develop practical readiness for digital safety, security awareness, and entry-level cybersecurity execution.",
      href: "/programmes?search=Security",
      accent: "blue",
      terms: ["security", "cyber", "protection", "risk"],
    },
    {
      title: "Project Leader",
      description:
        "Prepare for structured delivery, planning, coordination, and management in high-accountability environments.",
      href: "/programmes?search=Project",
      accent: "emerald",
      terms: ["project", "management", "business", "operations"],
    },
    {
      title: "Web & Design Builder",
      description:
        "Strengthen your path into modern web presence, digital design, and hands-on technical production.",
      href: "/programmes?search=Website",
      accent: "slate",
      terms: ["website", "design", "graphics", "programming", "web"],
    },
  ];

  return pathways.map((pathway, index) => {
    const imageCourse = buildCourseSet(courses, {
      count: 1,
      startIndex: index,
      preferredTerms: pathway.terms,
    })[0] || courses[index % courses.length] || null;

    return {
      ...pathway,
      imageUrl: imageCourse?.coverImageUrl || imageCourse?.heroCoverImageUrl || null,
      supportingTitle: imageCourse?.title || "Bilge pathway",
    };
  });
};

const buildIntentPaths = () => [
  { label: "Start my career", href: "/programmes", icon: "launch" },
  { label: "Change my career", href: "/admissions", icon: "switch" },
  { label: "Grow in my current role", href: "/programmes?sort=featured", icon: "growth" },
  { label: "Explore topics outside of work", href: "/programmes", icon: "explore" },
];

const buildCategoryShowcases = (categories, courses) =>
  categories
    .filter((category) => category.courseCount > 0)
    .slice(0, 3)
    .map((category, index) => {
    const matchingCourses = courses.filter(
      (course) => String(course.categoryName || "").toLowerCase() === String(category.name || "").toLowerCase()
    );

    return {
      title: `Popular in ${category.name}`,
      href: `/programmes?category=${encodeURIComponent(category.name)}`,
      courses: buildCourseSet(
        matchingCourses.length ? matchingCourses.concat(courses) : courses,
        { count: 3, startIndex: index }
      ),
    };
    });

const buildSpotlightCourses = (courses) =>
  buildCourseSet(filterCoursesByCategory(courses, ["Tech & Digital Skills", "Business & Management"]), {
    count: 4,
    startIndex: 0,
    preferredTerms: ["certificate", "professional", "security", "cloud", "data", "ai"],
  });

const buildNewProgrammeCollection = (courses) =>
  buildCourseSet(courses, {
    count: 4,
    startIndex: 6,
    preferredTerms: ["website", "security", "programming", "cloud", "data", "design", "video"],
  });

export const getWebsiteShellData = async () => {
  const contactDetails = normalizeContactDetails(
    await getSiteSetting("contact_details", DEFAULT_CONTACT_DETAILS)
  );

  return {
    contactDetails,
    navLinks: [
      { href: "/", label: "Home" },
      { href: "/about", label: "About" },
      { href: "/programmes", label: "Programmes" },
      { href: "/faculty", label: "Faculty" },
      { href: "/careers", label: "Careers" },
      { href: "/insights", label: "Insights" },
      { href: "/faqs", label: "FAQs" },
      { href: "/contact", label: "Contact" },
    ],
  };
};

export const getHomepageData = async () => {
  const [
    homepageHero,
    featuredCourses,
    categories,
    featuredFaculty,
    testimonials,
    featuredFaqs,
    latestPosts,
    courseCount,
    instructorCount,
    certificateCount,
  ] = await Promise.all([
    getSiteSetting("homepage_hero", DEFAULT_HOMEPAGE_HERO),
    prisma.course.findMany({
      where: {
        published: true,
        status: "READY",
      },
      include: {
        category: { select: { name: true, id: true } },
        instructor: { select: { name: true, fullName: true, profilePhotoUrl: true } },
        _count: { select: { lessons: true, assessments: true } },
      },
      orderBy: [
        { featuredOnWebsite: "desc" },
        { publishedAt: "desc" },
        { createdAt: "desc" },
      ],
    }),
    prisma.category.findMany({
      include: {
        _count: {
          select: {
            courses: {
              where: {
                published: true,
                status: "READY",
              },
            },
          },
        },
        courses: {
          where: {
            published: true,
            status: "READY",
          },
          select: {
            title: true,
            slug: true,
          },
          take: 3,
          orderBy: { publishedAt: "desc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.instructorProfile.findMany({
      where: { visible: true },
      include: {
        user: {
          select: {
            name: true,
            fullName: true,
            profilePhotoUrl: true,
            courses: {
              where: { published: true, status: "READY" },
              select: { title: true, slug: true },
              take: 3,
              orderBy: { publishedAt: "desc" },
            },
          },
        },
      },
      orderBy: [{ featured: "desc" }, { updatedAt: "desc" }],
      take: 4,
    }),
    prisma.testimonial.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
      take: 3,
    }),
    prisma.fAQ.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      take: 8,
    }),
    prisma.blogPost.findMany({
      where: { status: "PUBLISHED" },
      include: {
        category: { select: { name: true, slug: true } },
      },
      orderBy: [{ featured: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
      take: 3,
    }),
    prisma.course.count({
      where: {
        published: true,
      },
    }),
    prisma.instructorProfile.count({
      where: { visible: true },
    }),
    prisma.certificate.count(),
  ]);

  const mappedFeaturedCourses = featuredCourses.map(mapCourseCard);
  const mappedCategories = categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: slugify(category.name),
    courseCount: category._count.courses,
    sampleTitles: category.courses.map((course) => course.title),
  }));

  return {
    hero: homepageHero,
    featuredCourses: mappedFeaturedCourses.slice(0, 6),
    readyCourseAds: mappedFeaturedCourses.slice(0, 8),
    categories: mappedCategories.filter((category) => category.courseCount > 0),
    featuredFaculty: featuredFaculty.map((profile) => ({
      slug: profile.slug,
      name: profile.user.fullName || profile.user.name,
      headline: profile.headline || "Instructor at Bilge Online Institute",
      shortBio: profile.shortBio || "Supports learners across Bilge programmes.",
      expertise: Array.isArray(profile.expertise) ? profile.expertise : [],
      profilePhotoUrl: profile.user.profilePhotoUrl || null,
      courses: profile.user.courses,
    })),
    testimonials,
    featuredFaqs: featuredFaqs.filter(isPublicLearnerFaq).map(mapPublicFaq).slice(0, 4),
    latestPosts,
    discoveryCollections: buildDiscoveryCollections(mappedFeaturedCourses),
    careerPathways: buildCareerPathways(mappedFeaturedCourses),
    intentPaths: buildIntentPaths(),
    categoryShowcases: buildCategoryShowcases(mappedCategories, mappedFeaturedCourses),
    certificationSpotlight: buildSpotlightCourses(mappedFeaturedCourses),
    newProgrammes: buildNewProgrammeCollection(mappedFeaturedCourses),
    stats: {
      courseCount,
      categoryCount: categories.length,
      instructorCount,
      certificateCount,
    },
  };
};

export const getAboutPageData = async () => {
  const page = await getPublishedPageBySlug("about");

  return {
    page,
    seo: buildSeo({
      title: page?.metaTitle || page?.title || "About Bilge Online Institute",
      description:
        page?.metaDescription ||
        page?.excerpt ||
        "Learn the mission, vision, values, and institutional story behind Bilge Online Institute.",
      path: "/about",
    }),
  };
};

export const getAdmissionsPageData = async () => {
  const page = await getPublishedPageBySlug("admissions");

  return {
    page,
    seo: buildSeo({
      title: page?.metaTitle || page?.title || "Admissions | Bilge Online Institute",
      description:
        page?.metaDescription ||
        page?.excerpt ||
        "Admissions guidance for Bilge Online Institute and how to move into the platform.",
      path: "/admissions",
    }),
  };
};

export const getCoursesListingData = async (params) => {
  const where = {
    published: true,
    ...(params.search
      ? {
          OR: [
            { title: { contains: params.search, mode: "insensitive" } },
            { description: { contains: params.search, mode: "insensitive" } },
            { shortDescription: { contains: params.search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(params.category
      ? {
          category: {
            name: {
              equals: params.category,
              mode: "insensitive",
            },
          },
        }
      : {}),
  };

  const orderBy =
    params.sort === "title"
      ? [{ title: "asc" }]
      : params.sort === "price_low"
        ? [{ priceUgandanUsd: "asc" }, { title: "asc" }]
        : params.sort === "latest"
          ? [{ publishedAt: "desc" }, { createdAt: "desc" }]
          : [{ featuredOnWebsite: "desc" }, { publishedAt: "desc" }, { title: "asc" }];

  const [courses, categories] = await Promise.all([
    prisma.course.findMany({
      where,
      include: {
        category: { select: { name: true } },
        instructor: { select: { name: true, fullName: true, profilePhotoUrl: true } },
        _count: { select: { assessments: true } },
      },
      orderBy,
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const mappedCourses = courses.map(mapCourseCard);
  const promotedReadyCourses = params.readyFirst
    ? mappedCourses.filter((course) => course.status === "READY")
    : [];
  const groupedCourseSource = params.readyFirst
    ? mappedCourses.filter((course) => course.status !== "READY")
    : mappedCourses;

  const groupedCourses = groupedCourseSource.reduce((acc, course) => {
    const categoryName = course.categoryName || "General";
    if (!acc[categoryName]) {
      acc[categoryName] = [];
    }

    acc[categoryName].push(course);
    return acc;
  }, {});

  return {
    filters: params,
    categories,
    courses: mappedCourses,
    groupedCourses,
    promotedReadyCourses,
    readyFirstActive: Boolean(params.readyFirst),
    seo: buildSeo({
      title: "Programmes | Bilge Online Institute",
      description:
        "Explore published programmes at Bilge Online Institute with search, category filtering, and premium programme discovery.",
      path: "/programmes",
    }),
  };
};

export const getCourseDetailData = async (slug) => {
  const course = await prisma.course.findFirst({
    where: {
      slug,
      published: true,
    },
    include: {
      category: { select: { name: true } },
      instructor: { select: { name: true, fullName: true, profilePhotoUrl: true } },
      lessons: {
        where: { published: true },
        orderBy: { position: "asc" },
        select: { id: true, title: true, position: true, content: true },
      },
      assessments: {
        where: { published: true },
        select: { id: true, title: true, type: true },
      },
      _count: {
        select: {
          lessons: true,
          assessments: true,
        },
      },
    },
  });

  if (!course) {
    return null;
  }

  const relatedCourses = await prisma.course.findMany({
    where: {
      published: true,
      id: { not: course.id },
      categoryId: course.categoryId,
    },
    include: {
      category: { select: { name: true } },
      instructor: { select: { name: true, fullName: true, profilePhotoUrl: true } },
      _count: { select: { lessons: true, assessments: true } },
    },
    orderBy: [{ featuredOnWebsite: "desc" }, { publishedAt: "desc" }],
    take: 3,
  });

  const learningOutcomes = course.lessons.slice(0, 4).map((lesson) => lesson.title);
  const requirements = [
    "A readiness to learn in a structured online environment",
    "Reliable internet access for lessons and assessments",
    "Commitment to complete profile and enrollment steps",
  ];

  return {
    course: mapCourseCard(course),
    courseBody: {
      fullDescription: course.description,
      lessons: course.lessons,
      assessments: course.assessments,
      learningOutcomes,
      requirements,
    },
    relatedCourses: relatedCourses.map(mapCourseCard),
    seo: buildSeo({
      title: course.seoTitle || `${course.title} | Bilge Online Institute`,
      description:
        course.seoDescription ||
        course.shortDescription ||
        truncateText(course.description, 155),
      path: `/programmes/${course.slug}`,
    }),
  };
};

export const getCategoriesPageData = async () => {
  const categories = await prisma.category.findMany({
    include: {
      courses: {
        where: {
          published: true,
        },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          shortDescription: true,
          status: true,
          pricingTitle: true,
          priceUgandanUsd: true,
          priceForeignUsd: true,
          currency: true,
          level: true,
          estimatedDuration: true,
          instructor: {
            select: { name: true, fullName: true, profilePhotoUrl: true },
          },
          category: { select: { name: true } },
          _count: { select: { assessments: true } },
        },
        orderBy: [{ status: "asc" }, { title: "asc" }],
      },
      _count: {
        select: {
          courses: {
            where: {
              published: true,
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return {
    categories: categories.map((category) => ({
      name: category.name,
      slug: slugify(category.name),
      courseCount: category._count.courses,
      courses: category.courses.map(mapCourseCard),
    })),
    seo: buildSeo({
      title: "Categories | Bilge Online Institute",
      description:
        "Explore Bilge Online Institute programme categories and discover public courses by field of study.",
      path: "/categories",
    }),
  };
};

export const getCategoryDetailData = async (slug, params) => {
  const categories = await prisma.category.findMany({
    select: { id: true, name: true },
  });

  const category = categories.find((item) => slugify(item.name) === slug);
  if (!category) {
    return null;
  }

  return getCoursesListingData({
    ...params,
    category: category.name,
  }).then((data) => ({
    ...data,
    category,
    seo: buildSeo({
      title: `${category.name} | Bilge Online Institute`,
      description: `Explore published ${category.name} programmes at Bilge Online Institute.`,
      path: `/categories/${slug}`,
    }),
  }));
};

export const getCategoryBySlug = async (slug) => {
  const categories = await prisma.category.findMany({
    select: { id: true, name: true },
  });

  return categories.find((item) => slugify(item.name) === slug) || null;
};

export const getCourseCoverDataBySlug = async (slug) =>
  prisma.course.findFirst({
    where: {
      slug,
      published: true,
    },
    select: {
      title: true,
      slug: true,
      category: {
        select: { name: true },
      },
    },
  });

export const getFacultyPageData = async () => {
  const leadershipContent = await getLeadershipProfilesContent();
  const faculty = await prisma.instructorProfile.findMany({
    where: { visible: true },
    include: {
      user: {
        select: {
          name: true,
          fullName: true,
          profilePhotoUrl: true,
          courses: {
            where: { published: true, status: "READY" },
            select: { title: true, slug: true },
            orderBy: { publishedAt: "desc" },
          },
        },
      },
    },
    orderBy: [{ featured: "desc" }, { updatedAt: "desc" }],
  });

  return {
    trustees: leadershipContent.trustees.map((trustee) =>
      mapPublicLeadershipProfile(trustee, "trustee")
    ),
    administrators: leadershipContent.administrators.map((administrator) =>
      mapPublicLeadershipProfile(administrator, "administration")
    ),
    faculty: faculty.map((profile) => ({
      slug: profile.slug,
      name: profile.user.fullName || profile.user.name,
      headline: profile.headline || "Instructor at Bilge Online Institute",
      shortBio: profile.shortBio || "Supports learners across Bilge programmes.",
      longBio: profile.longBio || profile.shortBio || "",
      expertise: Array.isArray(profile.expertise) ? profile.expertise : [],
      profilePhotoUrl: profile.user.profilePhotoUrl || null,
      courses: profile.user.courses,
      modalId: `public-profile-instructor-${profile.slug}`,
    })),
    seo: buildSeo({
      title: "Faculty | Bilge Online Institute",
      description:
        "Meet Bilge Online Institute instructors and explore the faculty behind the public programmes.",
      path: "/faculty",
    }),
  };
};

export const getLeadershipProfilesContent = async () =>
  normalizeLeadershipProfiles(
    await getSiteSetting("leadership_profiles", {
      trustees: TRUSTEE_BOARD_CHAIN,
      administrators: ADMINISTRATION_CHAIN,
    })
  );

export const getTestimonialsPageData = async () => {
  const testimonials = await prisma.testimonial.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return {
    testimonials,
    seo: buildSeo({
      title: "Testimonials | Bilge Online Institute",
      description:
        "Read Bilge Online Institute testimonials and public trust signals from the learning experience.",
      path: "/testimonials",
    }),
  };
};

export const getBlogListingData = async (params) => {
  const where = {
    status: "PUBLISHED",
    ...(params.search
      ? {
          OR: [
            { title: { contains: params.search, mode: "insensitive" } },
            { excerpt: { contains: params.search, mode: "insensitive" } },
            { content: { contains: params.search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(params.category
      ? {
          category: {
            slug: params.category,
          },
        }
      : {}),
  };

  const [posts, totalItems, categories] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      include: {
        category: { select: { name: true, slug: true } },
      },
      orderBy: [{ featured: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
      skip: params.skip,
      take: params.pageSize,
    }),
    prisma.blogPost.count({ where }),
    prisma.blogCategory.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
  ]);

  return {
    posts,
    categories,
    filters: params,
    pagination: buildPaginationModel({
      page: params.page,
      pageSize: params.pageSize,
      totalItems,
    }),
    seo: buildSeo({
      title: "Insights | Bilge Online Institute",
      description:
        "Read Bilge Online Institute insights, articles, and institute updates.",
      path: "/insights",
    }),
  };
};

export const getBlogPostData = async (slug) => {
  const post = await prisma.blogPost.findFirst({
    where: {
      slug,
      status: "PUBLISHED",
    },
    include: {
      category: { select: { name: true, slug: true } },
    },
  });

  if (!post) {
    return null;
  }

  const relatedPosts = await prisma.blogPost.findMany({
    where: {
      status: "PUBLISHED",
      slug: { not: slug },
      ...(post.categoryId ? { categoryId: post.categoryId } : {}),
    },
    include: {
      category: { select: { name: true, slug: true } },
    },
    orderBy: [{ featured: "desc" }, { publishedAt: "desc" }],
    take: 3,
  });

  return {
    post,
    relatedPosts,
    seo: buildSeo({
      title: post.metaTitle || `${post.title} | Bilge Insights`,
      description: post.metaDescription || post.excerpt,
      path: `/insights/${post.slug}`,
    }),
  };
};

export const getFaqPageData = async () => {
  const faqs = await prisma.fAQ.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const groupedFaqs = faqs.filter(isPublicLearnerFaq).map(mapPublicFaq).reduce((acc, item) => {
    const category = item.category || "Getting Started";
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});

  return {
    groupedFaqs,
    seo: buildSeo({
      title: "FAQs | Bilge Online Institute",
      description:
        "Explore frequently asked questions about Bilge Online Institute, programmes, and the LMS experience.",
      path: "/faqs",
    }),
  };
};

export const getContactPageData = async () => {
  const contactDetails = normalizeContactDetails(
    await getSiteSetting("contact_details", DEFAULT_CONTACT_DETAILS)
  );

  return {
    contactDetails,
    seo: buildSeo({
      title: "Contact | Bilge Online Institute",
      description:
        "Contact Bilge Online Institute for admissions, support, partnerships, and general enquiries.",
      path: "/contact",
    }),
  };
};

export const getCareersContent = async () =>
  normalizeCareersPageContent(
    await getSiteSetting("careers_content", CAREERS_PAGE_CONTENT)
  );

export const getCareersPageData = async () => ({
  page: await getCareersContent(),
  seo: buildSeo({
    title: "Careers | Bilge Online Institute",
    description:
      "Apply to Bilge Online Institute roles and submit your resume, CV, and supporting documents through the public careers page.",
    path: "/careers",
  }),
});

export const createContactMessage = (payload) =>
  prisma.contactMessage.create({
    data: payload,
  });
