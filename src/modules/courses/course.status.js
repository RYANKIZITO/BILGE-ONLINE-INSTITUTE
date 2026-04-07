import { prisma } from "../../config/prisma.js";

export const syncCourseStatusFromContent = async (courseId) => {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { status: true },
  });

  if (!course) return null;

  const [publishedLessonCount, publishedAssessmentCount] = await Promise.all([
    prisma.lesson.count({ where: { courseId, published: true } }),
    prisma.assessment.count({ where: { courseId, published: true } }),
  ]);

  const hasContent = publishedLessonCount > 0 || publishedAssessmentCount > 0;
  const newStatus = hasContent ? "READY" : "COMING_SOON";

  if (course.status !== newStatus) {
    await prisma.course.update({
      where: { id: courseId },
      data: { status: newStatus },
    });
  }

  return newStatus;
};

export const recomputeCourseStatus = async (courseId) =>
  syncCourseStatusFromContent(courseId);
