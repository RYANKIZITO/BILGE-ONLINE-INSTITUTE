import express from "express";

import { isAuthenticated, requireCompletedProfile } from "./middlewares/auth.middleware.js";
import { allowRoles } from "./middlewares/role.middleware.js";
import { uploadLessonVideo, uploadProfilePhoto } from "./middlewares/upload.middleware.js";
import uploadCertificatePhotoMiddleware from "./middlewares/upload.certificate.photo.middleware.js";

import {
  listCourses,
  enrollInCourse,
  cancelEnrollment,
  showCourse,
  myCourses,
} from "./modules/courses/course.controller.js";

import {
  completeLesson,
  showLesson,
} from "./modules/lessons/lesson.controller.js";

import {
  listAdminUsers,
  reassignInstructorCourses,
  updateAdminUserRole,
  createAdminUser,
  deleteAdminUser,
} from "./modules/admin/admin.users.controller.js";
import {
  getAdminCmsPage,
  createLeadershipProfile,
  updateLeadershipProfile,
  deleteLeadershipProfile,
  updateInstructorCmsProfile,
  createBlogCategoryCms,
  updateBlogCategoryCms,
  deleteBlogCategoryCms,
  createBlogPostCms,
  updateBlogPostCms,
  deleteBlogPostCms,
  updateCareersCms,
  createCareerVacancyCms,
  updateCareerVacancyCms,
  deleteCareerVacancyCms,
} from "./modules/admin/cms.controller.js";
import {
  createAdminCourse,
  deleteAdminCourse,
  editAdminCourse,
  listAdminCourses,
  newAdminCourseForm,
  updateAdminCourse,
} from "./modules/admin/admin.controller.js";

import {
  listCourseAssessments,
  newCourseAssessmentForm,
  createCourseAssessment,
  editCourseAssessmentForm,
  updateCourseAssessment,
  deleteCourseAssessment,
  publishCourseAssessment,
  unpublishCourseAssessment,
  showAssessmentQuestions,
  newAssessmentQuestionForm,
  createAssessmentQuestion,
  deleteAssessmentQuestion,
} from "./modules/assessments/assessment.controller.js";

import {
  listStudentAssessments,
  showStudentAssessment,
  submitStudentAssessment,
} from "./modules/assessments/assessment.student.controller.js";

import { showStudentCourseGradebook } from "./modules/assessments/assessment.gradebook.controller.js";

import {
  listInstructorCourses,
  manageInstructorCourse,
  showInstructorCourseGradebook,
  showInstructorCourseAnalytics,
  createLessonForm,
  createLesson,
  editLessonForm,
  updateLesson,
  moveLesson,
  showAssessmentPlaceholder,
} from "./modules/instructor/instructor.controller.js";

import {
  getDashboardRedirect,
  getSuperAdminDashboard,
  getAdminDashboard,
  getInstructorDashboard,
  publishInstructorCourse,
  unpublishInstructorCourse,
  getStudentDashboard,
  getSuperAdminAuditLogs,
  getSuperAdminSettings,
  reviewEnrollmentCancellationRefund,
  submitLmsDashboardFeedback,
} from "./modules/dashboard/dashboard.controller.js";

import {
  showCertificateEntry,
  uploadCertificatePhoto,
  showCertificate,
  verifyPublicCertificate,
  getStudentTranscriptPage,
  downloadCertificatePdf,
} from "./modules/certificates/certificate.controller.js";

import {
  payForCourse,
  confirmPayment,
  handlePaymentWebhook,
  handlePesapalIpn,
  openSwitchTopUpPayment,
} from "./modules/payments/payment.controller.js";
import {
  createCourseQuestion,
  createDiscussionPost,
  createLiveSession,
  respondToQuestion,
  updateLiveSession,
} from "./modules/engagement/engagement.controller.js";
import {
  showAccountSettings,
  submitAccountSettings
} from "./modules/profile/profile.controller.js";

const router = express.Router();

router.get("/dashboard", isAuthenticated, requireCompletedProfile, getDashboardRedirect);
router.post(
  "/dashboard/feedback",
  isAuthenticated,
  requireCompletedProfile,
  submitLmsDashboardFeedback
);

router.get("/settings", isAuthenticated, requireCompletedProfile, showAccountSettings);
router.post(
  "/settings",
  isAuthenticated,
  requireCompletedProfile,
  uploadProfilePhoto,
  submitAccountSettings
);

router.get(
  "/super-admin/dashboard",
  isAuthenticated, requireCompletedProfile,
  allowRoles("SUPER_ADMIN"),
  getSuperAdminDashboard
);

router.get(
  "/super-admin/audit-logs",
  isAuthenticated, requireCompletedProfile,
  allowRoles("SUPER_ADMIN"),
  getSuperAdminAuditLogs
);

router.get(
  "/super-admin/settings",
  isAuthenticated, requireCompletedProfile,
  allowRoles("SUPER_ADMIN"),
  getSuperAdminSettings
);

router.get(
  "/admin/dashboard",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  getAdminDashboard
);

router.post(
  "/admin/enrollment-cancellations/:id/refund-review",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  reviewEnrollmentCancellationRefund
);

router.get(
  "/admin/cms",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  getAdminCmsPage
);

router.post(
  "/admin/cms/leadership",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  uploadProfilePhoto,
  createLeadershipProfile
);

router.post(
  "/admin/cms/leadership/:id",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  uploadProfilePhoto,
  updateLeadershipProfile
);

router.post(
  "/admin/cms/leadership/:id/delete",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  deleteLeadershipProfile
);

router.post(
  "/admin/cms/instructors/:id",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  updateInstructorCmsProfile
);

router.post(
  "/admin/cms/blog/categories",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  createBlogCategoryCms
);

router.post(
  "/admin/cms/blog/categories/:id",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  updateBlogCategoryCms
);

router.post(
  "/admin/cms/blog/categories/:id/delete",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  deleteBlogCategoryCms
);

router.post(
  "/admin/cms/blog/posts",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  createBlogPostCms
);

router.post(
  "/admin/cms/blog/posts/:id",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  updateBlogPostCms
);

router.post(
  "/admin/cms/blog/posts/:id/delete",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  deleteBlogPostCms
);

router.post(
  "/admin/cms/careers",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  updateCareersCms
);

router.post(
  "/admin/cms/careers/vacancies",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  createCareerVacancyCms
);

router.post(
  "/admin/cms/careers/vacancies/:id",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  updateCareerVacancyCms
);

router.post(
  "/admin/cms/careers/vacancies/:id/delete",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  deleteCareerVacancyCms
);

router.get(
  "/admin/courses",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  listAdminCourses
);

router.get(
  "/admin/courses/new",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  newAdminCourseForm
);

router.post(
  "/admin/courses",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  createAdminCourse
);

router.get(
  "/admin/courses/:id/edit",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  editAdminCourse
);

router.post(
  "/admin/courses/:id",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  updateAdminCourse
);

router.post(
  "/admin/courses/:id/delete",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  deleteAdminCourse
);

router.get(
  "/admin/settings/users",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  listAdminUsers
);

router.post(
  "/admin/settings/users",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  createAdminUser
);

router.post(
  "/admin/settings/users/:id/role",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  updateAdminUserRole
);

router.post(
  "/admin/settings/users/:id/reassign-courses",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  reassignInstructorCourses
);

router.post(
  "/admin/settings/users/:id/delete",
  isAuthenticated, requireCompletedProfile,
  allowRoles("ADMIN", "SUPER_ADMIN"),
  deleteAdminUser
);

router.get(
  "/instructor/dashboard",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  getInstructorDashboard
);

router.post(
  "/instructor/courses/:id/publish",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  publishInstructorCourse
);

router.post(
  "/instructor/courses/:id/unpublish",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  unpublishInstructorCourse
);

router.get(
  "/instructor/courses",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  listInstructorCourses
);

router.get(
  "/instructor/courses/:id/manage",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  manageInstructorCourse
);

router.get(
  "/instructor/courses/:id/gradebook",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  showInstructorCourseGradebook
);

router.get(
  "/instructor/courses/:id/analytics",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  showInstructorCourseAnalytics
);

router.get(
  "/instructor/courses/:id/assessments",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  listCourseAssessments
);

router.get(
  "/instructor/courses/:id/assessments/new",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  newCourseAssessmentForm
);

router.post(
  "/instructor/courses/:id/assessments",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  createCourseAssessment
);

router.get(
  "/instructor/courses/:courseId/assessments/:assessmentId/edit",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  editCourseAssessmentForm
);

router.post(
  "/instructor/courses/:courseId/assessments/:assessmentId",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  updateCourseAssessment
);

router.post(
  "/instructor/courses/:courseId/assessments/:assessmentId/publish",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  publishCourseAssessment
);

router.post(
  "/instructor/courses/:courseId/assessments/:assessmentId/unpublish",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  unpublishCourseAssessment
);

router.post(
  "/instructor/courses/:courseId/assessments/:assessmentId/delete",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  deleteCourseAssessment
);

router.get(
  "/instructor/courses/:courseId/assessments/:assessmentId",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  showAssessmentQuestions
);

router.get(
  "/instructor/courses/:courseId/assessments/:assessmentId/questions/new",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  newAssessmentQuestionForm
);

router.post(
  "/instructor/courses/:courseId/assessments/:assessmentId/questions",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  createAssessmentQuestion
);

router.post(
  "/instructor/courses/:courseId/assessments/:assessmentId/questions/:questionId/delete",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  deleteAssessmentQuestion
);

router.get(
  "/instructor/assessments",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  showAssessmentPlaceholder
);

router.get(
  "/instructor/courses/:id/lessons/new",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  createLessonForm
);

router.post(
  "/instructor/courses/:id/lessons",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  uploadLessonVideo,
  createLesson
);

router.get(
  "/instructor/lessons/:lessonId/edit",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  editLessonForm
);

router.post(
  "/instructor/lessons/:lessonId",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  uploadLessonVideo,
  updateLesson
);

router.post(
  "/instructor/lessons/:lessonId/move",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  moveLesson
);

router.get(
  "/student/dashboard",
  isAuthenticated, requireCompletedProfile,
  allowRoles("STUDENT"),
  getStudentDashboard
);

router.get(
  "/student/transcript/:courseId",
  isAuthenticated, requireCompletedProfile,
  allowRoles("STUDENT"),
  getStudentTranscriptPage
);

router.get(
  "/courses",
  isAuthenticated, requireCompletedProfile,
  allowRoles("STUDENT"),
  listCourses
);

router.get(
  "/my-courses",
  isAuthenticated, requireCompletedProfile,
  allowRoles("STUDENT"),
  myCourses
);

router.post(
  "/courses/:id/enroll",
  isAuthenticated, requireCompletedProfile,
  allowRoles("STUDENT"),
  enrollInCourse
);

router.post(
  "/courses/:id/cancel-enrollment",
  isAuthenticated, requireCompletedProfile,
  allowRoles("STUDENT"),
  cancelEnrollment
);

router.post(
  "/payments/start",
  isAuthenticated, requireCompletedProfile,
  allowRoles("STUDENT"),
  payForCourse
);

router.get(
  "/payments/switch-top-up/:id",
  isAuthenticated, requireCompletedProfile,
  allowRoles("STUDENT"),
  openSwitchTopUpPayment
);

router.post(
  "/instructor/courses/:id/live-sessions",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  createLiveSession
);

router.post(
  "/instructor/live-sessions/:sessionId",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  updateLiveSession
);

router.post(
  "/instructor/questions/:questionId/respond",
  isAuthenticated, requireCompletedProfile,
  allowRoles("INSTRUCTOR"),
  respondToQuestion
);

router.get("/payments/confirm", confirmPayment);

router.post("/payments/webhook/:provider", handlePaymentWebhook);

router.get("/api/payments/pesapal/ipn", handlePesapalIpn);
router.post("/api/payments/pesapal/ipn", handlePesapalIpn);

router.post(
  "/courses/:slug/questions",
  isAuthenticated, requireCompletedProfile,
  allowRoles("STUDENT"),
  createCourseQuestion
);

router.post(
  "/courses/:slug/discussions",
  isAuthenticated, requireCompletedProfile,
  allowRoles("STUDENT", "INSTRUCTOR"),
  createDiscussionPost
);

router.get(
  "/courses/:slug",
  isAuthenticated, requireCompletedProfile,
  allowRoles("STUDENT"),
  showCourse
);

router.get(
  "/courses/:slug/gradebook",
  isAuthenticated, requireCompletedProfile,
  allowRoles("STUDENT"),
  showStudentCourseGradebook
);

router.get(
  "/courses/:slug/assessments",
  isAuthenticated, requireCompletedProfile,
  allowRoles("STUDENT"),
  listStudentAssessments
);

router.get(
  "/courses/:slug/assessments/:assessmentId",
  isAuthenticated, requireCompletedProfile,
  allowRoles("STUDENT"),
  showStudentAssessment
);

router.post(
  "/courses/:slug/assessments/:assessmentId/submit",
  isAuthenticated, requireCompletedProfile,
  allowRoles("STUDENT"),
  submitStudentAssessment
);

router.get(
  "/courses/:slug/lessons/:lessonId",
  isAuthenticated, requireCompletedProfile,
  allowRoles("STUDENT"),
  showLesson
);

router.post(
  "/lessons/:id/complete",
  isAuthenticated, requireCompletedProfile,
  allowRoles("STUDENT"),
  completeLesson
);

router.get(
  "/courses/:slug/certificate",
  isAuthenticated, requireCompletedProfile,
  allowRoles("STUDENT"),
  showCertificateEntry
);

router.post(
  "/courses/:slug/certificate/photo",
  isAuthenticated, requireCompletedProfile,
  allowRoles("STUDENT"),
  uploadCertificatePhotoMiddleware,
  uploadCertificatePhoto
);

router.get("/certificates/:verificationCode", showCertificate);
router.get("/certificates/:verificationCode/pdf", downloadCertificatePdf);
router.get("/verify/:verificationCode", verifyPublicCertificate);

export default router;
