import { Router } from "express";
import { uploadCareerApplicationFiles } from "../../middlewares/upload.middleware.js";
import {
  listWebsiteBlogPosts,
  listWebsiteCategories,
  listWebsiteCourses,
  showWebsite404,
  showWebsiteAbout,
  showWebsiteAdmissions,
  showWebsiteBlogPost,
  showWebsiteCareers,
  showWebsiteCareersFailed,
  showWebsiteCareersSubmitted,
  showWebsiteCategory,
  showWebsiteContact,
  showWebsiteContactFailed,
  showWebsiteContactSubmitted,
  showWebsiteCourse,
  showWebsiteFaculty,
  showWebsiteFaqs,
  showWebsiteHome,
  showWebsiteProgrammeCover,
  showWebsiteProgrammeCoverBySlug,
  showWebsiteTeam,
  showWebsiteTestimonials,
  submitWebsiteCareerApplication,
  submitWebsiteContact,
} from "./website.controller.js";

const router = Router();

router.get("/programme-cover.svg", showWebsiteProgrammeCover);
router.get("/programme-cover/:slug.svg", showWebsiteProgrammeCoverBySlug);
router.get("/programme-cover/:slug/:variant.svg", showWebsiteProgrammeCoverBySlug);
router.get("/", showWebsiteHome);
router.get("/about", showWebsiteAbout);
router.get("/admissions", showWebsiteAdmissions);
router.get("/careers", showWebsiteCareers);
router.get("/careers/submitted", showWebsiteCareersSubmitted);
router.get("/careers/failed", showWebsiteCareersFailed);
router.post("/careers", uploadCareerApplicationFiles, submitWebsiteCareerApplication);
router.get("/programmes", listWebsiteCourses);
router.get("/programmes/:slug", showWebsiteCourse);
router.get("/categories", listWebsiteCategories);
router.get("/categories/:slug", showWebsiteCategory);
router.get("/faculty", showWebsiteFaculty);
router.get("/team", showWebsiteTeam);
router.get("/testimonials", showWebsiteTestimonials);
router.get("/insights", listWebsiteBlogPosts);
router.get("/insights/:slug", showWebsiteBlogPost);
router.get("/blog", listWebsiteBlogPosts);
router.get("/faqs", showWebsiteFaqs);
router.get("/contact", showWebsiteContact);
router.get("/contact/submitted", showWebsiteContactSubmitted);
router.get("/contact/failed", showWebsiteContactFailed);
router.post("/contact", submitWebsiteContact);

export { showWebsite404 };
export default router;
