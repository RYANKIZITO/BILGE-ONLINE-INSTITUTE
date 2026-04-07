import {
  createContactMessage,
  getAboutPageData,
  getAdmissionsPageData,
  getBlogListingData,
  getBlogPostData,
  getCareersPageData,
  getCategoryBySlug,
  getCategoriesPageData,
  getCategoryDetailData,
  getCourseCoverDataBySlug,
  getContactPageData,
  getCourseDetailData,
  getCoursesListingData,
  getFacultyPageData,
  getFaqPageData,
  getHomepageData,
  getTestimonialsPageData,
  getWebsiteShellData,
} from "./website.service.js";
import { promises as fs } from "fs";
import { parseWebsiteListParams, validateCareerApplication, validateContactMessage } from "./website.validation.js";
import { renderProgrammeCoverSvg } from "./website.cover.js";
import { sendContactNotifications } from "./contact-mail.service.js";
import { sendCareerApplicationNotifications } from "./career-mail.service.js";

const renderWebsitePage = async (req, res, view, pageData = {}) => {
  const shell = await getWebsiteShellData();
  const buildQuery = (query = {}) =>
    new URLSearchParams(
      Object.entries(query).filter(([, value]) => value != null && String(value).trim() !== "")
    ).toString();

  return res.render(`website/${view}`, {
    currentPath: req.path,
    pageTitle: pageData?.seo?.title || "Bilge Online Institute",
    pageSeo: pageData?.seo || null,
    shell,
    buildQuery,
    flash: req.session?.flash || null,
    ...pageData,
  });
};

const clearFlash = (req) => {
  const flash = req.session?.flash || null;
  if (req.session) {
    req.session.flash = null;
  }
  return flash;
};

const buildSubmissionRedirectUrl = (basePath, values = {}) => {
  const params = new URLSearchParams();

  Object.entries(values).forEach(([key, value]) => {
    const normalizedValue = String(value || "").trim();
    if (normalizedValue) {
      params.set(key, normalizedValue);
    }
  });

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
};

const buildSubmissionStatusPage = ({ form, state, statusData }) => {
  const isSuccess = state === "success";
  const name = statusData?.name || "";
  const personalizedName = name ? `, ${name}` : "";

  if (form === "careers") {
    return isSuccess
      ? {
          seo: {
            title: "Application Sent | Bilge Online Institute",
            description: "Your Bilge career application was sent successfully.",
            canonicalPath: "/careers/submitted",
          },
          hero: {
            eyebrow: "Application sent",
            title: `Thank you${personalizedName}. Your application is on its way to Bilge.`,
            description:
              "Your documents and application details were sent successfully to Bilge Online Institute for review.",
          },
          detailTitle: "What happens next",
          detailBody:
            "The Bilge team can now review your application package and contact you for the next step if your profile is a strong fit.",
          highlights: [
            "Your submission was delivered to Bilgeonlineinstitute@gmail.com.",
            "No document copy is kept on the website after delivery.",
            "If shortlisted, the team may contact you using the email or phone number you submitted.",
          ],
          primaryAction: { href: "/", label: "Return home" },
          secondaryAction: { href: "/careers", label: "View careers page" },
        }
      : {
          seo: {
            title: "Application Not Sent | Bilge Online Institute",
            description: "Your Bilge career application could not be sent.",
            canonicalPath: "/careers/failed",
          },
          hero: {
            eyebrow: "Application not sent",
            title: `We could not send your application${personalizedName}.`,
            description:
              "The website could not deliver your career application just now. Please try again and re-upload your documents, or contact Bilge directly.",
          },
          detailTitle: "What to do next",
          detailBody:
            "Because careers uploads are email-only, you will need to attach your documents again when you retry the form.",
          highlights: [
            "Please return to the careers page and submit again.",
            "You will need to upload your resume and supporting documents again.",
            "You can also email Bilgeonlineinstitute@gmail.com directly.",
          ],
          primaryAction: { href: "/careers", label: "Try again" },
          secondaryAction: {
            href: "mailto:Bilgeonlineinstitute@gmail.com",
            label: "Email Bilge directly",
          },
        };
  }

  return isSuccess
    ? {
        seo: {
          title: "Message Sent | Bilge Online Institute",
          description: "Your website enquiry was sent successfully.",
          canonicalPath: "/contact/submitted",
        },
        hero: {
          eyebrow: "Message sent",
          title: `Thank you${personalizedName}. Your message has been sent.`,
          description:
            "Bilge Online Institute has received your website enquiry and the team can now review it.",
        },
        detailTitle: "What happens next",
        detailBody:
          "The Bilge team will review your message and get back to you using the contact details you provided.",
        highlights: [
          "Your website message was delivered successfully.",
          "You may also receive a confirmation email if that channel is enabled.",
          "For urgent follow-up, you can still contact Bilge directly.",
        ],
        primaryAction: { href: "/", label: "Return home" },
        secondaryAction: { href: "/contact", label: "Back to contact page" },
      }
    : {
        seo: {
          title: "Message Not Sent | Bilge Online Institute",
          description: "Your website enquiry could not be sent.",
          canonicalPath: "/contact/failed",
        },
        hero: {
          eyebrow: "Message not sent",
          title: `We could not send your message${personalizedName}.`,
          description:
            "The website could not deliver your enquiry just now. Please try the contact form again or reach Bilge through direct email.",
        },
        detailTitle: "What to do next",
        detailBody:
          "A temporary delivery issue prevented the form from completing successfully.",
        highlights: [
          "Please return to the contact page and try again.",
          "If the issue continues, email Bilgeonlineinstitute@gmail.com directly.",
          "You can also use the phone contacts listed on the website.",
        ],
        primaryAction: { href: "/contact", label: "Try again" },
        secondaryAction: {
          href: "mailto:Bilgeonlineinstitute@gmail.com",
          label: "Email Bilge directly",
        },
      };
};

const getDefaultCareerFormValues = () => ({
  fullName: "",
  email: "",
  phone: "",
  location: "",
  role: "",
  employmentType: "",
  experienceLevel: "",
  linkedinUrl: "",
  portfolioUrl: "",
  availability: "",
  salaryExpectation: "",
  coverLetter: "",
});

const removeUploadedFiles = async (files = []) => {
  await Promise.allSettled(
    files
      .filter((file) => file?.path)
      .map((file) => fs.unlink(file.path))
  );
};

export const showWebsiteHome = async (req, res, next) => {
  try {
    const home = await getHomepageData();
    const flash = clearFlash(req);
    return renderWebsitePage(req, res, "home", {
      seo: {
        title: "Bilge Online Institute | Premium Digital Learning",
        description:
          "Discover premium digital programmes, structured learning, public trust signals, and conversion-ready course discovery at Bilge Online Institute.",
        canonicalPath: "/",
      },
      home,
      flash,
    });
  } catch (err) {
    return next(err);
  }
};

export const showWebsiteAbout = async (req, res, next) => {
  try {
    const page = await getAboutPageData();
    const flash = clearFlash(req);
    return renderWebsitePage(req, res, "about", { ...page, flash });
  } catch (err) {
    return next(err);
  }
};

export const showWebsiteAdmissions = async (req, res, next) => {
  try {
    const page = await getAdmissionsPageData();
    const flash = clearFlash(req);
    return renderWebsitePage(req, res, "admissions", { ...page, flash });
  } catch (err) {
    return next(err);
  }
};

export const showWebsiteCareers = async (req, res, next) => {
  try {
    const data = await getCareersPageData();
    const flash = clearFlash(req);
    return renderWebsitePage(req, res, "careers", {
      ...data,
      flash,
      formValues: getDefaultCareerFormValues(),
      formErrors: [],
    });
  } catch (err) {
    return next(err);
  }
};

export const showWebsiteContactSubmitted = async (req, res, next) => {
  try {
    return renderWebsitePage(req, res, "submission-status", {
      submission: buildSubmissionStatusPage({
        form: "contact",
        state: "success",
        statusData: req.query,
      }),
    });
  } catch (err) {
    return next(err);
  }
};

export const showWebsiteContactFailed = async (req, res, next) => {
  try {
    return renderWebsitePage(req, res, "submission-status", {
      submission: buildSubmissionStatusPage({
        form: "contact",
        state: "failed",
        statusData: req.query,
      }),
    });
  } catch (err) {
    return next(err);
  }
};

export const showWebsiteCareersSubmitted = async (req, res, next) => {
  try {
    return renderWebsitePage(req, res, "submission-status", {
      submission: buildSubmissionStatusPage({
        form: "careers",
        state: "success",
        statusData: req.query,
      }),
    });
  } catch (err) {
    return next(err);
  }
};

export const showWebsiteCareersFailed = async (req, res, next) => {
  try {
    return renderWebsitePage(req, res, "submission-status", {
      submission: buildSubmissionStatusPage({
        form: "careers",
        state: "failed",
        statusData: req.query,
      }),
    });
  } catch (err) {
    return next(err);
  }
};

export const listWebsiteCourses = async (req, res, next) => {
  try {
    const filters = parseWebsiteListParams(req.query);
    const data = await getCoursesListingData(filters);
    const flash = clearFlash(req);
    return renderWebsitePage(req, res, "courses", { ...data, flash });
  } catch (err) {
    return next(err);
  }
};

export const showWebsiteCourse = async (req, res, next) => {
  try {
    const data = await getCourseDetailData(req.params.slug);

    if (!data) {
      return res.status(404).render("website/404", {
        currentPath: req.path,
        pageTitle: "Programme Not Found",
        pageSeo: {
          title: "Programme Not Found | Bilge Online Institute",
          description: "The requested programme could not be found.",
          canonicalPath: req.path,
        },
        shell: await getWebsiteShellData(),
      });
    }

    const flash = clearFlash(req);
    return renderWebsitePage(req, res, "course-detail", { ...data, flash });
  } catch (err) {
    return next(err);
  }
};

export const listWebsiteCategories = async (req, res, next) => {
  try {
    return res.redirect("/programmes");
  } catch (err) {
    return next(err);
  }
};

export const showWebsiteCategory = async (req, res, next) => {
  try {
    const category = await getCategoryBySlug(req.params.slug);

    if (!category) {
      return res.redirect("/programmes");
    }

    return res.redirect(`/programmes?category=${encodeURIComponent(category.name)}`);
  } catch (err) {
    return next(err);
  }
};

export const showWebsiteFaculty = async (req, res, next) => {
  try {
    const data = await getFacultyPageData();
    const flash = clearFlash(req);
    return renderWebsitePage(req, res, "faculty", { ...data, flash });
  } catch (err) {
    return next(err);
  }
};

export const showWebsiteTeam = showWebsiteFaculty;

export const showWebsiteProgrammeCover = (req, res) => {
  const title = String(req.query.title || "Bilge Programme");
  const category = String(req.query.category || "General");
  const variant = String(req.query.variant || "card");

  const svg = renderProgrammeCoverSvg({
    title,
    category,
    variant,
  });

  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.send(svg);
};

export const showWebsiteProgrammeCoverBySlug = async (req, res, next) => {
  try {
    const course = await getCourseCoverDataBySlug(req.params.slug);

    if (!course) {
      const fallbackSvg = renderProgrammeCoverSvg({
        title: "Bilge Programme",
        category: "General",
        variant: req.params.variant === "hero" ? "hero" : "card",
      });
      res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(fallbackSvg);
    }

    const svg = renderProgrammeCoverSvg({
      title: course.title,
      category: course.category?.name || "General",
      variant: req.params.variant === "hero" ? "hero" : "card",
    });

    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(svg);
  } catch (err) {
    return next(err);
  }
};

export const showWebsiteTestimonials = async (req, res, next) => {
  try {
    const data = await getTestimonialsPageData();
    const flash = clearFlash(req);
    return renderWebsitePage(req, res, "testimonials", { ...data, flash });
  } catch (err) {
    return next(err);
  }
};

export const listWebsiteBlogPosts = async (req, res, next) => {
  try {
    const filters = parseWebsiteListParams(req.query, { pageSize: 6 });
    const category = String(req.query.category || "").trim();
    const data = await getBlogListingData({
      ...filters,
      category,
    });
    const flash = clearFlash(req);
    return renderWebsitePage(req, res, "blog", { ...data, flash });
  } catch (err) {
    return next(err);
  }
};

export const showWebsiteBlogPost = async (req, res, next) => {
  try {
    const data = await getBlogPostData(req.params.slug);

    if (!data) {
      return res.status(404).render("website/404", {
        currentPath: req.path,
        pageTitle: "Article Not Found",
        pageSeo: {
          title: "Article Not Found | Bilge Online Institute",
          description: "The requested article could not be found.",
          canonicalPath: req.path,
        },
        shell: await getWebsiteShellData(),
      });
    }

    const flash = clearFlash(req);
    return renderWebsitePage(req, res, "blog-show", { ...data, flash });
  } catch (err) {
    return next(err);
  }
};

export const showWebsiteFaqs = async (req, res, next) => {
  try {
    const data = await getFaqPageData();
    const flash = clearFlash(req);
    return renderWebsitePage(req, res, "faqs", { ...data, flash });
  } catch (err) {
    return next(err);
  }
};

export const showWebsiteContact = async (req, res, next) => {
  try {
    const data = await getContactPageData();
    const flash = clearFlash(req);
    return renderWebsitePage(req, res, "contact", {
      ...data,
      flash,
      formValues: {
        name: "",
        email: "",
        phone: "",
        subject: "",
        interestArea: "",
        message: "",
      },
      formErrors: [],
    });
  } catch (err) {
    return next(err);
  }
};

export const submitWebsiteCareerApplication = async (req, res, next) => {
  const resumeFile = req.files?.resumeFile?.[0] || null;
  const introVideo = req.files?.introVideo?.[0] || null;
  const supportingDocuments = req.files?.supportingDocuments || [];
  const uploadedFiles = [resumeFile, introVideo, ...supportingDocuments].filter(Boolean);

  try {
    const careersPageData = await getCareersPageData();
    const validation = validateCareerApplication(req.body, {
      resumeFile,
      introVideo,
      supportingDocuments,
      allowedRoles: careersPageData.page?.roleOptions || [],
      requireOpenRoles: true,
    });
    const formErrors = [
      ...(req.fileValidationError ? [req.fileValidationError] : []),
      ...validation.errors,
    ];

    if (formErrors.length) {
      await removeUploadedFiles(uploadedFiles);
      return renderWebsitePage(req, res, "careers", {
        ...careersPageData,
        formValues: validation.data,
        formErrors,
      });
    }

    try {
      const shell = await getWebsiteShellData();
      const delivery = await sendCareerApplicationNotifications({
        payload: validation.data,
        resumeFile,
        introVideo,
        supportingDocuments,
        contactDetails: shell.contactDetails,
      });

      if (!delivery?.delivered) {
        await removeUploadedFiles(uploadedFiles);
        return res.redirect(
          buildSubmissionRedirectUrl("/careers/failed", {
            name: validation.data.fullName,
            email: validation.data.email,
          })
        );
      }
    } catch (mailError) {
      console.error("[website-careers-mail] Failed to send career application email:", mailError);
      await removeUploadedFiles(uploadedFiles);
      return res.redirect(
        buildSubmissionRedirectUrl("/careers/failed", {
          name: validation.data.fullName,
          email: validation.data.email,
        })
      );
    }

    await removeUploadedFiles(uploadedFiles);

    return res.redirect(
      buildSubmissionRedirectUrl("/careers/submitted", {
        name: validation.data.fullName,
        email: validation.data.email,
      })
    );
  } catch (err) {
    await removeUploadedFiles(uploadedFiles);
    return next(err);
  }
};

export const submitWebsiteContact = async (req, res, next) => {
  try {
    const validation = validateContactMessage(req.body);

    if (!validation.isValid) {
      const data = await getContactPageData();
      return renderWebsitePage(req, res, "contact", {
        ...data,
        formValues: validation.data,
        formErrors: validation.errors,
      });
    }

    const shell = await getWebsiteShellData();

    try {
      const delivery = await sendContactNotifications({
        payload: validation.data,
        contactDetails: shell.contactDetails,
      });

      if (!delivery?.delivered) {
        return res.redirect(
          buildSubmissionRedirectUrl("/contact/failed", {
            name: validation.data.name,
            email: validation.data.email,
          })
        );
      }
    } catch (mailError) {
      console.error("[website-contact-mail] Failed to send website contact email:", mailError);
      return res.redirect(
        buildSubmissionRedirectUrl("/contact/failed", {
          name: validation.data.name,
          email: validation.data.email,
        })
      );
    }

    try {
      await createContactMessage(validation.data);
    } catch (storageError) {
      console.error("[website-contact-storage] Failed to store website contact message:", storageError);
    }

    return res.redirect(
      buildSubmissionRedirectUrl("/contact/submitted", {
        name: validation.data.name,
        email: validation.data.email,
      })
    );
  } catch (err) {
    return next(err);
  }
};

export const showWebsite404 = async (req, res) => {
  const shell = await getWebsiteShellData();

  return res.status(404).render("website/404", {
    currentPath: req.path,
    pageTitle: "Page Not Found | Bilge Online Institute",
    pageSeo: {
      title: "Page Not Found | Bilge Online Institute",
      description: "The page you were looking for could not be found.",
      canonicalPath: req.path,
    },
    shell,
  });
};
