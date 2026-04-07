import { prisma } from "../../config/prisma.js";
import { syncCourseStatusFromContent } from "./course.status.js";
import { getStudentCourseEngagementData } from "../instructor/instructor-engagement.service.js";
import { buildSwitchFinancialSummary } from "./course.pricing.js";
import { listPendingSwitchTopUpsForUser } from "../payments/switch-top-up.service.js";

const CONTINUOUS_INTERVAL = 7;
const ADAPTIVE_LOW_SCORE_PERCENT = 60;
const ADAPTIVE_STRONG_SCORE_PERCENT = 80;
const SAMPLE_STUDENT_EMAIL = (
  process.env.SAMPLE_STUDENT_EMAIL || "salaam@test.com"
).toLowerCase();
const SAMPLE_STUDENT_ID = process.env.SAMPLE_STUDENT_ID || "";
const ENROLLMENT_CANCELLATION_REASON_LABELS = {
  SCHEDULE_CONFLICT: "My schedule no longer fits this course",
  FINANCIAL_CONSTRAINTS: "I have financial constraints",
  COURSE_NOT_RIGHT: "The course is not the right fit for me",
  NO_LONGER_INTERESTED: "I am no longer interested in this course",
  TECHNICAL_DIFFICULTIES: "I am facing technical difficulties",
  DUPLICATE_ENROLLMENT: "I enrolled by mistake or duplicated enrollment",
  WANTS_TO_SWITCH_PROGRAM: "I would like to switch to another course",
  OTHER: "Other",
};
const REFUND_RECOMMENDED_REASONS = new Set([
  "DUPLICATE_ENROLLMENT",
  "TECHNICAL_DIFFICULTIES",
  "WANTS_TO_SWITCH_PROGRAM",
  "OTHER",
]);
const ENROLLMENT_CANCELLATION_REASON_OPTIONS = Object.entries(
  ENROLLMENT_CANCELLATION_REASON_LABELS
).map(([value, label]) => ({
  value,
  label,
}));
const ENROLLMENT_CANCELLATION_REASON_VALUES = new Set(
  ENROLLMENT_CANCELLATION_REASON_OPTIONS.map((option) => option.value)
);

const isSampleStudent = (user) => {
  if (!user) return false;
  if (SAMPLE_STUDENT_ID && user.id === SAMPLE_STUDENT_ID) return true;
  if (SAMPLE_STUDENT_EMAIL && user.email?.toLowerCase() === SAMPLE_STUDENT_EMAIL) {
    return true;
  }
  return false;
};

const getCancellationReasonOption = (value) =>
  String(value || "").trim().toUpperCase();

const getSwitchableCourseOptions = async (userId) => {
  const existingEnrollments = await prisma.enrollment.findMany({
    where: { userId },
    select: { courseId: true },
  });

  const excludedCourseIds = existingEnrollments.map((enrollment) => enrollment.courseId);

  return prisma.course.findMany({
    where: {
      published: true,
      status: "READY",
      ...(excludedCourseIds.length > 0 ? { id: { notIn: excludedCourseIds } } : {}),
    },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
    },
  });
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

const buildContinuousIndexMap = (assessments) => {
  const continuous = assessments
    .filter((assessment) => assessment.type === "CONTINUOUS")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return new Map(continuous.map((assessment, index) => [assessment.id, index]));
};

const buildGate = (assessment, totalLessons, continuousIndexMap) => {
  const threshold = getAssessmentThreshold(assessment, totalLessons, continuousIndexMap);

  if (assessment.type === "MID_PROGRAMME") {
    return {
      assessmentId: assessment.id,
      title: assessment.title,
      threshold,
      bannerMessage:
        "Mid-Programme Assessment is now required before you continue to the next lessons.",
      lessonLockReason: "Locked until Mid-Programme Assessment is submitted.",
    };
  }

  if (assessment.type === "FINAL_CAPSTONE") {
    return {
      assessmentId: assessment.id,
      title: assessment.title,
      threshold,
      bannerMessage: "Final Capstone Assessment is now required to complete this course.",
      lessonLockReason: "Locked until Final Capstone Assessment is submitted.",
    };
  }

  return {
    assessmentId: assessment.id,
    title: assessment.title,
    threshold,
    bannerMessage: `${assessment.title} is now required before you continue to the next lessons.`,
    lessonLockReason: `Locked until ${assessment.title} is submitted.`,
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

const getLessonsForAssessmentRevision = (
  assessment,
  lessons,
  totalLessons,
  continuousIndexMap
) => {
  const threshold = getAssessmentThreshold(assessment, totalLessons, continuousIndexMap);

  let startPosition = 1;
  let endPosition = threshold;

  if (assessment.type === "CONTINUOUS") {
    startPosition = Math.max(1, threshold - CONTINUOUS_INTERVAL + 1);
  } else if (assessment.type === "MID_PROGRAMME") {
    startPosition = 1;
  } else if (assessment.type === "FINAL_CAPSTONE") {
    startPosition = Math.max(1, threshold - CONTINUOUS_INTERVAL);
  }

  return lessons
    .filter(
      (lesson) => lesson.position >= startPosition && lesson.position <= endPosition
    )
    .slice(-3)
    .map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      position: lesson.position,
    }));
};

const buildAdaptiveLearningSummary = ({
  course,
  publishedAssessments,
  assessmentSubmissions,
  submissionsByAssessmentId,
  completedLessons,
  totalLessons,
  activeAssessmentGate,
}) => {
  if (!publishedAssessments.length) {
    return null;
  }

  const continuousIndexMap = buildContinuousIndexMap(publishedAssessments);

  const gradedAssessments = publishedAssessments
    .map((assessment) => {
      const submission = submissionsByAssessmentId[assessment.id];
      if (!submission || submission.score == null) return null;

      const scorePercent =
        assessment.maxScore > 0
          ? Math.round((submission.score / assessment.maxScore) * 100)
          : 0;

      return {
        id: assessment.id,
        title: assessment.title,
        type: assessment.type,
        maxScore: assessment.maxScore,
        score: submission.score,
        scorePercent,
        threshold: getAssessmentThreshold(
          assessment,
          totalLessons,
          continuousIndexMap
        ),
        submittedAt: submission.submittedAt,
      };
    })
    .filter(Boolean);

  if (!gradedAssessments.length) {
    return null;
  }

  const weakAssessments = gradedAssessments.filter(
    (assessment) => assessment.scorePercent < ADAPTIVE_LOW_SCORE_PERCENT
  );

  const strongAssessments = gradedAssessments.filter(
    (assessment) => assessment.scorePercent >= ADAPTIVE_STRONG_SCORE_PERCENT
  );

  const recommendedLessons = weakAssessments.flatMap((assessment) =>
    getLessonsForAssessmentRevision(
      assessment,
      course.lessons,
      totalLessons,
      continuousIndexMap
    ).map((lesson) => ({
      ...lesson,
      assessmentTitle: assessment.title,
      assessmentType: assessment.type,
      scorePercent: assessment.scorePercent,
    }))
  );

  const uniqueRecommendedLessons = Array.from(
    new Map(
      recommendedLessons.map((lesson) => [
        lesson.id,
        {
          id: lesson.id,
          title: lesson.title,
          position: lesson.position,
        },
      ])
    ).values()
  );

  if (weakAssessments.length > 0) {
    return {
      status: "warning",
      title: "Adaptive Learning Recommendation",
      message:
        activeAssessmentGate
          ? `You may need to review some lessons before retrying or continuing after ${activeAssessmentGate.title}.`
          : "You have some weak assessment areas. Review the suggested lessons to strengthen your understanding.",
      weakAssessments: weakAssessments.map((assessment) => ({
        id: assessment.id,
        title: assessment.title,
        type: assessment.type,
        score: assessment.score,
        maxScore: assessment.maxScore,
        scorePercent: assessment.scorePercent,
      })),
      recommendedLessons: uniqueRecommendedLessons,
      strongAssessments: [],
      completedLessons,
      totalLessons,
    };
  }

  if (
    strongAssessments.length > 0 &&
    gradedAssessments.length === assessmentSubmissions.length
  ) {
    return {
      status: "success",
      title: "Adaptive Learning Progress",
      message:
        "Great work. Your submitted assessment performance is strong. Keep progressing through the course.",
      weakAssessments: [],
      recommendedLessons: [],
      strongAssessments: strongAssessments.map((assessment) => ({
        id: assessment.id,
        title: assessment.title,
        type: assessment.type,
        score: assessment.score,
        maxScore: assessment.maxScore,
        scorePercent: assessment.scorePercent,
      })),
      completedLessons,
      totalLessons,
    };
  }

  return {
    status: "info",
    title: "Adaptive Learning Update",
    message:
      "Your progress is being tracked. Keep completing lessons and assessments to unlock more personalized recommendations.",
    weakAssessments: [],
    recommendedLessons: [],
    strongAssessments: strongAssessments.map((assessment) => ({
      id: assessment.id,
      title: assessment.title,
      type: assessment.type,
      score: assessment.score,
      maxScore: assessment.maxScore,
      scorePercent: assessment.scorePercent,
    })),
    completedLessons,
    totalLessons,
  };
};

export const listCourses = async (req, res, next) => {
  try {
    const courses = await prisma.course.findMany({
      where: {
        published: true,
      },
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ category: { name: "asc" } }, { title: "asc" }],
    });

    await Promise.all(
      courses.map(async (course) => {
        const status = await syncCourseStatusFromContent(course.id);
        if (status) {
          course.status = status;
        }
      })
    );

    const userId = req.session.user?.id;
    let enrolledCourseIds = [];
    let pendingSwitchTopUpByCourseId = {};

    if (userId) {
      const courseIds = courses.map((course) => course.id);

      const [enrollments, pendingSwitchTopUps] = await Promise.all([
        prisma.enrollment.findMany({
          where: {
            userId,
            courseId: { in: courseIds },
          },
          select: { courseId: true },
        }),
        listPendingSwitchTopUpsForUser(userId),
      ]);

      enrolledCourseIds = enrollments.map((enrollment) => enrollment.courseId);
      pendingSwitchTopUpByCourseId = pendingSwitchTopUps.reduce(
        (acc, request) => {
          if (!request.requestedTargetCourseId) {
            return acc;
          }

          acc[request.requestedTargetCourseId] = request;
          return acc;
        },
        {}
      );
    }

    const groupedCourses = courses.reduce((acc, course) => {
      const categoryName = course.category?.name;

      if (!categoryName) {
        throw new Error(`Course ${course.id} missing category`);
      }

      if (!acc[categoryName]) acc[categoryName] = [];
      acc[categoryName].push(course);
      return acc;
    }, {});

    const flash = req.session.flash || null;
    req.session.flash = null;
    const sampleStudent = isSampleStudent(req.session.user);

    return res.render("courses/index", {
      groupedCourses,
      flash,
      enrolledCourseIds,
      pendingSwitchTopUpByCourseId,
      isSampleStudent: sampleStudent,
    });
  } catch (err) {
    return next(err);
  }
};

export const enrollInCourse = async (req, res, next) => {
  try {
    const userId = req.session.user?.id;
    const courseId = req.params.id;

    if (!userId) {
      return res.redirect("/login");
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, slug: true, status: true, published: true },
    });

    if (!course || !course.published) {
      req.session.flash = { type: "error", message: "Course not available" };
      return res.redirect("/courses");
    }

    const syncedStatus = await syncCourseStatusFromContent(course.id);
    const effectiveStatus = syncedStatus || course.status;

    if (effectiveStatus !== "READY") {
      req.session.flash = {
        type: "info",
        message: "Enrollment opens when course is READY",
      };
      return res.redirect("/courses");
    }

    if (!isSampleStudent(req.session.user)) {
      req.session.flash = {
        type: "info",
        message: "Payment is required to enroll in this course.",
      };
      return res.redirect("/courses");
    }

    try {
      await prisma.enrollment.create({
        data: {
          userId,
          courseId,
        },
      });

      req.session.flash = { type: "success", message: "Enrolled successfully" };
      return res.redirect("/my-courses");
    } catch (err) {
      if (err?.code === "P2002") {
        req.session.flash = { type: "info", message: "Already enrolled" };
        return res.redirect("/my-courses");
      }

      throw err;
    }
  } catch (err) {
    return next(err);
  }
};

export const cancelEnrollment = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const courseId = req.params.id;
    const rawReasonOption = getCancellationReasonOption(req.body.reasonOption);
    const reasonText = String(req.body.reasonText || "").trim();
    const requestedTargetCourseId = String(req.body.requestedTargetCourseId || "").trim();
    const reasonOption = requestedTargetCourseId
      ? "WANTS_TO_SWITCH_PROGRAM"
      : rawReasonOption;

    if (!requestedTargetCourseId && !ENROLLMENT_CANCELLATION_REASON_VALUES.has(reasonOption)) {
      req.session.flash = {
        type: "error",
        message: "Choose a cancellation reason before submitting.",
      };
      return res.redirect("/my-courses");
    }

    if (reasonOption === "OTHER" && !reasonText) {
      req.session.flash = {
        type: "error",
        message: "Add a short reason when you choose Other.",
      };
      return res.redirect("/my-courses");
    }

    if (reasonOption === "WANTS_TO_SWITCH_PROGRAM" && !requestedTargetCourseId) {
      req.session.flash = {
        type: "error",
        message: "Choose the course you want to switch into.",
      };
      return res.redirect("/my-courses");
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            priceUgandanUsd: true,
            priceForeignUsd: true,
            currency: true,
          },
        },
      },
    });

    if (!enrollment) {
      req.session.flash = {
        type: "error",
        message: "Enrollment not found.",
      };
      return res.redirect("/my-courses");
    }

    if (enrollment.completed) {
      req.session.flash = {
        type: "error",
        message: "Completed courses cannot be cancelled.",
      };
      return res.redirect("/my-courses");
    }

    const [progressCount, assessmentSubmissionCount] = await Promise.all([
      prisma.progress.count({
        where: {
          userId,
          lesson: {
            courseId,
          },
        },
      }),
      prisma.assessmentSubmission.count({
        where: {
          studentId: userId,
          assessment: {
            courseId,
          },
        },
      }),
    ]);

    if (progressCount > 0 || assessmentSubmissionCount > 0) {
      req.session.flash = {
        type: "error",
        message: "You can only cancel enrollment before starting any lesson.",
      };
      return res.redirect("/my-courses");
    }

    const [student, refundablePayment, targetCourse] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          countryCode: true,
        },
      }),
      prisma.payment.findFirst({
        where: {
          userId,
          courseId,
          status: "SUCCESS",
        },
        orderBy: [{ verifiedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          amount: true,
          currency: true,
        },
      }),
      reasonOption === "WANTS_TO_SWITCH_PROGRAM" && requestedTargetCourseId
        ? prisma.course.findFirst({
            where: {
              id: requestedTargetCourseId,
              published: true,
              status: "READY",
            },
            select: {
              id: true,
              title: true,
              priceUgandanUsd: true,
              priceForeignUsd: true,
              currency: true,
            },
          })
        : Promise.resolve(null),
    ]);

    const refundRecommended =
      Boolean(refundablePayment) && REFUND_RECOMMENDED_REASONS.has(reasonOption);

    if (reasonOption === "WANTS_TO_SWITCH_PROGRAM" && !targetCourse) {
      req.session.flash = {
        type: "error",
        message: "Selected switch course is not available for enrollment.",
      };
      return res.redirect("/my-courses");
    }

    const switchFinancialSummary =
      targetCourse && student
        ? buildSwitchFinancialSummary({
            user: student,
            sourceCourse: enrollment.course,
            targetCourse,
            payment: refundablePayment,
          })
        : buildSwitchFinancialSummary();

    const refundReviewStatus =
      refundablePayment || reasonOption === "WANTS_TO_SWITCH_PROGRAM"
        ? "PENDING_REVIEW"
        : "NOT_APPLICABLE";

    await prisma.$transaction(async (tx) => {
      await tx.enrollmentCancellation.create({
        data: {
          previousEnrollmentId: enrollment.id,
          userId,
          courseId,
          paymentId: refundablePayment?.id || null,
          requestedTargetCourseId: targetCourse?.id || null,
          reasonOption,
          reasonText: reasonText || null,
          refundReviewStatus,
          refundRecommended,
          refundAmount: refundablePayment?.amount ?? null,
          refundCurrency: refundablePayment?.currency ?? null,
          switchFinancialDirection: switchFinancialSummary.direction,
          switchPricingTier: switchFinancialSummary.pricingTier,
          sourceCourseFee: switchFinancialSummary.sourceCourseFee,
          targetCourseFee: switchFinancialSummary.targetCourseFee,
          switchTransferAmount: switchFinancialSummary.transferAmount,
          switchBalanceAmount: switchFinancialSummary.balanceAmount,
          switchPricingCurrency: switchFinancialSummary.currency,
        },
      });

      await tx.enrollment.delete({
        where: {
          id: enrollment.id,
        },
      });
    });

    req.session.flash = {
      type: "success",
      message: targetCourse
        ? `Enrollment cancelled for ${enrollment.course?.title || "the course"}. Your switch request to ${targetCourse.title} is awaiting admin action${switchFinancialSummary.direction === "TOP_UP_REQUIRED" && switchFinancialSummary.balanceAmount ? ` and may require an additional ${switchFinancialSummary.balanceAmount} ${switchFinancialSummary.currency}.` : switchFinancialSummary.direction === "CREDIT_DUE" && switchFinancialSummary.balanceAmount ? ` and may leave a credit of ${switchFinancialSummary.balanceAmount} ${switchFinancialSummary.currency}.` : "."}`
        : refundablePayment
          ? `Enrollment cancelled for ${enrollment.course?.title || "the course"}. The review request is now awaiting admin action.`
          : `Enrollment cancelled for ${enrollment.course?.title || "the course"}.`,
    };
    return res.redirect("/my-courses");
  } catch (err) {
    return next(err);
  }
};

export const myCourses = async (req, res, next) => {
  try {
    const userId = req.session.user.id;

    const [enrollments, pendingSwitchTopUps] = await Promise.all([
      prisma.enrollment.findMany({
        where: { userId },
        include: { course: true },
        orderBy: { createdAt: "desc" },
      }),
      listPendingSwitchTopUpsForUser(userId),
    ]);

    const courseIds = enrollments
      .map((enrollment) => enrollment.course?.id)
      .filter(Boolean);
    const statusUpdates = await Promise.all(
      courseIds.map((courseId) => syncCourseStatusFromContent(courseId))
    );
    const statusByCourseId = new Map(
      courseIds.map((courseId, index) => [courseId, statusUpdates[index]])
    );

    const visibleEnrollments = enrollments
      .filter((enrollment) => enrollment.course && enrollment.course.published === true)
      .map((enrollment) => ({
        ...enrollment,
        course: enrollment.course
          ? {
              ...enrollment.course,
              status:
                statusByCourseId.get(enrollment.course.id) ||
                enrollment.course.status,
            }
          : enrollment.course,
      }));

    const enrichedEnrollments = await Promise.all(
      visibleEnrollments.map(async (enrollment) => {
        const [progressCount, assessmentSubmissionCount] = await Promise.all([
          prisma.progress.count({
            where: {
              userId,
              lesson: {
                courseId: enrollment.courseId,
              },
            },
          }),
          prisma.assessmentSubmission.count({
            where: {
              studentId: userId,
              assessment: {
                courseId: enrollment.courseId,
              },
            },
          }),
        ]);

        return {
          ...enrollment,
          canCancelEnrollment:
            !enrollment.completed && progressCount === 0 && assessmentSubmissionCount === 0,
        };
      })
    );

    const flash = req.session.flash;
    req.session.flash = null;
    const switchableCourseOptions = await getSwitchableCourseOptions(userId);

    return res.render("courses/my-courses", {
      enrollments: enrichedEnrollments,
      pendingSwitchTopUps,
      enrollmentCancellationReasonOptions: ENROLLMENT_CANCELLATION_REASON_OPTIONS,
      switchableCourseOptions,
      flash,
    });
  } catch (err) {
    return next(err);
  }
};

export { ENROLLMENT_CANCELLATION_REASON_OPTIONS, ENROLLMENT_CANCELLATION_REASON_LABELS };

export const showCourse = async (req, res, next) => {
  try {
    const userId = req.session.user?.id;
    const { slug } = req.params;
    const { view } = req.query;

    const course = await prisma.course.findUnique({
      where: { slug },
      include: {
        lessons: {
          where: { published: true },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!course) {
      return res.status(404).send("Course not found");
    }

    const enrollment = userId
      ? await prisma.enrollment.findUnique({
          where: {
            userId_courseId: {
              userId,
              courseId: course.id,
            },
          },
        })
      : null;

    if (!enrollment) {
      return res.redirect("/courses");
    }

    const revisionMode = Boolean(enrollment.completed);

    const lessonIds = course.lessons.map((lesson) => lesson.id);

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

    const totalLessons = course.lessons.length;
    const completedLessons = course.lessons.filter(
      (lesson) => progressByLesson[lesson.id]?.completed
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
        maxScore: true,
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
            score: true,
            submittedAt: true,
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
      totalLessons
    );

    const adaptiveLearningSummary = buildAdaptiveLearningSummary({
      course,
      publishedAssessments,
      assessmentSubmissions,
      submissionsByAssessmentId,
      completedLessons,
      totalLessons,
      activeAssessmentGate,
    });
    const engagementData = await getStudentCourseEngagementData(course.id, userId);

    if (!enrollment.completed && view !== "1" && !activeAssessmentGate) {
      const firstIncomplete = course.lessons.find(
        (lesson) => !progressByLesson[lesson.id]?.completed
      );

      if (firstIncomplete) {
        return res.redirect(`/courses/${course.slug}/lessons/${firstIncomplete.id}`);
      }
    }

    const flash = req.session.flash || null;
    req.session.flash = null;

    return res.render("courses/show", {
      course,
      enrollment,
      progressByLesson,
      isEnrolled: Boolean(enrollment),
      flash,
      publishedAssessments,
      submissionsByAssessmentId,
      activeAssessmentGate,
      adaptiveLearningSummary,
      engagementData,
      revisionMode,
    });
  } catch (err) {
    return next(err);
  }
};
