import { prisma } from "../../config/prisma.js";
import {
  GOOGLE_MEET_VERIFICATION_VALUES,
  isGoogleMeetAutomationAvailable,
  persistLiveSessionVerification,
  provisionGoogleMeetSession,
  syncGoogleMeetVerificationForSession,
  syncGoogleMeetVerificationsForSessions,
} from "./google-meet.service.js";

const ACTIVE_STATE = {
  ACTIVE: "Active",
  AT_RISK: "At-Risk",
  INACTIVE: "Inactive",
};

const LIVE_SESSION_ALERT_MINUTES = 15;
const LIVE_SESSION_ALERT_MAX_MINUTES = 30;
const LIVE_SESSION_NEXT_DAY_LOOKAHEAD_HOURS = 48;
const QUESTION_SLA_HOURS = 48;
const MEANINGFUL_CONTRIBUTION_MIN_LENGTH = 20;

const SESSION_TYPE_LABELS = {
  MID_WEEK: "Mid-week",
  END_WEEK: "End-week",
};

const LIVE_SESSION_VERIFICATION_LABELS = {
  MANUAL_ONLY: "Manual verification only",
  PENDING: "Ready for future automatic verification",
  VERIFIED: "Verified by Google Meet",
  UNVERIFIED: "Not automatically verified",
};

const REPORTING_PERIODS = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
};

const REPORTING_PERIOD_CONFIG = {
  [REPORTING_PERIODS.DAILY]: {
    label: "Daily",
    engagementTargetMin: 1,
    engagementMultiplier: 0.5,
    overdueSerious: 1,
    overdueSlipping: 1,
    performanceAtRisk: 70,
    performanceInactive: 40,
    enforceEngagementSignals: false,
  },
  [REPORTING_PERIODS.WEEKLY]: {
    label: "Weekly",
    engagementTargetMin: 2,
    engagementMultiplier: 1,
    overdueSerious: 2,
    overdueSlipping: 1,
    performanceAtRisk: 72,
    performanceInactive: 42,
    enforceEngagementSignals: true,
  },
  [REPORTING_PERIODS.MONTHLY]: {
    label: "Monthly",
    engagementTargetMin: 4,
    engagementMultiplier: 2,
    overdueSerious: 4,
    overdueSlipping: 1,
    performanceAtRisk: 75,
    performanceInactive: 45,
    enforceEngagementSignals: true,
  },
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const roundTo = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const getStartOfDay = (date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const getEndOfDay = (date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const getStartOfWeek = (date) => {
  const next = new Date(date);
  const day = next.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + offset);
  return next;
};

const enumerateWeekBuckets = (windowStart, windowEnd) => {
  const buckets = [];
  let cursor = getStartOfWeek(windowStart);

  while (cursor <= windowEnd) {
    const bucketStart = new Date(cursor);
    const bucketEnd = new Date(cursor);
    bucketEnd.setDate(bucketEnd.getDate() + 6);
    bucketEnd.setHours(23, 59, 59, 999);

    if (bucketEnd >= windowStart && bucketStart <= windowEnd) {
      buckets.push({
        key: bucketStart.toISOString().slice(0, 10),
        start: bucketStart,
        end: bucketEnd,
      });
    }

    cursor = addDays(cursor, 7);
  }

  return buckets;
};

const getReportingWindow = (period = REPORTING_PERIODS.MONTHLY, date = new Date()) => {
  if (period === REPORTING_PERIODS.DAILY) {
    return {
      start: getStartOfDay(date),
      end: getEndOfDay(date),
    };
  }

  if (period === REPORTING_PERIODS.WEEKLY) {
    const start = getStartOfWeek(date);
    const end = addDays(start, 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  return {
    start: new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0),
    end: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999),
  };
};

const getCourseActivationDate = (course) =>
  course?.publishedAt ? new Date(course.publishedAt) : new Date(course?.createdAt || 0);

const diffHours = (start, end) => {
  if (!start || !end) return null;
  return (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60);
};

const diffMinutes = (start, end) => {
  if (!start || !end) return null;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60));
};

const getWeekKey = (date) => getStartOfWeek(new Date(date)).toISOString().slice(0, 10);

const isMeaningfulContribution = (content) =>
  String(content || "").trim().length >= MEANINGFUL_CONTRIBUTION_MIN_LENGTH;

const getSessionDurationMinutes = (session) => {
  if (Number.isFinite(session?.durationMinutes) && session.durationMinutes >= 0) {
    return session.durationMinutes;
  }

  return diffMinutes(session?.actualStartTime, session?.endedAt);
};

const isHostedSession = (session) => {
  if (session?.meetingProvider === GOOGLE_MEET_VERIFICATION_VALUES.PROVIDER) {
    return session?.verificationStatus === "VERIFIED";
  }

  const durationMinutes = getSessionDurationMinutes(session);
  return (
    session?.status === "HOSTED" ||
    session?.hostConfirmed === true ||
    Boolean(session?.actualStartTime && durationMinutes !== null && durationMinutes >= 1)
  );
};

const buildAlertPayload = (session, now) => {
  const minutesRemaining = Math.max(
    0,
    Math.round(
      (new Date(session.scheduledStartTime).getTime() - now.getTime()) / (1000 * 60)
    )
  );

  return {
    id: session.id,
    courseId: session.course.id,
    courseTitle: session.course.title,
    courseSlug: session.course.slug || null,
    instructor: session.course.instructor?.name || "Instructor",
    sessionType: session.sessionType,
    sessionTypeLabel: SESSION_TYPE_LABELS[session.sessionType] || session.sessionType,
    startTime: session.scheduledStartTime,
    minutesRemaining,
    meetingUrl: session.meetingUrl || null,
  };
};

const buildNextDayAlertPayload = (session, now) => ({
  ...buildAlertPayload(session, now),
  hoursRemaining: roundTo(
    (new Date(session.scheduledStartTime).getTime() - now.getTime()) / (1000 * 60 * 60)
  ),
});

const buildAdminAlertPayload = (session, now) => ({
  ...buildNextDayAlertPayload(session, now),
  instructorEmail: session.course.instructor?.email || "",
  verificationStatus: session.verificationStatus || "MANUAL_ONLY",
  verificationLabel:
    LIVE_SESSION_VERIFICATION_LABELS[session.verificationStatus] ||
    LIVE_SESSION_VERIFICATION_LABELS.MANUAL_ONLY,
  canJoin: Boolean(session.meetingUrl),
});

const getNextDayAlertWindow = (asOf = new Date()) => ({
  minTime: new Date(asOf),
  maxTime: new Date(asOf.getTime() + LIVE_SESSION_NEXT_DAY_LOOKAHEAD_HOURS * 60 * 60 * 1000),
});

const decorateLiveSession = (session) => ({
  ...session,
  sessionTypeLabel: SESSION_TYPE_LABELS[session.sessionType] || session.sessionType,
  verificationLabel:
    LIVE_SESSION_VERIFICATION_LABELS[session.verificationStatus] || session.verificationStatus,
  canJoin: Boolean(session.meetingUrl && session.status !== "CANCELLED"),
});

const buildSnapshot = ({
  instructor,
  trackedCourses,
  reportedCourses,
  liveSessions,
  courseQuestions,
  discussionContributions,
  asOf,
  period,
  window,
}) => {
  const periodConfig =
    REPORTING_PERIOD_CONFIG[period] || REPORTING_PERIOD_CONFIG[REPORTING_PERIODS.MONTHLY];

  let expectedSessions = 0;
  let hostedSessions = 0;

  if (period === REPORTING_PERIODS.DAILY) {
    expectedSessions = liveSessions.length;
    hostedSessions = liveSessions.filter((session) => isHostedSession(session)).length;
  } else {
    const weekBuckets = enumerateWeekBuckets(window.start, window.end);
    const expectedSlots = [];

    trackedCourses.forEach((course) => {
      const activationDate = getCourseActivationDate(course);

      weekBuckets.forEach((bucket) => {
        if (activationDate > bucket.end) return;

        expectedSlots.push(`${course.id}:${bucket.key}:MID_WEEK`);
        expectedSlots.push(`${course.id}:${bucket.key}:END_WEEK`);
      });
    });

    const hostedSlotKeys = new Set(
      liveSessions
        .filter((session) => isHostedSession(session))
        .map(
          (session) =>
            `${session.courseId}:${getWeekKey(session.scheduledStartTime)}:${session.sessionType}`
        )
    );

    expectedSessions = expectedSlots.length;
    hostedSessions = expectedSlots.filter((slotKey) => hostedSlotKeys.has(slotKey)).length;
  }

  const attendanceRate =
    expectedSessions > 0 ? roundTo((hostedSessions / expectedSessions) * 100) : 100;

  const responseDurations = courseQuestions
    .filter((question) => question.responderId === instructor.id)
    .map((question) => {
      const responseMoment = question.resolvedAt || question.answeredAt;
      return diffHours(question.createdAt, responseMoment);
    })
    .filter((value) => value !== null && value >= 0);

  const averageResponseHours =
    responseDurations.length > 0
      ? roundTo(
          responseDurations.reduce((sum, value) => sum + value, 0) /
            responseDurations.length
        )
      : null;

  const pendingQuestionsOverSla = courseQuestions.filter((question) => {
    if (question.status !== "PENDING") return false;
    const ageHours = diffHours(question.createdAt, asOf);
    return ageHours !== null && ageHours > QUESTION_SLA_HOURS;
  }).length;

  const engagementVolume = discussionContributions.filter((contribution) =>
    isMeaningfulContribution(contribution.content)
  ).length;
  const verificationSummary = liveSessions.reduce(
    (summary, session) => {
      const statusKey = session.verificationStatus || "MANUAL_ONLY";
      summary[statusKey] = (summary[statusKey] || 0) + 1;
      return summary;
    },
    {
      MANUAL_ONLY: 0,
      PENDING: 0,
      VERIFIED: 0,
      UNVERIFIED: 0,
    }
  );

  const engagementTarget = Math.max(
    periodConfig.engagementTargetMin,
    Math.ceil(trackedCourses.length * periodConfig.engagementMultiplier)
  );
  const attendanceScore = expectedSessions > 0 ? attendanceRate : 100;
  const responseScore =
    courseQuestions.length === 0
      ? 100
      : clamp(
          (averageResponseHours === null
            ? 100
            : (QUESTION_SLA_HOURS / Math.max(averageResponseHours, 1)) * 100) -
            pendingQuestionsOverSla * 18,
          0,
          100
        );
  const engagementScore =
    trackedCourses.length === 0
      ? 0
      : clamp((engagementVolume / engagementTarget) * 100, 0, 100);
  const performanceScore = roundTo(
    attendanceScore * 0.45 + responseScore * 0.35 + engagementScore * 0.2
  );

  let activeState = ACTIVE_STATE.ACTIVE;

  const seriousFailures = [
    expectedSessions > 0 && attendanceRate < 50,
    averageResponseHours !== null && averageResponseHours > QUESTION_SLA_HOURS * 2,
    pendingQuestionsOverSla >= periodConfig.overdueSerious,
    periodConfig.enforceEngagementSignals &&
      trackedCourses.length > 0 &&
      engagementVolume === 0,
  ].filter(Boolean).length;

  const slippingSignals = [
    expectedSessions > 0 && attendanceRate < 80,
    averageResponseHours !== null && averageResponseHours > QUESTION_SLA_HOURS,
    pendingQuestionsOverSla >= periodConfig.overdueSlipping,
    periodConfig.enforceEngagementSignals &&
      trackedCourses.length > 0 &&
      engagementVolume < engagementTarget,
  ].filter(Boolean).length;

  if (trackedCourses.length === 0) {
    activeState = ACTIVE_STATE.INACTIVE;
  } else if (seriousFailures >= 2 || performanceScore < periodConfig.performanceInactive) {
    activeState = ACTIVE_STATE.INACTIVE;
  } else if (
    seriousFailures >= 1 ||
    slippingSignals >= 1 ||
    performanceScore < periodConfig.performanceAtRisk
  ) {
    activeState = ACTIVE_STATE.AT_RISK;
  }

  return {
    instructorId: instructor.id,
    instructorName: instructor.name,
    instructorEmail: instructor.email,
    courses: reportedCourses.map((course) => ({
      id: course.id,
      title: course.title,
      published: course.published,
    })),
    activeState,
    attendanceRate,
    averageResponseHours,
    pendingQuestionsOverSla,
    engagementVolume,
    performanceScore,
    hostedSessions,
    expectedSessions,
    trackedCourseCount: trackedCourses.length,
    reportingPeriod: period,
    reportingPeriodLabel: periodConfig.label,
    windowStart: window.start,
    windowEnd: window.end,
    verificationSummary,
  };
};

export const listInstructorEngagementSnapshots = async ({
  asOf = new Date(),
  period = REPORTING_PERIODS.MONTHLY,
} = {}) => {
  const safePeriod =
    REPORTING_PERIOD_CONFIG[period] ? period : REPORTING_PERIODS.MONTHLY;
  const window = getReportingWindow(safePeriod, asOf);

  const instructors = await prisma.user.findMany({
    where: { role: "INSTRUCTOR" },
    orderBy: [{ name: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      email: true,
      courses: {
        orderBy: { title: "asc" },
        select: {
          id: true,
          title: true,
          published: true,
          publishedAt: true,
          createdAt: true,
        },
      },
    },
  });

  const allCourseIds = Array.from(
    new Set(instructors.flatMap((instructor) => instructor.courses.map((course) => course.id)))
  );

  let liveSessions = [];
  let courseQuestions = [];
  let discussionContributions = [];

  if (allCourseIds.length > 0) {
    [liveSessions, courseQuestions, discussionContributions] = await Promise.all([
      prisma.liveSession.findMany({
        where: {
          courseId: { in: allCourseIds },
          scheduledStartTime: {
            gte: window.start,
            lte: window.end,
          },
        },
        select: {
          id: true,
          courseId: true,
          instructorId: true,
          sessionType: true,
          status: true,
          scheduledStartTime: true,
          actualStartTime: true,
          endedAt: true,
          durationMinutes: true,
          hostConfirmed: true,
          meetingProvider: true,
          googleMeetSpaceName: true,
          googleMeetOrganizerEmail: true,
          verificationStatus: true,
          verificationCheckedAt: true,
          providerVerifiedAt: true,
          providerConferenceName: true,
          providerParticipantCount: true,
          providerEvidence: true,
        },
      }),
      prisma.courseQuestion.findMany({
        where: {
          courseId: { in: allCourseIds },
          createdAt: {
            lte: window.end,
          },
          OR: [
            {
              createdAt: {
                gte: window.start,
              },
            },
            {
              answeredAt: {
                gte: window.start,
              },
            },
            {
              resolvedAt: {
                gte: window.start,
              },
            },
            {
              status: "PENDING",
            },
          ],
        },
        select: {
          id: true,
          courseId: true,
          responderId: true,
          status: true,
          createdAt: true,
          answeredAt: true,
          resolvedAt: true,
        },
      }),
      prisma.discussionContribution.findMany({
        where: {
          courseId: { in: allCourseIds },
          createdAt: {
            gte: window.start,
            lte: window.end,
          },
        },
        select: {
          id: true,
          courseId: true,
          authorId: true,
          type: true,
          content: true,
          createdAt: true,
        },
      }),
    ]);

    liveSessions = await syncGoogleMeetVerificationsForSessions(liveSessions, { asOf });
    await Promise.all(
      liveSessions.map((session) => persistLiveSessionVerification(prisma, session))
    );
  }

  return instructors.map((instructor) => {
    const trackedCourses = instructor.courses.filter((course) => course.published);
    const reportedCourses = trackedCourses.length > 0 ? trackedCourses : instructor.courses;
    const trackedCourseIds = new Set(trackedCourses.map((course) => course.id));

    return buildSnapshot({
      instructor,
      trackedCourses,
      reportedCourses,
      liveSessions: liveSessions.filter((session) => trackedCourseIds.has(session.courseId)),
      courseQuestions: courseQuestions.filter((question) =>
        trackedCourseIds.has(question.courseId)
      ),
      discussionContributions: discussionContributions.filter(
        (contribution) =>
          trackedCourseIds.has(contribution.courseId) &&
          contribution.authorId === instructor.id
      ),
      asOf,
      period: safePeriod,
      window,
    });
  });
};

export const getInstructorEngagementSnapshot = async (
  instructorId,
  { asOf = new Date(), period = REPORTING_PERIODS.MONTHLY } = {}
) => {
  const safePeriod =
    REPORTING_PERIOD_CONFIG[period] ? period : REPORTING_PERIODS.MONTHLY;
  const snapshots = await listInstructorEngagementSnapshots({ asOf, period: safePeriod });
  return (
    snapshots.find((snapshot) => snapshot.instructorId === instructorId) || {
      instructorId,
      instructorName: "Instructor",
      instructorEmail: "",
      courses: [],
      activeState: ACTIVE_STATE.INACTIVE,
      attendanceRate: 0,
      averageResponseHours: null,
      pendingQuestionsOverSla: 0,
      engagementVolume: 0,
      performanceScore: 0,
      hostedSessions: 0,
      expectedSessions: 0,
      trackedCourseCount: 0,
      reportingPeriod: safePeriod,
      reportingPeriodLabel: REPORTING_PERIOD_CONFIG[safePeriod].label,
      windowStart: getReportingWindow(safePeriod, asOf).start,
      windowEnd: getReportingWindow(safePeriod, asOf).end,
      verificationSummary: {
        MANUAL_ONLY: 0,
        PENDING: 0,
        VERIFIED: 0,
        UNVERIFIED: 0,
      },
    }
  );
};

export const getUpcomingLiveSessionAlertsForInstructor = async (
  instructorId,
  { asOf = new Date() } = {}
) => {
  const minTime = new Date(asOf.getTime() + LIVE_SESSION_ALERT_MINUTES * 60 * 1000);
  const maxTime = new Date(asOf.getTime() + LIVE_SESSION_ALERT_MAX_MINUTES * 60 * 1000);

  const sessions = await prisma.liveSession.findMany({
    where: {
      instructorId,
      status: "SCHEDULED",
      scheduledStartTime: {
        gte: minTime,
        lte: maxTime,
      },
    },
    orderBy: { scheduledStartTime: "asc" },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          instructor: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  return sessions.map((session) => buildAlertPayload(session, asOf));
};

export const getUpcomingLiveSessionAlertsForStudent = async (
  studentId,
  { asOf = new Date() } = {}
) => {
  const minTime = new Date(asOf.getTime() + LIVE_SESSION_ALERT_MINUTES * 60 * 1000);
  const maxTime = new Date(asOf.getTime() + LIVE_SESSION_ALERT_MAX_MINUTES * 60 * 1000);

  const sessions = await prisma.liveSession.findMany({
    where: {
      status: "SCHEDULED",
      scheduledStartTime: {
        gte: minTime,
        lte: maxTime,
      },
      course: {
        enrollments: {
          some: {
            userId: studentId,
          },
        },
      },
    },
    orderBy: { scheduledStartTime: "asc" },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          instructor: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  return sessions.map((session) => buildAlertPayload(session, asOf));
};

export const getNextDayLiveSessionAlertsForInstructor = async (
  instructorId,
  { asOf = new Date() } = {}
) => {
  const { minTime, maxTime } = getNextDayAlertWindow(asOf);

  const sessions = await prisma.liveSession.findMany({
    where: {
      instructorId,
      status: "SCHEDULED",
      scheduledStartTime: {
        gte: minTime,
        lte: maxTime,
      },
    },
    orderBy: { scheduledStartTime: "asc" },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          instructor: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  return sessions.map((session) => buildNextDayAlertPayload(session, asOf));
};

export const getNextDayLiveSessionAlertsForStudent = async (
  studentId,
  { asOf = new Date() } = {}
) => {
  const { minTime, maxTime } = getNextDayAlertWindow(asOf);

  const sessions = await prisma.liveSession.findMany({
    where: {
      status: "SCHEDULED",
      scheduledStartTime: {
        gte: minTime,
        lte: maxTime,
      },
      course: {
        enrollments: {
          some: {
            userId: studentId,
          },
        },
      },
    },
    orderBy: { scheduledStartTime: "asc" },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          instructor: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  return sessions.map((session) => buildNextDayAlertPayload(session, asOf));
};

export const getNextDayLiveSessionAlertsForAdmin = async ({ asOf = new Date() } = {}) => {
  const { minTime, maxTime } = getNextDayAlertWindow(asOf);

  const sessions = await prisma.liveSession.findMany({
    where: {
      status: "SCHEDULED",
      scheduledStartTime: {
        gte: minTime,
        lte: maxTime,
      },
    },
    orderBy: [{ scheduledStartTime: "asc" }, { createdAt: "desc" }],
    take: 30,
    include: {
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
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

  return sessions.map((session) => buildAdminAlertPayload(session, asOf));
};

export const getStudentCourseEngagementData = async (courseId, studentId) => {
  const [myQuestions, discussionPosts, liveSessions] = await Promise.all([
    prisma.courseQuestion.findMany({
      where: {
        courseId,
        authorId: studentId,
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        responder: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.discussionContribution.findMany({
      where: {
        courseId,
        parentId: null,
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        },
      },
    }),
    prisma.liveSession.findMany({
      where: {
        courseId,
        scheduledStartTime: {
          gte: new Date(),
        },
        status: {
          in: ["SCHEDULED", "HOSTED"],
        },
      },
      orderBy: { scheduledStartTime: "asc" },
      take: 5,
    }),
  ]);

  return {
    myQuestions,
    discussionPosts,
    upcomingSessions: liveSessions.map((session) => decorateLiveSession(session)),
  };
};

export const getInstructorCourseEngagementData = async (courseId) => {
  const [liveSessions, courseQuestions, discussionPosts] = await Promise.all([
    prisma.liveSession.findMany({
      where: { courseId },
      orderBy: [{ scheduledStartTime: "desc" }, { createdAt: "desc" }],
      take: 12,
      include: {
        instructor: {
          select: {
            id: true,
            name: true,
            fullName: true,
            email: true,
            googleId: true,
          },
        },
      },
    }),
    prisma.courseQuestion.findMany({
      where: { courseId },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        responder: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.discussionContribution.findMany({
      where: {
        courseId,
        parentId: null,
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const syncedLiveSessions = await syncGoogleMeetVerificationsForSessions(liveSessions);
  await Promise.all(
    syncedLiveSessions.map((session) => persistLiveSessionVerification(prisma, session))
  );

  return {
    liveSessions: syncedLiveSessions.map((session) => decorateLiveSession(session)),
    courseQuestions,
    discussionPosts,
    googleMeetAutomationAvailable: isGoogleMeetAutomationAvailable(),
  };
};

export const createLiveSessionForInstructor = async ({
  courseId,
  instructorId,
  sessionType,
  scheduledStartTime,
  meetingUrl,
}) => {
  const course = await prisma.course.findFirst({
    where: { id: courseId, instructorId },
    select: {
      id: true,
      title: true,
      instructor: {
        select: {
          id: true,
          name: true,
          fullName: true,
          email: true,
          googleId: true,
        },
      },
    },
  });

  if (!course) {
    throw new Error("Course not found");
  }

  const normalizedScheduledStartTime = String(scheduledStartTime || "").trim();
  const scheduledAt = new Date(normalizedScheduledStartTime);

  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error("Invalid scheduled start time");
  }

  const normalizedMeetingUrl = String(meetingUrl || "").trim();
  let meetingProvision = {
    meetingProvider: normalizedMeetingUrl ? GOOGLE_MEET_VERIFICATION_VALUES.PROVIDER : null,
    meetingUrl: normalizedMeetingUrl || null,
    meetingCode: null,
    googleMeetSpaceName: null,
    googleMeetOrganizerEmail: null,
    verificationStatus: "MANUAL_ONLY",
  };

  if (isGoogleMeetAutomationAvailable()) {
    try {
      meetingProvision = await provisionGoogleMeetSession({
        instructor: course.instructor,
      });
    } catch (error) {
      if (normalizedMeetingUrl) {
        meetingProvision = {
          meetingProvider: GOOGLE_MEET_VERIFICATION_VALUES.PROVIDER,
          meetingUrl: normalizedMeetingUrl,
          meetingCode: null,
          googleMeetSpaceName: null,
          googleMeetOrganizerEmail: null,
          verificationStatus: "MANUAL_ONLY",
        };
      } else {
        throw new Error(
          "Automatic Google Meet setup is not available right now. Paste an existing Meet link or continue with manual verification."
        );
      }
    }
  }

  return prisma.liveSession.create({
    data: {
      courseId,
      instructorId,
      sessionType,
      scheduledStartTime: scheduledAt,
      meetingProvider: meetingProvision.meetingProvider,
      meetingUrl: meetingProvision.meetingUrl,
      meetingCode: meetingProvision.meetingCode,
      googleMeetSpaceName: meetingProvision.googleMeetSpaceName,
      googleMeetOrganizerEmail: meetingProvision.googleMeetOrganizerEmail,
      verificationStatus: meetingProvision.verificationStatus,
    },
  });
};

export const updateLiveSessionForInstructor = async ({
  sessionId,
  instructorId,
  status,
  actualStartTime,
  endedAt,
  durationMinutes,
}) => {
  const existing = await prisma.liveSession.findFirst({
    where: {
      id: sessionId,
      instructorId,
    },
    include: {
      instructor: {
        select: {
          id: true,
          name: true,
          fullName: true,
          email: true,
          googleId: true,
        },
      },
    },
  });

  if (!existing) {
    throw new Error("Live session not found");
  }

  const parsedActualStart = actualStartTime ? new Date(actualStartTime) : null;
  const parsedEndedAt = endedAt ? new Date(endedAt) : null;
  const numericDuration = durationMinutes ? Number(durationMinutes) : null;

  const effectiveActualStart =
    parsedActualStart && !Number.isNaN(parsedActualStart.getTime())
      ? parsedActualStart
      : status === "HOSTED"
        ? existing.actualStartTime || existing.scheduledStartTime
        : null;

  const effectiveEndedAt =
    parsedEndedAt && !Number.isNaN(parsedEndedAt.getTime()) ? parsedEndedAt : null;

  const effectiveDuration =
    Number.isFinite(numericDuration) && numericDuration >= 0
      ? Math.round(numericDuration)
      : diffMinutes(effectiveActualStart, effectiveEndedAt);

  const updatedSession = await prisma.liveSession.update({
    where: { id: existing.id },
    data: {
      status,
      actualStartTime: status === "HOSTED" ? effectiveActualStart : null,
      endedAt: status === "HOSTED" ? effectiveEndedAt : null,
      durationMinutes: status === "HOSTED" ? effectiveDuration : null,
      hostConfirmed: status === "HOSTED",
    },
  });

  const syncedSession = await syncGoogleMeetVerificationForSession(
    {
      ...existing,
      ...updatedSession,
      instructor: existing.instructor,
    },
    { asOf: new Date() }
  );

  await persistLiveSessionVerification(prisma, syncedSession);

  return {
    ...updatedSession,
    ...syncedSession,
  };
};

export const createCourseQuestionForStudent = async ({
  courseSlug,
  studentId,
  title,
  content,
}) => {
  const course = await prisma.course.findFirst({
    where: {
      slug: courseSlug,
      enrollments: {
        some: {
          userId: studentId,
        },
      },
    },
    select: {
      id: true,
      slug: true,
    },
  });

  if (!course) {
    throw new Error("Course not found");
  }

  const normalizedContent = String(content || "").trim();
  if (!normalizedContent) {
    throw new Error("Question content is required");
  }

  return prisma.courseQuestion.create({
    data: {
      courseId: course.id,
      authorId: studentId,
      title: String(title || "").trim() || null,
      content: normalizedContent,
    },
  });
};

export const respondToCourseQuestion = async ({
  questionId,
  instructorId,
  answerContent,
  resolveNow,
}) => {
  const question = await prisma.courseQuestion.findFirst({
    where: {
      id: questionId,
      course: {
        instructorId,
      },
    },
    include: {
      course: {
        select: {
          id: true,
          slug: true,
        },
      },
    },
  });

  if (!question) {
    throw new Error("Question not found");
  }

  const normalizedAnswer = String(answerContent || "").trim();
  if (!normalizedAnswer) {
    throw new Error("Answer content is required");
  }

  const now = new Date();

  const updatedQuestion = await prisma.courseQuestion.update({
    where: { id: question.id },
    data: {
      responderId: instructorId,
      answerContent: normalizedAnswer,
      answeredAt: question.answeredAt || now,
      resolvedAt: resolveNow ? now : question.resolvedAt,
      status: resolveNow ? "RESOLVED" : "ANSWERED",
    },
  });

  return {
    question: updatedQuestion,
    courseId: question.course.id,
    courseSlug: question.course.slug,
  };
};

export const createDiscussionContribution = async ({
  courseSlug,
  authorId,
  parentId,
  content,
}) => {
  const course = await prisma.course.findFirst({
    where: {
      slug: courseSlug,
      OR: [
        {
          instructorId: authorId,
        },
        {
          enrollments: {
            some: {
              userId: authorId,
            },
          },
        },
      ],
    },
    select: {
      id: true,
      slug: true,
    },
  });

  if (!course) {
    throw new Error("Course not found");
  }

  const normalizedContent = String(content || "").trim();
  if (!normalizedContent) {
    throw new Error("Discussion content is required");
  }

  let safeParentId = null;

  if (parentId) {
    const parent = await prisma.discussionContribution.findFirst({
      where: {
        id: parentId,
        courseId: course.id,
      },
      select: {
        id: true,
      },
    });

    if (!parent) {
      throw new Error("Discussion thread not found");
    }

    safeParentId = parent.id;
  }

  const contribution = await prisma.discussionContribution.create({
    data: {
      courseId: course.id,
      authorId,
      parentId: safeParentId,
      type: safeParentId ? "COMMENT" : "POST",
      content: normalizedContent,
    },
  });

  return {
    contribution,
    courseId: course.id,
    courseSlug: course.slug,
  };
};

export const ACTIVE_STATE_VALUES = ACTIVE_STATE;
export const ENGAGEMENT_REPORTING_PERIOD_OPTIONS = Object.values(REPORTING_PERIODS).map(
  (value) => ({
    value,
    label: REPORTING_PERIOD_CONFIG[value].label,
  })
);
export const SESSION_TYPE_OPTIONS = Object.keys(SESSION_TYPE_LABELS).map((key) => ({
  value: key,
  label: SESSION_TYPE_LABELS[key],
}));
export const LIVE_SESSION_VERIFICATION_STATUS_LABELS = LIVE_SESSION_VERIFICATION_LABELS;
