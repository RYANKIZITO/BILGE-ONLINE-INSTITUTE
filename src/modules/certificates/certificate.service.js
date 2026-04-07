import crypto from "crypto";
import { prisma } from "../../config/prisma.js";
import { computeFinalCourseMark } from "../assessments/assessment.grading.service.js";
import { assignStudentCode } from "../../utils/student-code.js";
import { notify } from "../../../services/notificationService.js";

const MIN_CERTIFICATE_MARK = 50;

const buildVerificationCode = () =>
  `BILGE-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

const queueNotification = (payload) => {
  notify(payload).catch((error) => {
    console.error("[notifications] Failed to queue certificate notification.", error);
  });
};

export const getStudentCertificateNumber = async (userId, fallbackUser = null) => {
  let user = fallbackUser;

  if (!user) {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        studentCode: true,
        fullName: true,
        name: true,
      },
    });
  }

  if (!user) {
    throw new Error("Student record was not found for certificate generation.");
  }

  if (user.studentCode) {
    return user.studentCode;
  }

  const updatedUser = await assignStudentCode(user.id, user.fullName || user.name);
  return updatedUser.studentCode;
};

export const getEligibleEnrollmentBySlug = async (slug, userId) => {
  return prisma.enrollment.findFirst({
    where: {
      userId,
      completed: true,
      course: {
        slug,
        published: true,
      },
    },
    select: {
      id: true,
      userId: true,
      courseId: true,
      completed: true,
      course: {
        select: {
          id: true,
          slug: true,
          title: true,
          instructor: {
            select: {
              name: true,
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          fullName: true,
          email: true,
          studentCode: true,
          dateOfBirth: true,
          parentNames: true,
        },
      },
      updatedAt: true,
    },
  });
};

export const ensureCertificateForEnrollment = async (
  enrollment,
  fallbackUser = null
) => {
  const userId = enrollment?.userId || fallbackUser?.id || enrollment?.user?.id;
  const courseId = enrollment?.courseId || enrollment?.course?.id;

  if (!userId || !courseId) {
    throw new Error("Enrollment is missing the student or course required for certification.");
  }

  const gradeSummary = await computeFinalCourseMark(courseId, userId);

  if (!enrollment?.completed) {
    return {
      ok: false,
      reason: "not_completed",
      enrollment,
      gradeSummary,
      certificate: null,
    };
  }

  if ((gradeSummary?.finalCourseMark ?? 0) < MIN_CERTIFICATE_MARK) {
    return {
      ok: false,
      reason: "mark_too_low",
      enrollment,
      gradeSummary,
      certificate: null,
    };
  }

  let certificate = await prisma.certificate.findUnique({
    where: {
      userId_courseId: {
        userId,
        courseId,
      },
    },
  });

  const certificateNumber = await getStudentCertificateNumber(
    userId,
    fallbackUser || enrollment?.user || null
  );
  let certificateCreated = false;

  if (!certificate) {
    try {
      certificate = await prisma.certificate.create({
        data: {
          userId,
          courseId,
          verificationCode: buildVerificationCode(),
          certificateNumber,
        },
      });
      certificateCreated = true;
    } catch (err) {
      if (err?.code !== "P2002") {
        throw err;
      }

      certificate = await prisma.certificate.findUnique({
        where: {
          userId_courseId: {
            userId,
            courseId,
          },
        },
      });

      if (!certificate) {
        throw err;
      }
    }
  } else if (certificate.certificateNumber !== certificateNumber) {
    certificate = await prisma.certificate.update({
      where: { id: certificate.id },
      data: { certificateNumber },
    });
  }

  if (certificateCreated) {
    const notificationUser =
      (fallbackUser && fallbackUser.email
        ? fallbackUser
        : enrollment?.user?.email
          ? enrollment.user
          : await prisma.user.findUnique({
              where: { id: userId },
              select: {
                id: true,
                name: true,
                fullName: true,
                email: true,
                phoneNumber: true,
                countryCode: true,
              },
            })) || null;

    if (notificationUser) {
      queueNotification({
        type: "CERTIFICATE_READY",
        user: notificationUser,
        data: {
          certificateId: certificate.id,
          verificationCode: certificate.verificationCode,
          courseId,
          courseTitle: enrollment?.course?.title || "your programme",
        },
      });
    }
  }

  return {
    ok: true,
    enrollment,
    gradeSummary,
    certificate,
  };
};

export const ensureCertificateForCourseSlug = async (slug, userId) => {
  const enrollment = await getEligibleEnrollmentBySlug(slug, userId);

  if (!enrollment) {
    return {
      ok: false,
      reason: "not_completed",
    };
  }

  return ensureCertificateForEnrollment(enrollment, enrollment.user);
};
