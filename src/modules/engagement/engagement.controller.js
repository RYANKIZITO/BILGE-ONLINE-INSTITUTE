import {
  createCourseQuestionForStudent,
  createDiscussionContribution,
  createLiveSessionForInstructor,
  respondToCourseQuestion,
  updateLiveSessionForInstructor,
} from "../instructor/instructor-engagement.service.js";
import { prisma } from "../../config/prisma.js";
import { notify } from "../../../services/notificationService.js";

const redirectToCourseWorkspace = (slug) => `/courses/${slug}?view=1#engagement`;
const redirectToInstructorManage = (courseId) => `/instructor/courses/${courseId}/manage#engagement`;
const SESSION_TYPE_LABELS = {
  MID_WEEK: "Mid-week live session",
  END_WEEK: "End-week live session",
};
const LIVE_SESSION_STATUS_LABELS = {
  SCHEDULED: "Scheduled",
  HOSTED: "Hosted",
  MISSED: "Missed",
  CANCELLED: "Cancelled",
};

const queueNotification = (payload) => {
  notify(payload).catch((error) => {
    console.error("[notifications] Failed to queue engagement notification.", error);
  });
};

const getCourseStudents = async (courseId) =>
  prisma.enrollment.findMany({
    where: { courseId },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          fullName: true,
          email: true,
          phoneNumber: true,
          countryCode: true,
        },
      },
    },
  });

const notifyCourseStudentsAboutLiveSession = async ({ type, session }) => {
  const course = await prisma.course.findUnique({
    where: { id: session.courseId },
    select: { id: true, title: true },
  });
  const enrollments = await getCourseStudents(session.courseId);

  enrollments.forEach((enrollment) => {
    if (!enrollment.user) {
      return;
    }

    queueNotification({
      type,
      user: enrollment.user,
      data: {
        liveSessionId: session.id,
        courseId: session.courseId,
        courseTitle: course?.title || "your programme",
        sessionType: session.sessionType,
        sessionTypeLabel: SESSION_TYPE_LABELS[session.sessionType] || "Live session",
        scheduledStartTime: session.scheduledStartTime,
        meetingUrl: session.meetingUrl || null,
        status: session.status,
        statusLabel: LIVE_SESSION_STATUS_LABELS[session.status] || session.status,
      },
    });
  });
};

export const createLiveSession = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;
    const courseId = req.params.id;

    const session = await createLiveSessionForInstructor({
      courseId,
      instructorId,
      sessionType: String(req.body.sessionType || "").trim(),
      scheduledStartTime: req.body.scheduledStartTimeUtc || req.body.scheduledStartTime,
      meetingUrl: req.body.meetingUrl,
    });

    await notifyCourseStudentsAboutLiveSession({
      type: "LIVE_SESSION_SCHEDULED",
      session,
    });

    req.session.flash = {
      type: "success",
      message: "Live session scheduled.",
    };

    return res.redirect(redirectToInstructorManage(courseId));
  } catch (err) {
    if (err?.message) {
      req.session.flash = {
        type: "error",
        message: err.message,
      };
      return res.redirect(redirectToInstructorManage(req.params.id));
    }

    return next(err);
  }
};

export const updateLiveSession = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;

    const session = await updateLiveSessionForInstructor({
      sessionId: req.params.sessionId,
      instructorId,
      status: String(req.body.status || "").trim(),
      actualStartTime: req.body.actualStartTime,
      endedAt: req.body.endedAt,
      durationMinutes: req.body.durationMinutes,
    });

    await notifyCourseStudentsAboutLiveSession({
      type: "LIVE_SESSION_UPDATED",
      session,
    });

    req.session.flash = {
      type: "success",
      message: "Live session updated.",
    };

    return res.redirect(redirectToInstructorManage(session.courseId));
  } catch (err) {
    if (err?.message) {
      req.session.flash = {
        type: "error",
        message: err.message,
      };
      return res.redirect("/instructor/dashboard");
    }

    return next(err);
  }
};

export const createCourseQuestion = async (req, res, next) => {
  try {
    const studentId = req.session.user.id;
    const { slug } = req.params;

    await createCourseQuestionForStudent({
      courseSlug: slug,
      studentId,
      title: req.body.title,
      content: req.body.content,
    });

    req.session.flash = {
      type: "success",
      message: "Question submitted to your instructor.",
    };

    return res.redirect(redirectToCourseWorkspace(slug));
  } catch (err) {
    if (err?.message) {
      req.session.flash = {
        type: "error",
        message: err.message,
      };
      return res.redirect(redirectToCourseWorkspace(req.params.slug));
    }

    return next(err);
  }
};

export const respondToQuestion = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;

    const result = await respondToCourseQuestion({
      questionId: req.params.questionId,
      instructorId,
      answerContent: req.body.answerContent,
      resolveNow: req.body.resolveNow === "on",
    });

    req.session.flash = {
      type: "success",
      message: "Question response saved.",
    };

    return res.redirect(redirectToInstructorManage(result.courseId));
  } catch (err) {
    if (err?.message) {
      req.session.flash = {
        type: "error",
        message: err.message,
      };
      return res.redirect("/instructor/dashboard");
    }

    return next(err);
  }
};

export const createDiscussionPost = async (req, res, next) => {
  try {
    const authorId = req.session.user.id;
    const { slug } = req.params;

    const result = await createDiscussionContribution({
      courseSlug: slug,
      authorId,
      parentId: req.body.parentId,
      content: req.body.content,
    });

    req.session.flash = {
      type: "success",
      message:
        result.contribution.type === "COMMENT"
          ? "Discussion reply posted."
          : "Discussion post published.",
    };

    if (req.session.user.role === "INSTRUCTOR") {
      return res.redirect(redirectToInstructorManage(result.courseId));
    }

    return res.redirect(redirectToCourseWorkspace(slug));
  } catch (err) {
    if (err?.message) {
      req.session.flash = {
        type: "error",
        message: err.message,
      };

      if (req.session.user.role === "INSTRUCTOR") {
        return res.redirect("/instructor/dashboard");
      }

      return res.redirect(redirectToCourseWorkspace(req.params.slug));
    }

    return next(err);
  }
};
