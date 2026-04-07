import { prisma } from "../../config/prisma.js";

export const SWITCH_TOP_UP_REVIEW_STATUS = "SWITCH_TOP_UP_REQUIRED";

const pendingSwitchTopUpInclude = {
  course: {
    select: {
      id: true,
      title: true,
      slug: true,
    },
  },
  requestedTargetCourse: {
    select: {
      id: true,
      title: true,
      slug: true,
    },
  },
  topUpPayment: {
    select: {
      id: true,
      amount: true,
      currency: true,
      provider: true,
      status: true,
      reference: true,
      metadata: true,
    },
  },
};

export const listPendingSwitchTopUpsForUser = async (userId) => {
  if (!userId) {
    return [];
  }

  return prisma.enrollmentCancellation.findMany({
    where: {
      userId,
      refundReviewStatus: SWITCH_TOP_UP_REVIEW_STATUS,
    },
    orderBy: { createdAt: "desc" },
    include: pendingSwitchTopUpInclude,
  });
};

export const findPendingSwitchTopUpForCourse = async (userId, courseId) => {
  if (!userId || !courseId) {
    return null;
  }

  return prisma.enrollmentCancellation.findFirst({
    where: {
      userId,
      requestedTargetCourseId: courseId,
      refundReviewStatus: SWITCH_TOP_UP_REVIEW_STATUS,
    },
    orderBy: { createdAt: "desc" },
    include: pendingSwitchTopUpInclude,
  });
};
