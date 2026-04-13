import { prisma } from "../../config/prisma.js";
import { computeFinalCourseMark } from "../assessments/assessment.grading.service.js";
import { isCloudflareStreamVideoUrl } from "../videos/cloudflare-stream.service.js";
import { notify } from "../../../services/notificationService.js";

const CONTINUOUS_INTERVAL = 7;
const COURSE_PASS_MARK = 50;

const queueNotification = (payload) => {
  notify(payload).catch((error) => {
    console.error("[notifications] Failed to queue lesson notification.", error);
  });
};

const normalizeUploadsPath = (rawUrl) => {
  const value = String(rawUrl || "").trim();
  if (!value) return null;

  const uploadsMatch =
    value.match(/[\\/]+uploads[\\/]+(.+)$/i) || value.match(/^uploads[\\/]+(.+)$/i);

  if (uploadsMatch) {
    return `/uploads/${uploadsMatch[1].replace(/\\/g, "/")}`;
  }

  if (value.startsWith("uploads/")) {
    return `/${value}`;
  }

  return null;
};

const isTrackableVideoUrl = (rawUrl) => {
  const normalizedUploads = normalizeUploadsPath(rawUrl);
  const videoUrl = normalizedUploads || String(rawUrl || "").trim();

  if (!videoUrl) return false;

  const isHttp = /^https?:\/\//i.test(videoUrl);
  const isWebPath = videoUrl.startsWith("/") || isHttp;
  const isDirectVideo = /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(videoUrl);

  return isCloudflareStreamVideoUrl(videoUrl) || (isWebPath && isDirectVideo);
};

const buildContinuousIndexMap = (assessments) => {
  const continuous = assessments
    .filter((assessment) => assessment.type === "CONTINUOUS")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return new Map(continuous.map((assessment, index) => [assessment.id, index]));
};

const getAssessmentThreshold = (assessment, totalLessons, continuousIndexMap) => {
  if (assessment.type === "CONTINUOUS") {
    const index = continuousIndexMap.get(assessment.id) ?? 0;
    return (index + 1) * CONTINUOUS_INTERVAL;
  }

  if (assessment.type === "MID_PROGRAMME") {
    return totalLessons > 0 ? Math.ceil(totalLessons / 2) : Number.MAX_SAFE_INTEGER;
  }

  if (assessment.type === "FINAL_CAPSTONE") {
    return totalLessons > 0 ? totalLessons : Number.MAX_SAFE_INTEGER;
  }

  return Number.MAX_SAFE_INTEGER;
};

const buildGate = (assessment, totalLessons, continuousIndexMap) => {
  const threshold = getAssessmentThreshold(assessment, totalLessons, continuousIndexMap);

  if (assessment.type === "MID_PROGRAMME") {
    return {
      assessmentId: assessment.id,
      title: assessment.title,
      threshold,
      type: assessment.type,
      bannerMessage:
        "Mid-Programme Assessment is now required before you continue to the next lessons.",
    };
  }

  if (assessment.type === "FINAL_CAPSTONE") {
    return {
      assessmentId: assessment.id,
      title: assessment.title,
      threshold,
      type: assessment.type,
      bannerMessage: "Final Capstone Assessment is now required to complete this course.",
    };
  }

  return {
    assessmentId: assessment.id,
    title: assessment.title,
    threshold,
    type: assessment.type,
    bannerMessage: `${assessment.title} is now required before you continue to the next lessons.`,
  };
};

const getActiveAssessmentGate = (
  assessments,
  submissionsByAssessmentId,
  completedLessons,
  totalLessons
) => {
  const continuousIndexMap = buildContinuousIndexMap(assessments);

  const ordered = [...assessments].sort((a, b) => {
    const aThreshold = getAssessmentThreshold(a, totalLessons, continuousIndexMap);
    const bThreshold = getAssessmentThreshold(b, totalLessons, continuousIndexMap);

    if (aThreshold !== bThreshold) {
      return aThreshold - bThreshold;
    }

    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  for (const assessment of ordered) {
    const threshold = getAssessmentThreshold(assessment, totalLessons, continuousIndexMap);

    if (submissionsByAssessmentId[assessment.id]) continue;
    if (completedLessons >= threshold) {
      return buildGate(assessment, totalLessons, continuousIndexMap);
    }
  }

  return null;
};

export const showLesson = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { slug, lessonId } = req.params;
    const { error } = req.query;

    const course = await prisma.course.findUnique({
      where: { slug },
      select: { id: true, title: true, slug: true },
    });

    if (!course) {
      return res.status(404).send("Course not found");
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId: course.id,
        },
      },
    });

    if (!enrollment) {
      return res.redirect("/courses");
    }

    const lesson = await prisma.lesson.findFirst({
      where: {
        id: lessonId,
        courseId: course.id,
        published: true,
      },
    });

    if (!lesson) {
      return res.status(404).send("Lesson not found");
    }

    const progressEntry = await prisma.progress.findUnique({
      where: {
        userId_lessonId: {
          userId,
          lessonId,
        },
      },
    });

    const lessons = await prisma.lesson.findMany({
      where: { courseId: course.id, published: true },
      orderBy: { position: "asc" },
      select: { id: true, title: true, position: true },
    });

    const lessonIds = lessons.map((entry) => entry.id);

    const progress = lessonIds.length
      ? await prisma.progress.findMany({
          where: {
            userId,
            lessonId: { in: lessonIds },
          },
        })
      : [];

    const progressByLesson = Object.fromEntries(
      progress.map((entry) => [entry.lessonId, entry])
    );

    const completedLessons = lessons.filter(
      (entry) => progressByLesson[entry.id]?.completed
    ).length;

    const publishedAssessments = await prisma.assessment.findMany({
      where: {
        courseId: course.id,
        published: true,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        type: true,
        createdAt: true,
      },
    });

    const assessmentSubmissions = publishedAssessments.length
      ? await prisma.assessmentSubmission.findMany({
          where: {
            studentId: userId,
            assessmentId: { in: publishedAssessments.map((a) => a.id) },
          },
          select: {
            assessmentId: true,
          },
        })
      : [];

    const submissionsByAssessmentId = Object.fromEntries(
      assessmentSubmissions.map((submission) => [submission.assessmentId, submission])
    );

    const activeAssessmentGate = getActiveAssessmentGate(
      publishedAssessments,
      submissionsByAssessmentId,
      completedLessons,
      lessons.length
    );

    const currentLessonId = lesson.id;
    const currentIndex = lessons.findIndex((entry) => entry.id === lesson.id);
    const prevLesson = currentIndex > 0 ? lessons[currentIndex - 1] : null;
    const nextLesson =
      currentIndex >= 0 && currentIndex < lessons.length - 1
        ? lessons[currentIndex + 1]
        : null;
    const isCompleted = Boolean(progressEntry?.completed);

    if (
      !enrollment.completed &&
      activeAssessmentGate &&
      currentIndex >= activeAssessmentGate.threshold &&
      !isCompleted
    ) {
      req.session.flash = {
        type: "info",
        message: activeAssessmentGate.bannerMessage,
      };
      return res.redirect(`/courses/${course.slug}?view=1`);
    }

    if (!enrollment.completed) {
      if (currentIndex > 0) {
        const previousLesson = lessons[currentIndex - 1];
        const prevCompleted = !!progressByLesson[previousLesson.id]?.completed;

        if (!prevCompleted) {
          const resumeLesson =
            lessons.find((entry, index) => {
              const prev = index > 0 ? lessons[index - 1] : null;
              const prevDone = prev ? !!progressByLesson[prev.id]?.completed : true;
              const done = !!progressByLesson[entry.id]?.completed;
              return prevDone && !done;
            }) || lessons[0];

          if (resumeLesson?.id) {
            return res.redirect(`/courses/${course.slug}/lessons/${resumeLesson.id}`);
          }
        }
      }
    }

    const flash = req.session.flash || null;
    req.session.flash = null;

    return res.render("lessons/show", {
      course,
      lesson,
      progressEntry,
      lessons,
      progressByLesson,
      enrollmentCompleted: enrollment.completed,
      revisionMode: enrollment.completed,
      error,
      currentLessonId,
      prevLesson,
      nextLesson,
      isCompleted,
      flash,
      activeAssessmentGate,
    });
  } catch (err) {
    return next(err);
  }
};

export const completeLesson = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const lessonId = req.params.id;

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        courseId: true,
        position: true,
        videoDurationSec: true,
        videoUrl: true,
      },
    });

    if (!lesson) {
      return res.status(404).send("Lesson not found");
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId: lesson.courseId,
        },
      },
    });

    if (!enrollment) {
      return res.redirect("/courses");
    }

    const course = await prisma.course.findUnique({
      where: { id: lesson.courseId },
      select: { id: true, slug: true, title: true },
    });

    const timeOnPageMs = Number(req.body?.timeOnPageMs || 0);
    const scrolledToBottom = req.body?.scrolledToBottom === "true";
    const videoMaxTimeSec = Number(req.body?.videoMaxTimeSec || 0);

    if (timeOnPageMs < 30000 || !scrolledToBottom) {
      req.session.flash = {
        type: "error",
        message: "Complete the lesson requirements first.",
      };

      if (course?.slug) {
        return res.redirect(`/courses/${course.slug}/lessons/${lesson.id}?error=1`);
      }

      return res.redirect("/student/dashboard");
    }

    const enforceVideoProgress =
      lesson.videoDurationSec != null && isTrackableVideoUrl(lesson.videoUrl);

    if (enforceVideoProgress && videoMaxTimeSec < lesson.videoDurationSec * 0.9) {
      req.session.flash = {
        type: "error",
        message: "Complete the lesson requirements first.",
      };

      if (course?.slug) {
        return res.redirect(`/courses/${course.slug}/lessons/${lesson.id}?error=1`);
      }

      return res.redirect("/student/dashboard");
    }

    await prisma.progress.upsert({
      where: {
        userId_lessonId: {
          userId,
          lessonId,
        },
      },
      update: {
        completed: true,
      },
      create: {
        userId,
        lessonId,
        completed: true,
      },
    });

    const publishedLessons = await prisma.lesson.findMany({
      where: {
        courseId: lesson.courseId,
        published: true,
      },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });

    const totalLessons = publishedLessons.length;

    const doneLessons = await prisma.progress.count({
      where: {
        userId,
        completed: true,
        lesson: {
          courseId: lesson.courseId,
          published: true,
        },
      },
    });

    const publishedAssessments = await prisma.assessment.findMany({
      where: {
        courseId: lesson.courseId,
        published: true,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        type: true,
        createdAt: true,
      },
    });

    const assessmentSubmissions = publishedAssessments.length
      ? await prisma.assessmentSubmission.findMany({
          where: {
            studentId: userId,
            assessmentId: { in: publishedAssessments.map((a) => a.id) },
          },
          select: {
            assessmentId: true,
          },
        })
      : [];

    const submissionsByAssessmentId = Object.fromEntries(
      assessmentSubmissions.map((submission) => [submission.assessmentId, submission])
    );

    const activeAssessmentGate = getActiveAssessmentGate(
      publishedAssessments,
      submissionsByAssessmentId,
      doneLessons,
      totalLessons
    );

    const gradeSummary = await computeFinalCourseMark(lesson.courseId, userId);
    const passedOverallCourseMark =
      Number(gradeSummary?.finalCourseMark || 0) >= COURSE_PASS_MARK;

    const completed =
      totalLessons > 0 &&
      doneLessons >= totalLessons &&
      passedOverallCourseMark;
    const wasCompleted = Boolean(enrollment.completed);

    await prisma.enrollment.update({
      where: {
        userId_courseId: {
          userId,
          courseId: lesson.courseId,
        },
      },
      data: {
        completed,
      },
    });

    if (completed && !wasCompleted) {
      const student = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          fullName: true,
          email: true,
          phoneNumber: true,
          countryCode: true,
        },
      });

      if (student) {
        queueNotification({
          type: "COURSE_COMPLETED",
          user: student,
          data: {
            courseId: lesson.courseId,
            courseTitle: course?.title || "your programme",
          },
        });
      }
    }

    const nextLesson = await prisma.lesson.findFirst({
      where: {
        courseId: lesson.courseId,
        published: true,
        position: { gt: lesson.position },
      },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });

    req.session.flash = { type: "success", message: "Lesson marked complete." };

    if (course?.slug && completed) {
      req.session.flash = {
        type: "success",
        message: "Course completed successfully. Your certificate eligibility can now be checked.",
      };
      return res.redirect(`/courses/${course.slug}`);
    }

    if (
      course?.slug &&
      activeAssessmentGate &&
      (!nextLesson || nextLesson.position > activeAssessmentGate.threshold)
    ) {
      req.session.flash = {
        type: "info",
        message: activeAssessmentGate.bannerMessage,
      };
      return res.redirect(`/courses/${course.slug}?view=1`);
    }

    if (course?.slug && nextLesson?.id) {
      return res.redirect(`/courses/${course.slug}/lessons/${nextLesson.id}`);
    }

    if (course?.slug) {
      return res.redirect(`/courses/${course.slug}`);
    }

    return res.redirect("/student/dashboard");
  } catch (err) {
    return next(err);
  }
};
