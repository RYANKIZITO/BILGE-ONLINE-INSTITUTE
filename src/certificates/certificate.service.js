import { prisma } from '../../config/prisma.js';
import {
  generateVerificationCode,
  generateCertificatePDF
} from '../../utils/certificate.js';

export const issueCertificate = async (user, course) => {
  return prisma.$transaction(async (tx) => {
    // 🔒 1️⃣ HARD LOCK: certificate must be unique per user+course
    const existing = await tx.certificate.findUnique({
      where: {
        userId_courseId: {
          userId: user.id,
          courseId: course.id
        }
      }
    });

    if (existing) return existing; // ❌ NO REISSUE

    // 🔒 2️⃣ Ensure course is marked completed
    const enrollment = await tx.enrollment.findFirst({
      where: {
        userId: user.id,
        courseId: course.id,
        completed: true
      }
    });

    if (!enrollment) {
      throw new Error('Course not completed. Certificate locked.');
    }

    // 3️⃣ Generate verification code
    const verificationCode = generateVerificationCode();

    // 4️⃣ Generate PDF (ONCE)
    await generateCertificatePDF({
      name: user.name,
      course: course.title,
      code: verificationCode
    });

    // 🔒 5️⃣ Persist certificate permanently
    return tx.certificate.create({
      data: {
        userId: user.id,
        courseId: course.id,
        verificationCode
      }
    });
  });
};
