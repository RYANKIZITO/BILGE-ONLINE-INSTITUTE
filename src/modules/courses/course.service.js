// src/modules/courses/course.service.js
import { prisma } from '../../config/prisma.js';

export const enrollUser = async (userId, courseId) => {
  return prisma.enrollment.create({
    data: {
      userId,
      courseId
    }
  });
};
