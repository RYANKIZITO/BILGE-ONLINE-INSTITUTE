// src/modules/courses/course.service.js
import { prisma } from '../../config/prisma.js';
import { notify } from '../../../services/notificationService.js';

const queueNotification = (payload) => {
  notify(payload).catch((error) => {
    console.error('[notifications] Failed to queue course notification.', error);
  });
};

export const enrollUser = async (userId, courseId) => {
  const enrollment = await prisma.enrollment.create({
    data: {
      userId,
      courseId
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          fullName: true,
          email: true,
          phoneNumber: true,
          countryCode: true
        }
      },
      course: {
        select: {
          id: true,
          title: true
        }
      }
    }
  });

  if (enrollment.user) {
    queueNotification({
      type: 'COURSE_ENROLLED',
      user: enrollment.user,
      data: {
        enrollmentId: enrollment.id,
        courseId: enrollment.courseId,
        courseTitle: enrollment.course?.title || 'your programme'
      }
    });
  }

  return enrollment;
};
