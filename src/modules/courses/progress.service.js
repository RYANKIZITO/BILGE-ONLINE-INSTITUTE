import { issueCertificate } from '../certificates/certificate.service.js';
import { prisma } from '../../config/prisma.js';

export const checkCourseCompletion = async (userId, courseId) => {
  const totalLessons = await prisma.lesson.count({
    where: { courseId }
  });

  const completedLessons = await prisma.progress.count({
    where: {
      userId,
      completed: true,
      lesson: { courseId }
    }
  });

  if (totalLessons > 0 && totalLessons === completedLessons) {
    await prisma.enrollment.updateMany({
      where: { userId, courseId },
      data: { completed: true }
    });

    const [user, course] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.course.findUnique({ where: { id: courseId } })
    ]);

    await issueCertificate(user, course);
    return true;
  }

  return false;
};
