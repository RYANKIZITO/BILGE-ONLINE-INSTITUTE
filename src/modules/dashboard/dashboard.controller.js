import { prisma } from "../../config/prisma.js";
import { recomputeCourseStatus } from "../courses/course.status.js";
import { enrollUser } from "../courses/course.service.js";
import { PaymentService } from "../payments/payment.service.js";
import {
  buildSwitchFinancialSummary,
  SWITCH_FINANCIAL_DIRECTION,
} from "../courses/course.pricing.js";
import { computeFinalCourseMark } from "../assessments/assessment.grading.service.js";
import { ensureCertificateForEnrollment } from "../certificates/certificate.service.js";
import { listPendingSwitchTopUpsForUser } from "../payments/switch-top-up.service.js";
import {
  ENGAGEMENT_REPORTING_PERIOD_OPTIONS,
  getInstructorEngagementSnapshot,
  getNextDayLiveSessionAlertsForAdmin,
  getNextDayLiveSessionAlertsForInstructor,
  getNextDayLiveSessionAlertsForStudent,
  getUpcomingLiveSessionAlertsForInstructor,
  getUpcomingLiveSessionAlertsForStudent,
  listInstructorEngagementSnapshots,
} from "../instructor/instructor-engagement.service.js";
import {
  sendLmsFeedbackNotification,
  validateLmsFeedbackSubmission,
} from "./lms-feedback.service.js";

const DAYS_7_MS = 7 * 24 * 60 * 60 * 1000;
const LIVE_SESSION_ADMIN_LOOKBACK_MS = 6 * 60 * 60 * 1000;
const LIVE_SESSION_ADMIN_LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000;
const MISSING = "__MISSING__";
const ENROLLMENT_CANCELLATION_REASON_LABELS = {
  SCHEDULE_CONFLICT: "Schedule conflict",
  FINANCIAL_CONSTRAINTS: "Financial constraints",
  COURSE_NOT_RIGHT: "Course not the right fit",
  NO_LONGER_INTERESTED: "No longer interested",
  TECHNICAL_DIFFICULTIES: "Technical difficulties",
  DUPLICATE_ENROLLMENT: "Duplicate or mistaken enrollment",
  WANTS_TO_SWITCH_PROGRAM: "Wants to switch program",
  OTHER: "Other",
};
const REFUND_REVIEW_STATUS_LABELS = {
  NOT_APPLICABLE: "No review request",
  PENDING_REVIEW: "Pending review",
  APPROVED: "Refund approved",
  SWITCH_APPROVED: "Switch approved",
  SWITCH_TOP_UP_REQUIRED: "Switch awaiting top-up",
  DECLINED: "Declined",
};
const SWITCH_FINANCIAL_DIRECTION_LABELS = {
  NOT_APPLICABLE: "No switch pricing comparison",
  EVEN_TRANSFER: "Even transfer",
  TOP_UP_REQUIRED: "Additional payment required",
  CREDIT_DUE: "Credit or partial refund due",
  MANUAL_REVIEW: "Manual pricing review required",
};
const ROOT_SUPERADMIN_EMAIL = (
  process.env.ROOT_SUPERADMIN_EMAIL || process.env.ROOT_SUPER_ADMIN_EMAIL || ""
).toLowerCase() || null;
const REVIEWER_PUBLIC_ALIAS = "Bilge";
const DEFAULT_ENGAGEMENT_PERIOD = "monthly";
const PAYMENT_METHOD_BY_PROVIDER = {
  stripe: "card",
  pesapal: "mobile_money",
  paypal: "paypal",
};

const safeQuery = async (fn, fallback) => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

const getEngagementPeriodFromRequest = (req) => {
  const requested = String(req.query.engagementPeriod || "").trim().toLowerCase();
  return ENGAGEMENT_REPORTING_PERIOD_OPTIONS.some((option) => option.value === requested)
    ? requested
    : DEFAULT_ENGAGEMENT_PERIOD;
};

const buildDashboardFeedbackDismissHref = (req) => {
  const params = new URLSearchParams();

  Object.entries(req.query || {}).forEach(([key, value]) => {
    if (
      ["feedbackModal", "feedbackFocus"].includes(key) ||
      value == null ||
      String(value).trim() === ""
    ) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)));
      return;
    }

    params.set(key, String(value));
  });

  const query = params.toString();
  return query ? `${req.path}?${query}` : req.path;
};

const getDashboardFeedbackState = (req) => {
  const mode = String(req.query.feedbackModal || "").trim().toLowerCase();
  const validMode = mode === "success" || mode === "form" ? mode : null;

  return {
    mode: validMode,
    isSuccess: validMode === "success",
    shouldOpen: Boolean(validMode),
    dismissHref: buildDashboardFeedbackDismissHref(req),
  };
};

const getReviewerPublicDisplayName = (reviewedBy) => {
  if (!reviewedBy?.id) return null;
  return REVIEWER_PUBLIC_ALIAS;
};

const formatUptimeLabel = (seconds) => {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const getAdminVisibleLiveSessions = async (asOf = new Date()) => {
  const windowStart = new Date(asOf.getTime() - LIVE_SESSION_ADMIN_LOOKBACK_MS);
  const windowEnd = new Date(asOf.getTime() + LIVE_SESSION_ADMIN_LOOKAHEAD_MS);

  const sessions = await prisma.liveSession.findMany({
    where: {
      meetingUrl: {
        not: null,
      },
      status: {
        in: ["SCHEDULED", "HOSTED"],
      },
      scheduledStartTime: {
        gte: windowStart,
        lte: windowEnd,
      },
    },
    orderBy: [{ scheduledStartTime: "asc" }, { createdAt: "desc" }],
    take: 30,
    select: {
      id: true,
      sessionType: true,
      status: true,
      scheduledStartTime: true,
      meetingUrl: true,
      verificationStatus: true,
      course: {
        select: {
          id: true,
          title: true,
          instructor: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  return sessions.map((session) => {
    const minutesFromStart = Math.round(
      (new Date(session.scheduledStartTime).getTime() - asOf.getTime()) / (1000 * 60)
    );
    let monitorState = "Upcoming";

    if (minutesFromStart >= -180 && minutesFromStart <= 120) {
      monitorState = "Check Now";
    } else if (minutesFromStart < -180) {
      monitorState = "Recent";
    }

    return {
      ...session,
      sessionTypeLabel:
        session.sessionType === "MID_WEEK" ? "Mid-week" : "End-week",
      verificationLabel:
        session.verificationStatus === "VERIFIED"
          ? "Verified by Google Meet"
          : session.verificationStatus === "PENDING"
            ? "Ready for future automatic verification"
            : session.verificationStatus === "UNVERIFIED"
              ? "Not automatically verified"
              : "Manual verification only",
      monitorState,
      minutesFromStart,
    };
  });
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const getCancellationRefundAmount = (cancellation) => {
  if (cancellation.refundReviewStatus === "APPROVED") {
    return roundMoney(cancellation.refundAmount);
  }

  if (
    cancellation.refundReviewStatus === "SWITCH_APPROVED" &&
    cancellation.switchFinancialDirection === "CREDIT_DUE"
  ) {
    return roundMoney(cancellation.switchBalanceAmount);
  }

  return 0;
};

const getRevenueOverview = async () => {
  const [successfulPayments, approvedAdjustments] = await Promise.all([
    prisma.payment.findMany({
      where: {
        status: "SUCCESS",
        courseId: {
          not: null,
        },
      },
      orderBy: { verifiedAt: "desc" },
      select: {
        id: true,
        userId: true,
        courseId: true,
        amount: true,
        currency: true,
        verifiedAt: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        course: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    }),
    prisma.enrollmentCancellation.findMany({
      where: {
        paymentId: {
          not: null,
        },
        providerAdjustmentStatus: {
          not: null,
        },
        refundReviewStatus: {
          in: ["APPROVED", "SWITCH_APPROVED"],
        },
      },
      select: {
        id: true,
        userId: true,
        courseId: true,
        refundReviewStatus: true,
        refundAmount: true,
        switchBalanceAmount: true,
        switchFinancialDirection: true,
        refundCurrency: true,
      },
    }),
  ]);

  const refundByStudentCourse = approvedAdjustments.reduce((acc, cancellation) => {
    const key = `${cancellation.userId}:${cancellation.courseId}`;
    const amount = getCancellationRefundAmount(cancellation);
    if (!amount) return acc;
    acc.set(key, roundMoney((acc.get(key) || 0) + amount));
    return acc;
  }, new Map());

  const revenueByStudentCourse = successfulPayments.reduce((acc, payment) => {
    const key = `${payment.userId}:${payment.courseId}`;
    const existing = acc.get(key) || {
      user: payment.user,
      course: payment.course,
      currency: String(payment.currency || "USD").toUpperCase(),
      grossAmount: 0,
      refundedAmount: refundByStudentCourse.get(key) || 0,
      latestAt: payment.verifiedAt || payment.createdAt,
    };

    existing.grossAmount = roundMoney(existing.grossAmount + Number(payment.amount || 0));
    const paymentMoment = payment.verifiedAt || payment.createdAt;
    if (!existing.latestAt || new Date(paymentMoment) > new Date(existing.latestAt)) {
      existing.latestAt = paymentMoment;
    }

    acc.set(key, existing);
    return acc;
  }, new Map());

  const rows = Array.from(revenueByStudentCourse.values())
    .map((row) => {
      const netAmount = roundMoney(row.grossAmount - row.refundedAmount);
      return {
        ...row,
        netAmount,
      };
    })
    .filter((row) => row.netAmount > 0)
    .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());

  const grossTotal = roundMoney(
    rows.reduce((sum, row) => sum + row.grossAmount, 0)
  );
  const refundedTotal = roundMoney(
    rows.reduce((sum, row) => sum + row.refundedAmount, 0)
  );
  const netTotal = roundMoney(rows.reduce((sum, row) => sum + row.netAmount, 0));

  return {
    hasPayments: successfulPayments.length > 0,
    grossTotal,
    refundedTotal,
    netTotal,
    rows,
  };
};

const buildActorMap = async (logs) => {
  const actorIds = Array.from(new Set(logs.map((log) => log.actorUserId).filter(Boolean)));
  if (actorIds.length === 0) return {};

  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true, email: true },
  });

  return actors.reduce((acc, actor) => {
    acc[actor.id] = actor;
    return acc;
  }, {});
};

const getStudentDisplayName = (student) => student?.fullName || student?.name || "Student";

const getEnrollmentCancellationReasonLabel = (reasonOption) =>
  ENROLLMENT_CANCELLATION_REASON_LABELS[reasonOption] || reasonOption || "Unspecified";

const getRefundReviewStatusLabel = (status) =>
  REFUND_REVIEW_STATUS_LABELS[status] || status || "No refund request";

const getSwitchFinancialDirectionLabel = (direction) =>
  SWITCH_FINANCIAL_DIRECTION_LABELS[direction] ||
  direction ||
  "No switch pricing comparison";

const getSwitchFinancialSummaryForCancellation = (cancellation) => {
  const summary = buildSwitchFinancialSummary({
    user: cancellation.user,
    sourceCourse: cancellation.course,
    targetCourse: cancellation.requestedTargetCourse,
    payment: cancellation.payment,
    storedSummary: {
      direction: cancellation.switchFinancialDirection,
      pricingTier: cancellation.switchPricingTier,
      sourceCourseFee: cancellation.sourceCourseFee,
      targetCourseFee: cancellation.targetCourseFee,
      transferAmount: cancellation.switchTransferAmount,
      balanceAmount: cancellation.switchBalanceAmount,
      currency: cancellation.switchPricingCurrency,
    },
  });

  if (summary.direction === SWITCH_FINANCIAL_DIRECTION.NOT_APPLICABLE) {
    return null;
  }

  let summaryText = getSwitchFinancialDirectionLabel(summary.direction);

  if (
    summary.direction === SWITCH_FINANCIAL_DIRECTION.TOP_UP_REQUIRED &&
    summary.balanceAmount != null
  ) {
    summaryText = `Top-up required: ${summary.balanceAmount} ${summary.currency}`;
  } else if (
    summary.direction === SWITCH_FINANCIAL_DIRECTION.CREDIT_DUE &&
    summary.balanceAmount != null
  ) {
    summaryText = `Credit due: ${summary.balanceAmount} ${summary.currency}`;
  } else if (
    summary.direction === SWITCH_FINANCIAL_DIRECTION.EVEN_TRANSFER &&
    summary.currency
  ) {
    summaryText = `Even transfer at ${summary.targetCourseFee} ${summary.currency}`;
  }

  return {
    ...summary,
    directionLabel: getSwitchFinancialDirectionLabel(summary.direction),
    summaryText,
  };
};

const createSwitchTopUpPayment = async (cancellation, reviewerId) => {
  const provider = cancellation.payment?.provider || "stripe";
  const paymentMethodType =
    PAYMENT_METHOD_BY_PROVIDER[provider] ||
    cancellation.payment?.paymentMethodType ||
    "card";
  const amount = Number(cancellation.switchBalanceAmount || 0);
  const currency = String(
    cancellation.switchPricingCurrency ||
    cancellation.payment?.currency ||
    cancellation.requestedTargetCourse?.currency ||
    "USD"
  ).toUpperCase();
  const fullName =
    cancellation.user?.fullName ||
    cancellation.user?.name ||
    cancellation.user?.email ||
    "Student";

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Top-up amount is invalid.");
  }

  if (!cancellation.user?.countryCode || !cancellation.user?.phoneNumber || !cancellation.user?.email) {
    throw new Error("Student profile is incomplete for automatic top-up creation.");
  }

  const payment = await PaymentService.initiate(provider, {
    amount,
    currency: currency.toLowerCase(),
    metadata: {
      userId: cancellation.userId,
      courseId: cancellation.requestedTargetCourseId,
      courseTitle: cancellation.requestedTargetCourse?.title || "Program switch top-up",
      courseDescription: `Program switch top-up from ${cancellation.course?.title || "previous course"} to ${cancellation.requestedTargetCourse?.title || "new course"}`,
      fullName,
      email: cancellation.user.email,
      phoneNumber: cancellation.user.phoneNumber,
      countryCode: cancellation.user.countryCode,
      paymentPurpose: "SWITCH_TOP_UP",
      cancellationId: cancellation.id,
      reviewerId,
    },
  });

  if (!payment?.checkoutUrl || !payment?.reference) {
    throw new Error("Unable to create the automatic top-up checkout.");
  }

  const createdPayment = await prisma.payment.create({
    data: {
      userId: cancellation.userId,
      courseId: cancellation.requestedTargetCourseId,
      amount,
      currency,
      provider,
      paymentMethodType,
      status: "PENDING",
      reference: payment.reference,
      providerRef: payment.providerRef || payment.reference,
      metadata: {
        ...(payment.metadata || {}),
        checkoutUrl: payment.checkoutUrl,
        paymentPurpose: "SWITCH_TOP_UP",
        cancellationId: cancellation.id,
      },
    },
  });

  return {
    payment: createdPayment,
    checkoutUrl: payment.checkoutUrl,
  };
};

const processAutomaticRefund = async (cancellation, amount, reviewerId, reasonLabel) => {
  if (!cancellation.payment) {
    return {
      adjustmentReference: null,
      adjustmentStatus: "NO_PROVIDER_REFUND",
      adjustmentNote: "No original payment was attached to this cancellation.",
    };
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return {
      adjustmentReference: null,
      adjustmentStatus: "NO_PROVIDER_REFUND",
      adjustmentNote: "No refund amount was required after pricing comparison.",
    };
  }

  if (
    cancellation.payment.provider === "pesapal" &&
    cancellation.payment.paymentMethodType === "mobile_money" &&
    numericAmount < Number(cancellation.payment.amount || 0)
  ) {
    throw new Error(
      "Automatic partial refunds are not available for Pesapal mobile money payments. Use a full refund or handle the difference manually."
    );
  }

  const refund = await PaymentService.refund(cancellation.payment.provider, {
    reference: cancellation.payment.reference,
    providerRef: cancellation.payment.providerRef,
    amount: numericAmount,
    currency: cancellation.payment.currency,
    metadata: {
      userId: cancellation.userId,
      cancellationId: cancellation.id,
      targetCourseId: cancellation.requestedTargetCourseId,
      reviewerId,
      reason: reasonLabel,
      orderTrackingId: cancellation.payment.metadata?.orderTrackingId,
      email: cancellation.user?.email,
    },
    reason: reasonLabel,
  });

  return {
    adjustmentReference: refund?.reference || null,
    adjustmentStatus: String(refund?.status || "submitted"),
    adjustmentNote:
      numericAmount === Number(cancellation.payment.amount || 0)
        ? `Automatic refund submitted for ${numericAmount} ${cancellation.payment.currency}.`
        : `Automatic partial refund submitted for ${numericAmount} ${cancellation.payment.currency}.`,
  };
};

const buildStudentSearchWhere = (query) => {
  const normalized = String(query || "").trim();
  if (!normalized) {
    return { role: "STUDENT" };
  }

  return {
    role: "STUDENT",
    OR: [
      { name: { contains: normalized, mode: "insensitive" } },
      { fullName: { contains: normalized, mode: "insensitive" } },
      { email: { contains: normalized, mode: "insensitive" } },
      { studentCode: { contains: normalized, mode: "insensitive" } },
      { id: { contains: normalized, mode: "insensitive" } },
      { nationalIdNumber: { contains: normalized, mode: "insensitive" } },
    ],
  };
};

const getRecentEnrollmentCancellations = async (take = 10) => {
  const cancellations = await prisma.enrollmentCancellation.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          fullName: true,
          email: true,
          studentCode: true,
          countryCode: true,
          phoneNumber: true,
        },
      },
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          priceUgandanUsd: true,
          priceForeignUsd: true,
          currency: true,
        },
      },
      requestedTargetCourse: {
        select: {
          id: true,
          title: true,
          slug: true,
          priceUgandanUsd: true,
          priceForeignUsd: true,
          currency: true,
        },
      },
      payment: {
        select: {
          id: true,
          amount: true,
          currency: true,
          provider: true,
          providerRef: true,
          paymentMethodType: true,
          metadata: true,
        },
      },
      topUpPayment: {
        select: {
          id: true,
          status: true,
          amount: true,
          currency: true,
          provider: true,
        },
      },
      reviewedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return cancellations.map((cancellation) => ({
    ...cancellation,
    reasonLabel: getEnrollmentCancellationReasonLabel(cancellation.reasonOption),
    refundStatusLabel: getRefundReviewStatusLabel(cancellation.refundReviewStatus),
    studentDisplayName: getStudentDisplayName(cancellation.user),
    switchFinancialSummary: getSwitchFinancialSummaryForCancellation(cancellation),
    reviewedByDisplayName: getReviewerPublicDisplayName(cancellation.reviewedBy),
  }));
};

const getTranscriptRowsForAdmin = async (courseId, studentId) => {
  const assessments = await prisma.assessment.findMany({
    where: {
      courseId,
      published: true,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      type: true,
      maxScore: true,
    },
  });

  const submissions = await prisma.assessmentSubmission.findMany({
    where: {
      studentId,
      assessment: { courseId },
    },
    orderBy: [{ assessmentId: "asc" }, { attempt: "desc" }],
    select: {
      assessmentId: true,
      score: true,
      attempt: true,
      submittedAt: true,
    },
  });

  const bestByAssessmentId = new Map();

  for (const submission of submissions) {
    const existing = bestByAssessmentId.get(submission.assessmentId);

    if (!existing || Number(submission.score || 0) > Number(existing.score || 0)) {
      bestByAssessmentId.set(submission.assessmentId, submission);
    }
  }

  return assessments.map((assessment) => {
    const best = bestByAssessmentId.get(assessment.id);

    return {
      title: assessment.title,
      type: assessment.type,
      maxScore: assessment.maxScore,
      score: best?.score ?? null,
      attempt: best?.attempt ?? null,
      submittedAt: best?.submittedAt ?? null,
    };
  });
};

const getStudentContinueLessons = async (userId) => {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      userId,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          lessons: {
            where: { published: true },
            orderBy: { position: "asc" },
            select: {
              id: true,
              title: true,
              position: true,
            },
          },
        },
      },
    },
  });

  const lessonIds = enrollments.flatMap((enrollment) =>
    enrollment.course.lessons.map((lesson) => lesson.id)
  );

  const progressEntries = lessonIds.length
    ? await prisma.progress.findMany({
        where: {
          userId,
          lessonId: { in: lessonIds },
        },
        select: {
          lessonId: true,
          completed: true,
          updatedAt: true,
        },
      })
    : [];

  const progressByLessonId = progressEntries.reduce((acc, entry) => {
    acc[entry.lessonId] = entry;
    return acc;
  }, {});

  return enrollments
    .map((enrollment) => {
      const lessons = enrollment.course.lessons || [];

      if (lessons.length === 0) {
        return null;
      }

      const courseProgressEntries = lessons
        .map((lesson) => progressByLessonId[lesson.id])
        .filter(Boolean);

      const nextLesson =
        lessons.find((lesson, index) => {
          const previousLesson = index > 0 ? lessons[index - 1] : null;
          const previousCompleted = previousLesson
            ? Boolean(progressByLessonId[previousLesson.id]?.completed)
            : true;
          const currentCompleted = Boolean(progressByLessonId[lesson.id]?.completed);

          return previousCompleted && !currentCompleted;
        }) || null;

      if (!nextLesson) {
        if (!enrollment.completed) {
          return null;
        }

        const latestCompletedLesson = [...lessons]
          .map((lesson) => ({
            lesson,
            progress: progressByLessonId[lesson.id] || null,
          }))
          .filter((entry) => entry.progress?.completed)
          .sort(
            (a, b) =>
              new Date(b.progress.updatedAt).getTime() - new Date(a.progress.updatedAt).getTime()
          )[0]?.lesson;

        const revisionLesson = latestCompletedLesson || lessons[0];

        return {
          courseId: enrollment.course.id,
          courseTitle: enrollment.course.title,
          courseSlug: enrollment.course.slug,
          lessonId: revisionLesson.id,
          lessonTitle: revisionLesson.title,
          lessonPosition: revisionLesson.position,
          hasStarted: courseProgressEntries.length > 0,
          latestActivityAt:
            latestCompletedLesson && progressByLessonId[latestCompletedLesson.id]
              ? progressByLessonId[latestCompletedLesson.id].updatedAt
              : enrollment.createdAt,
          accessMode: "revision",
        };
      }

      const latestActivityAt =
        courseProgressEntries.length > 0
          ? courseProgressEntries.reduce((latest, entry) => {
              if (!latest) return entry.updatedAt;
              return new Date(entry.updatedAt) > new Date(latest) ? entry.updatedAt : latest;
            }, null)
          : enrollment.createdAt;

      return {
        courseId: enrollment.course.id,
        courseTitle: enrollment.course.title,
        courseSlug: enrollment.course.slug,
        lessonId: nextLesson.id,
        lessonTitle: nextLesson.title,
        lessonPosition: nextLesson.position,
        hasStarted: courseProgressEntries.length > 0,
        latestActivityAt,
        accessMode: "continue",
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.accessMode !== b.accessMode) {
        return a.accessMode === "continue" ? -1 : 1;
      }

      if (a.hasStarted !== b.hasStarted) {
        return a.hasStarted ? -1 : 1;
      }

      return new Date(b.latestActivityAt).getTime() - new Date(a.latestActivityAt).getTime();
    });
};

const buildAdminStudentLookup = async (req) => {
  const studentQuery = String(req.query.studentQuery || "").trim();
  const selectedStudentId = String(req.query.studentId || "").trim();

  const [studentOptions, matchingStudents] = await Promise.all([
    safeQuery(
      () =>
        prisma.user.findMany({
          where: { role: "STUDENT" },
          orderBy: [{ name: "asc" }, { createdAt: "desc" }],
          select: {
            id: true,
            name: true,
            fullName: true,
            studentCode: true,
            email: true,
            nationalIdNumber: true,
          },
        }),
      []
    ),
    studentQuery
      ? safeQuery(
          () =>
            prisma.user.findMany({
              where: buildStudentSearchWhere(studentQuery),
              orderBy: [{ name: "asc" }, { createdAt: "desc" }],
              take: 20,
              select: {
                id: true,
                name: true,
                fullName: true,
                studentCode: true,
                email: true,
                nationalIdNumber: true,
              },
            }),
          []
        )
      : Promise.resolve([]),
  ]);

  let selectedStudent = null;
  let selectedStudentCourses = [];
  let selectedStudentCancellations = [];

  if (selectedStudentId) {
    selectedStudent = await safeQuery(
      () =>
        prisma.user.findFirst({
          where: { id: selectedStudentId, role: "STUDENT" },
          select: {
            id: true,
            name: true,
            fullName: true,
            studentCode: true,
            email: true,
            phoneNumber: true,
            countryCode: true,
            nationality: true,
            nationalIdNumber: true,
            parentNames: true,
            dateOfBirth: true,
            profileCompleted: true,
            createdAt: true,
          },
        }),
      null
    );

    if (selectedStudent) {
      const [enrollments, payments, certificates] = await Promise.all([
        safeQuery(
          () =>
            prisma.enrollment.findMany({
              where: { userId: selectedStudent.id },
              orderBy: { createdAt: "desc" },
              include: {
                course: {
                  select: {
                    id: true,
                    title: true,
                    slug: true,
                    instructor: { select: { name: true } },
                  },
                },
              },
            }),
          []
        ),
        safeQuery(
          () =>
            prisma.payment.findMany({
              where: { userId: selectedStudent.id },
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                courseId: true,
                amount: true,
                currency: true,
                provider: true,
                paymentMethodType: true,
                status: true,
                reference: true,
                verifiedAt: true,
                createdAt: true,
              },
            }),
          []
        ),
        safeQuery(
          () =>
            prisma.certificate.findMany({
              where: { userId: selectedStudent.id },
              orderBy: { issuedAt: "desc" },
              select: {
                id: true,
                courseId: true,
                verificationCode: true,
                certificateNumber: true,
                issuedAt: true,
              },
            }),
          []
        ),
      ]);

      const paymentsByCourseId = payments.reduce((acc, payment) => {
        const key = payment.courseId || "__NONE__";
        if (!acc[key]) acc[key] = [];
        acc[key].push(payment);
        return acc;
      }, {});

      const certificatesByCourseId = certificates.reduce((acc, certificate) => {
        acc[certificate.courseId] = certificate;
        return acc;
      }, {});

      selectedStudentCourses = await Promise.all(
        enrollments.map(async (enrollment) => {
          const coursePayments = paymentsByCourseId[enrollment.courseId] || [];
          const latestPayment = coursePayments[0] || null;
          const existingCertificate = certificatesByCourseId[enrollment.courseId] || null;
          const [certificateResult, transcriptRows] = await Promise.all([
            ensureCertificateForEnrollment(enrollment, selectedStudent),
            getTranscriptRowsForAdmin(enrollment.courseId, selectedStudent.id),
          ]);
          const certificate = certificateResult.certificate || existingCertificate;
          const gradeSummary =
            certificateResult.gradeSummary ||
            (await computeFinalCourseMark(enrollment.courseId, selectedStudent.id));

          return {
            enrollment,
            latestPayment,
            paymentHistory: coursePayments,
            certificate,
            finalCourseMark: gradeSummary?.finalCourseMark ?? 0,
            transcriptRows,
          };
        })
      );

      selectedStudentCancellations = await safeQuery(
        () =>
          prisma.enrollmentCancellation.findMany({
            where: { userId: selectedStudent.id },
            orderBy: { createdAt: "desc" },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  fullName: true,
                  email: true,
                  studentCode: true,
                  countryCode: true,
                  phoneNumber: true,
                },
              },
              course: {
                select: {
                  id: true,
                  title: true,
                  slug: true,
                  priceUgandanUsd: true,
                  priceForeignUsd: true,
                  currency: true,
                },
              },
              requestedTargetCourse: {
                select: {
                  id: true,
                  title: true,
                  slug: true,
                  priceUgandanUsd: true,
                  priceForeignUsd: true,
                  currency: true,
                },
              },
              payment: {
                select: {
                  id: true,
                  amount: true,
                  currency: true,
                  provider: true,
                  providerRef: true,
                  paymentMethodType: true,
                  metadata: true,
                },
              },
              topUpPayment: {
                select: {
                  id: true,
                  status: true,
                  amount: true,
                  currency: true,
                  provider: true,
                },
              },
              reviewedBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          }),
        []
      );

      selectedStudentCancellations = selectedStudentCancellations.map((cancellation) => ({
        ...cancellation,
        reasonLabel: getEnrollmentCancellationReasonLabel(cancellation.reasonOption),
        refundStatusLabel: getRefundReviewStatusLabel(cancellation.refundReviewStatus),
        switchFinancialSummary: getSwitchFinancialSummaryForCancellation(cancellation),
        reviewedByDisplayName: getReviewerPublicDisplayName(cancellation.reviewedBy),
      }));
    }
  }

  return {
    studentQuery,
    selectedStudentId,
    studentOptions,
    matchingStudents,
    selectedStudent,
    selectedStudentCourses,
    selectedStudentCancellations,
  };
};

export const getDashboardRedirect = (req, res) => {
  const role = req.session.user?.role;
  if (role === "SUPER_ADMIN") return res.redirect("/super-admin/dashboard");
  if (role === "ADMIN") return res.redirect("/admin/dashboard");
  if (role === "INSTRUCTOR") return res.redirect("/instructor/dashboard");
  return res.redirect("/student/dashboard");
};

export const submitLmsDashboardFeedback = async (req, res) => {
  const validation = validateLmsFeedbackSubmission(req.body);
  const origin = "http://localhost";
  const referer = String(req.get("referer") || "").trim();
  const requestedPath = String(req.body.pagePath || "").trim();
  const baseUrl = referer || (requestedPath ? `${origin}${requestedPath}` : `${origin}/dashboard`);
  const redirectUrl = new URL(baseUrl, origin);

  redirectUrl.searchParams.delete("feedbackModal");
  redirectUrl.searchParams.delete("feedbackFocus");
  redirectUrl.searchParams.set("feedbackFocus", "lms-feedback");

  if (!validation.isValid) {
    req.session.flash = {
      type: "error",
      message: validation.errors.join(" "),
    };
    redirectUrl.searchParams.set("feedbackModal", "form");
    return res.redirect(`${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`);
  }

  try {
    const delivery = await sendLmsFeedbackNotification({
      payload: validation.data,
      user: req.session.user,
    });

    req.session.flash = delivery?.delivered
        ? {
          type: "success",
          message:
            "Your LMS feedback was sent to Bilge successfully. Thank you for helping us improve the platform.",
        }
      : {
          type: "error",
          message:
            "The LMS feedback form could not send right now. Please try again in a moment.",
        };

    redirectUrl.searchParams.set("feedbackModal", delivery?.delivered ? "success" : "form");
    return res.redirect(`${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`);
  } catch (error) {
    console.error("[lms-feedback-mail] Failed to send LMS feedback email:", error);
    req.session.flash = {
      type: "error",
      message:
        "The LMS feedback form could not send right now. Please try again in a moment.",
    };
    redirectUrl.searchParams.set("feedbackModal", "form");
    return res.redirect(`${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`);
  }
};

export const getSuperAdminDashboard = async (req, res, next) => {
  try {
    const flash = req.session.flash || null;
    req.session.flash = null;
    const engagementPeriod = getEngagementPeriodFromRequest(req);
    const since = new Date(Date.now() - DAYS_7_MS);
    const rootUser = ROOT_SUPERADMIN_EMAIL
      ? await prisma.user.findFirst({
          where: { email: { equals: ROOT_SUPERADMIN_EMAIL, mode: "insensitive" } },
          select: { id: true },
        })
      : null;
    const rootUserId = rootUser?.id || null;
    const excludeRootUser = ROOT_SUPERADMIN_EMAIL
      ? { NOT: { email: { equals: ROOT_SUPERADMIN_EMAIL, mode: "insensitive" } } }
      : {};

    const userCounts = {
      SUPER_ADMIN: 0,
      ADMIN: 0,
      INSTRUCTOR: 0,
      STUDENT: 0,
    };

    const groupedUsers = await safeQuery(
      () =>
        prisma.user.groupBy({
          by: ["role"],
          _count: { role: true },
          where: excludeRootUser,
        }),
      []
    );

    groupedUsers.forEach((row) => {
      userCounts[row.role] = row._count.role;
    });

    const totalUsers = Object.values(userCounts).reduce((sum, value) => sum + value, 0);
    const newSignups = await safeQuery(
      () => prisma.user.count({ where: { createdAt: { gte: since }, ...excludeRootUser } }),
      0
    );

    const totalCourses = await safeQuery(() => prisma.course.count(), 0);
    const publishedCount = await safeQuery(
      () => prisma.course.count({ where: { published: true } }),
      null
    );
    const draftCount = await safeQuery(
      () => prisma.course.count({ where: { status: "DRAFT" } }),
      null
    );
    const underReviewCount = await safeQuery(
      () => prisma.course.count({ where: { status: { in: ["READY", "COMING_SOON"] } } }),
      null
    );

    const courseStats = {
      total: totalCourses,
      published: publishedCount,
      draft: draftCount,
      underReview: underReviewCount,
      statusNote: "Under Review includes READY/COMING_SOON",
    };

    const loginLogs = await safeQuery(
      () =>
        prisma.auditLog.findMany({
          where: {
            action: "LOGIN",
            ...(rootUserId ? { NOT: { actorUserId: rootUserId } } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      []
    );
    const loginActors = await buildActorMap(loginLogs);

    const revenueOverview = await safeQuery(
      () => getRevenueOverview(),
      null
    );
    const hasPayments = Boolean(revenueOverview?.hasPayments);
    const revenue = hasPayments ? revenueOverview.netTotal.toFixed(2) : null;
    const recentPayments = hasPayments
      ? revenueOverview.rows.slice(0, 5).map((row) => ({
          ...row,
          grossAmount: row.grossAmount.toFixed(2),
          refundedAmount: row.refundedAmount.toFixed(2),
          netAmount: row.netAmount.toFixed(2),
        }))
      : [];
    const adminLiveSessions = await safeQuery(
      () => getAdminVisibleLiveSessions(),
      []
    );
    const nextDayLiveSessionAlerts = await safeQuery(
      () => getNextDayLiveSessionAlertsForAdmin(),
      []
    );
    const recentEnrollmentCancellations = await safeQuery(
      () => getRecentEnrollmentCancellations(10),
      []
    );
    const instructorEngagementSnapshots = await safeQuery(
      () => listInstructorEngagementSnapshots({ period: engagementPeriod }),
      []
    );
    const dbHealthy = await safeQuery(async () => {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    }, false);
    const failedPaymentsLast7Days = await safeQuery(
      () =>
        prisma.payment.count({
          where: {
            status: "FAILED",
            createdAt: { gte: since },
          },
        }),
      0
    );
    const pendingRefundReviews = await safeQuery(
      () =>
        prisma.enrollmentCancellation.count({
          where: {
            refundReviewStatus: "PENDING_REVIEW",
          },
        }),
      0
    );
    const pendingCourseQuestions = await safeQuery(
      () =>
        prisma.courseQuestion.count({
          where: {
            status: "PENDING",
          },
        }),
      0
    );
    const liveSessionVerificationQueue = await safeQuery(
      () =>
        prisma.liveSession.count({
          where: {
            verificationStatus: {
              in: ["PENDING", "UNVERIFIED"],
            },
          },
        }),
      0
    );
    const lastFailedPayment = await safeQuery(
      () =>
        prisma.payment.findFirst({
          where: { status: "FAILED" },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          select: {
            provider: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      null
    );
    const systemHealthAlerts =
      failedPaymentsLast7Days +
      pendingRefundReviews +
      pendingCourseQuestions +
      liveSessionVerificationQueue;
    const systemHealth = {
      status: dbHealthy
        ? systemHealthAlerts > 0
          ? "Attention Needed"
          : "Healthy"
        : "Degraded",
      tone: dbHealthy
        ? systemHealthAlerts > 0
          ? "warning"
          : "success"
        : "danger",
      databaseLabel: dbHealthy ? "Connected" : "Unreachable",
      uptimeLabel: formatUptimeLabel(process.uptime()),
      lastUpdatedAt: new Date(),
      failedPaymentsLast7Days,
      pendingRefundReviews,
      pendingCourseQuestions,
      liveSessionVerificationQueue,
      alertsCount: systemHealthAlerts,
      lastFailedPaymentAt: lastFailedPayment?.updatedAt || lastFailedPayment?.createdAt || null,
      lastFailedPaymentProvider: lastFailedPayment?.provider || null,
    };
    const activeInstructorCount = instructorEngagementSnapshots.filter(
      (snapshot) => snapshot.activeState === "Active"
    ).length;
    const atRiskInstructorCount = instructorEngagementSnapshots.filter(
      (snapshot) => snapshot.activeState === "At-Risk"
    ).length;
    const inactiveInstructorCount = instructorEngagementSnapshots.filter(
      (snapshot) => snapshot.activeState === "Inactive"
    ).length;

    return res.render("super-admin/dashboard", {
      user: req.session.user,
      userCounts,
      totalUsers,
      courseStats,
      newSignups,
      loginLogs,
      loginActors,
      revenue,
      revenueGross: hasPayments ? revenueOverview.grossTotal.toFixed(2) : null,
      revenueRefunded: hasPayments ? revenueOverview.refundedTotal.toFixed(2) : null,
      recentPayments,
      hasPayments,
      adminLiveSessions,
      nextDayLiveSessionAlerts,
      recentEnrollmentCancellations,
      instructorEngagementSnapshots,
      engagementPeriod,
      engagementPeriodOptions: ENGAGEMENT_REPORTING_PERIOD_OPTIONS,
      engagementAvailable: instructorEngagementSnapshots.length > 0,
      activeInstructorCount,
      atRiskInstructorCount,
      inactiveInstructorCount,
      systemHealth,
      dashboardFeedbackState: getDashboardFeedbackState(req),
      flash
    });
  } catch (err) {
    return next(err);
  }
};

export const getSuperAdminAuditLogs = async (req, res, next) => {
  try {
    const rootUser = ROOT_SUPERADMIN_EMAIL
      ? await prisma.user.findFirst({
          where: { email: { equals: ROOT_SUPERADMIN_EMAIL, mode: "insensitive" } },
          select: { id: true },
        })
      : null;
    const rootUserId = rootUser?.id || null;

    const logs = await safeQuery(
      () =>
        prisma.auditLog.findMany({
          ...(rootUserId ? { where: { NOT: { actorUserId: rootUserId } } } : {}),
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      []
    );

    const actorMap = await buildActorMap(logs);

    return res.render("super-admin/audit-logs", {
      user: req.session.user,
      logs,
      actorMap,
    });
  } catch (err) {
    return next(err);
  }
};

export const getSuperAdminSettings = (req, res) => {
  return res.render("super-admin/settings", { user: req.session.user });
};

export const getAdminDashboard = async (req, res, next) => {
  try {
    const flash = req.session.flash || null;
    req.session.flash = null;
    const engagementPeriod = getEngagementPeriodFromRequest(req);
    const since = new Date(Date.now() - DAYS_7_MS);

    const pendingDrafts = await safeQuery(
      () => prisma.course.count({ where: { status: "DRAFT" } }),
      MISSING
    );
    const unpublishedCount = await safeQuery(
      () => prisma.course.count({ where: { published: false } }),
      MISSING
    );

    const enrollmentsToday = await safeQuery(
      () => prisma.enrollment.count({ where: { createdAt: { gte: startOfToday() } } }),
      MISSING
    );
    const totalStudents = await safeQuery(
      () => prisma.user.count({ where: { role: "STUDENT" } }),
      MISSING
    );
    const recentlyEnrolledStudents = await safeQuery(
      () =>
        prisma.enrollment.findMany({
          where: { createdAt: { gte: since } },
          distinct: ["userId"],
          select: { userId: true },
        }),
      MISSING
    );
    const recentlyActiveStudents = await safeQuery(
      () =>
        prisma.progress.findMany({
          where: { updatedAt: { gte: since } },
          distinct: ["userId"],
          select: { userId: true },
        }),
      MISSING
    );

    const activeStudentsWeek =
      recentlyEnrolledStudents !== MISSING && recentlyActiveStudents !== MISSING
        ? new Set([
            ...recentlyEnrolledStudents.map((item) => item.userId),
            ...recentlyActiveStudents.map((item) => item.userId),
          ]).size
        : MISSING;

    const topEnrollments = await safeQuery(
      () =>
        prisma.enrollment.groupBy({
          by: ["courseId"],
          _count: { courseId: true },
          orderBy: { _count: { courseId: "desc" } },
          take: 5,
        }),
      MISSING
    );

    let courseOverview = [];
    let courseOverviewMode = "latest";

    if (topEnrollments !== MISSING && topEnrollments.length > 0) {
      const courseIds = topEnrollments.map((row) => row.courseId);
      const courses = await prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, title: true, slug: true },
      });
      const courseMap = courses.reduce((acc, course) => {
        acc[course.id] = course;
        return acc;
      }, {});

      courseOverview = topEnrollments
        .map((row) => ({
          ...courseMap[row.courseId],
          enrollments: row._count.courseId,
        }))
        .filter((item) => item.title);
      courseOverviewMode = "top";
    }

    if (courseOverview.length === 0) {
      const latestCourses = await safeQuery(
        () =>
          prisma.course.findMany({
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { id: true, title: true, slug: true },
          }),
        []
      );
      courseOverview = latestCourses;
    }

    const studentLookup = await buildAdminStudentLookup(req);
    const adminLiveSessions = await safeQuery(
      () => getAdminVisibleLiveSessions(),
      []
    );
    const nextDayLiveSessionAlerts = await safeQuery(
      () => getNextDayLiveSessionAlertsForAdmin(),
      []
    );
    const recentEnrollmentCancellations = await safeQuery(
      () => getRecentEnrollmentCancellations(10),
      []
    );
    const instructorEngagementSnapshots = await safeQuery(
      () => listInstructorEngagementSnapshots({ period: engagementPeriod }),
      []
    );

    return res.render("admin/dashboard", {
      user: req.session.user,
      pendingDrafts,
      unpublishedCount,
      pendingActionsAvailable: pendingDrafts !== MISSING && unpublishedCount !== MISSING,
      totalStudents,
      enrollmentsToday,
      activeStudentsWeek,
      studentsOverviewAvailable:
        totalStudents !== MISSING &&
        enrollmentsToday !== MISSING &&
        activeStudentsWeek !== MISSING,
      studentLookup,
      courseOverview,
      courseOverviewMode,
      adminLiveSessions,
      nextDayLiveSessionAlerts,
      recentEnrollmentCancellations,
      instructorEngagementSnapshots,
      engagementPeriod,
      engagementPeriodOptions: ENGAGEMENT_REPORTING_PERIOD_OPTIONS,
      engagementAvailable: instructorEngagementSnapshots.length > 0,
      dashboardFeedbackState: getDashboardFeedbackState(req),
      flash
    });
  } catch (err) {
    return next(err);
  }
};

export const getInstructorDashboard = async (req, res, next) => {
  try {
    const userId = req.session.user.id;

    const myCourses = await safeQuery(
      () =>
        prisma.course.findMany({
          where: { instructorId: userId },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            title: true,
            status: true,
            published: true,
            createdAt: true,
          },
        }),
      MISSING
    );
    const engagementSnapshot = await safeQuery(
      () => getInstructorEngagementSnapshot(userId),
      null
    );
    const upcomingLiveSessionAlerts = await safeQuery(
      () => getUpcomingLiveSessionAlertsForInstructor(userId),
      []
    );
    const nextDayLiveSessionAlerts = await safeQuery(
      () => getNextDayLiveSessionAlertsForInstructor(userId),
      []
    );

    const flash = req.session.flash || null;
    req.session.flash = null;

    return res.render("instructor/dashboard", {
      user: req.session.user,
      myCourses: myCourses === MISSING ? [] : myCourses,
      assignmentFeatureAvailable: myCourses !== MISSING,
      engagementSnapshot,
      upcomingLiveSessionAlerts,
      nextDayLiveSessionAlerts,
      dashboardFeedbackState: getDashboardFeedbackState(req),
      flash,
    });
  } catch (err) {
    return next(err);
  }
};

export const publishInstructorCourse = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;
    const courseId = req.params.id;

    const course = await prisma.course.findFirst({
      where: { id: courseId, instructorId },
      select: { id: true, title: true, published: true },
    });

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/instructor/dashboard");
    }

    if (course.published) {
      req.session.flash = { type: "info", message: "Course is already published" };
      return res.redirect("/instructor/dashboard");
    }

    const lessonCount = await prisma.lesson.count({
      where: { courseId: course.id },
    });

    if (lessonCount === 0) {
      req.session.flash = {
        type: "error",
        message: "Add at least one lesson before publishing",
      };
      return res.redirect("/instructor/dashboard");
    }

    const publishedLessonCount = await prisma.lesson.count({
      where: { courseId: course.id, published: true },
    });

    if (publishedLessonCount === 0) {
      req.session.flash = {
        type: "error",
        message: "Publish at least one lesson before publishing the course",
      };
      return res.redirect("/instructor/dashboard");
    }

    await prisma.course.update({
      where: { id: course.id },
      data: { published: true, publishedAt: new Date() },
    });
    await recomputeCourseStatus(course.id);

    req.session.flash = { type: "success", message: "Course published" };
    return res.redirect("/instructor/dashboard");
  } catch (err) {
    return next(err);
  }
};

export const unpublishInstructorCourse = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;
    const courseId = req.params.id;

    const course = await prisma.course.findFirst({
      where: { id: courseId, instructorId },
      select: { id: true, title: true, published: true },
    });

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/instructor/dashboard");
    }

    if (!course.published) {
      req.session.flash = { type: "info", message: "Course is already unpublished" };
      return res.redirect("/instructor/dashboard");
    }

    await prisma.course.update({
      where: { id: course.id },
      data: { published: false, publishedAt: null },
    });
    await recomputeCourseStatus(course.id);

    req.session.flash = { type: "success", message: "Course unpublished" };
    return res.redirect("/instructor/dashboard");
  } catch (err) {
    return next(err);
  }
};

export const getStudentDashboard = async (req, res, next) => {
  try {
    const flash = req.session.flash || null;
    req.session.flash = null;
    const userId = req.session.user.id;

    const enrollments = await safeQuery(
      () =>
        prisma.enrollment.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          include: {
            course: {
              select: { id: true, title: true, slug: true },
            },
          },
        }),
      MISSING
    );

    const continueLessons = await safeQuery(
      () => getStudentContinueLessons(userId),
      MISSING
    );
    const pendingSwitchTopUps = await safeQuery(
      () => listPendingSwitchTopUpsForUser(userId),
      []
    );
    const upcomingLiveSessionAlerts = await safeQuery(
      () => getUpcomingLiveSessionAlertsForStudent(userId),
      []
    );
    const nextDayLiveSessionAlerts = await safeQuery(
      () => getNextDayLiveSessionAlertsForStudent(userId),
      []
    );

    return res.render("student/dashboard", {
      user: req.session.user,
      enrollments: enrollments === MISSING ? [] : enrollments,
      enrollmentsAvailable: enrollments !== MISSING,
      continueLessons: continueLessons === MISSING ? [] : continueLessons,
      continueLesson: continueLessons !== MISSING && continueLessons.length > 0 ? continueLessons[0] : null,
      continueLessonQueue:
        continueLessons !== MISSING && continueLessons.length > 1
          ? continueLessons.slice(1, 4)
          : [],
      progressAvailable: continueLessons !== MISSING,
      pendingSwitchTopUps,
      upcomingLiveSessionAlerts,
      nextDayLiveSessionAlerts,
      dashboardFeedbackState: getDashboardFeedbackState(req),
      flash
    });
  } catch (err) {
    return next(err);
  }
};

export const reviewEnrollmentCancellationRefund = async (req, res, next) => {
  try {
    const reviewerId = req.session.user.id;
    const cancellationId = req.params.id;
    const decision = String(req.body.refundDecision || "").trim().toUpperCase();
    const decisionNote = String(req.body.refundDecisionNote || "").trim();

    if (
      decision !== "APPROVED" &&
      decision !== "DECLINED" &&
      decision !== "SWITCH_APPROVED"
    ) {
      req.session.flash = {
        type: "error",
        message: "Choose a valid refund decision.",
      };
      return res.redirect(req.get("referer") || "/dashboard");
    }

    const cancellation = await prisma.enrollmentCancellation.findUnique({
      where: { id: cancellationId },
      select: {
        id: true,
        userId: true,
        paymentId: true,
        refundReviewStatus: true,
        requestedTargetCourseId: true,
        switchFinancialDirection: true,
        switchPricingTier: true,
        sourceCourseFee: true,
        targetCourseFee: true,
        switchTransferAmount: true,
        switchBalanceAmount: true,
        switchPricingCurrency: true,
        user: {
          select: {
            id: true,
            countryCode: true,
            email: true,
            name: true,
            fullName: true,
            phoneNumber: true,
          },
        },
        payment: {
          select: {
            id: true,
            reference: true,
            provider: true,
            providerRef: true,
            paymentMethodType: true,
            amount: true,
            currency: true,
            metadata: true,
          },
        },
        topUpPaymentId: true,
        course: {
          select: {
            id: true,
            title: true,
            priceUgandanUsd: true,
            priceForeignUsd: true,
            currency: true,
          },
        },
        requestedTargetCourse: {
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

    if (!cancellation) {
      req.session.flash = {
        type: "error",
        message: "Cancellation record not found.",
      };
      return res.redirect(req.get("referer") || "/dashboard");
    }

    if (
      !cancellation.paymentId &&
      !cancellation.requestedTargetCourseId &&
      cancellation.refundReviewStatus === "NOT_APPLICABLE"
    ) {
      req.session.flash = {
        type: "info",
        message: "This cancellation does not have a refund request to review.",
      };
      return res.redirect(req.get("referer") || "/dashboard");
    }

    if (decision === "SWITCH_APPROVED" && !cancellation.requestedTargetCourseId) {
      req.session.flash = {
        type: "error",
        message: "This request does not include a target course for switching.",
      };
      return res.redirect(req.get("referer") || "/dashboard");
    }

    const switchFinancialSummary = getSwitchFinancialSummaryForCancellation(cancellation);
    let nextStatus = decision;
    let adjustmentReference = null;
    let adjustmentStatus = null;
    let adjustmentNote = decisionNote || null;

    if (
      decision === "SWITCH_APPROVED" &&
      switchFinancialSummary?.direction === SWITCH_FINANCIAL_DIRECTION.MANUAL_REVIEW
    ) {
      req.session.flash = {
        type: "error",
        message: "This switch needs manual pricing review before it can be approved.",
      };
      return res.redirect(req.get("referer") || "/dashboard");
    }

    if (
      decision === "SWITCH_APPROVED" &&
      switchFinancialSummary?.direction === SWITCH_FINANCIAL_DIRECTION.TOP_UP_REQUIRED
    ) {
      nextStatus = "SWITCH_TOP_UP_REQUIRED";
    }

    if (decision === "APPROVED") {
      const refundResult = await processAutomaticRefund(
        cancellation,
        cancellation.refundAmount,
        reviewerId,
        "Enrollment cancellation refund"
      );

      adjustmentReference = refundResult.adjustmentReference;
      adjustmentStatus = refundResult.adjustmentStatus;
      adjustmentNote = decisionNote || refundResult.adjustmentNote;
    }

    if (
      decision === "SWITCH_APPROVED" &&
      switchFinancialSummary?.direction === SWITCH_FINANCIAL_DIRECTION.CREDIT_DUE
    ) {
      const refundResult = await processAutomaticRefund(
        cancellation,
        switchFinancialSummary.balanceAmount,
        reviewerId,
        "Program switch price adjustment refund"
      );

      adjustmentReference = refundResult.adjustmentReference;
      adjustmentStatus = refundResult.adjustmentStatus;
      adjustmentNote = decisionNote || refundResult.adjustmentNote;
    }

    let topUpPayment = null;
    if (nextStatus === "SWITCH_TOP_UP_REQUIRED") {
      const topUpResult = await createSwitchTopUpPayment(cancellation, reviewerId);
      topUpPayment = topUpResult.payment;
      adjustmentReference = topUpResult.payment.reference;
      adjustmentStatus = "TOP_UP_PENDING_PAYMENT";
      adjustmentNote =
        decisionNote ||
        `Automatic top-up checkout created for ${topUpResult.payment.amount} ${topUpResult.payment.currency}.`;
    }

    if (decision === "SWITCH_APPROVED" && nextStatus === "SWITCH_APPROVED") {
      try {
        await enrollUser(cancellation.userId, cancellation.requestedTargetCourseId);
      } catch (error) {
        if (error?.code !== "P2002") {
          throw error;
        }
      }
    }

    await prisma.enrollmentCancellation.update({
      where: { id: cancellation.id },
      data: {
        refundReviewStatus: nextStatus,
        refundDecisionNote: adjustmentNote,
        topUpPaymentId: topUpPayment?.id || cancellation.topUpPaymentId || null,
        providerAdjustmentReference: adjustmentReference,
        providerAdjustmentStatus: adjustmentStatus,
        providerAdjustmentProcessedAt:
          adjustmentStatus && adjustmentStatus !== "TOP_UP_PENDING_PAYMENT"
            ? new Date()
            : null,
        reviewedByUserId: reviewerId,
        reviewedAt: new Date(),
      },
    });

    req.session.flash = {
      type: "success",
      message:
        decision === "APPROVED"
          ? adjustmentStatus === "NO_PROVIDER_REFUND"
            ? "Refund request approved. No provider-side refund action was needed."
            : "Refund request approved and the automatic refund has been submitted."
          : nextStatus === "SWITCH_TOP_UP_REQUIRED"
            ? `Program switch reviewed. The automatic top-up checkout for ${switchFinancialSummary?.balanceAmount || 0} ${switchFinancialSummary?.currency || ""} is now ready for the student to complete before enrollment into the new course can be completed.`
            : decision === "SWITCH_APPROVED"
              ? switchFinancialSummary?.direction === SWITCH_FINANCIAL_DIRECTION.CREDIT_DUE
                ? `Program switch approved, the student has been enrolled in the requested course, and the automatic refund for ${switchFinancialSummary.balanceAmount} ${switchFinancialSummary.currency} has been submitted.`
                : "Program switch approved and the student has been enrolled in the requested course."
            : "Refund or switch request declined.",
    };
    return res.redirect(req.get("referer") || "/dashboard");
  } catch (err) {
    return next(err);
  }
};
