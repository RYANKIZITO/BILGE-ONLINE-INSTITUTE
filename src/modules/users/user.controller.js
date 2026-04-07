// src/modules/users/user.controller.js
import { prisma } from '../../config/prisma.js';

export const studentDashboard = async (req, res) => {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: req.session.user.id },
    include: { course: true }
  });

  res.render('student/dashboard', {
    title: 'Student Dashboard',
    user: req.session.user,
    courses: enrollments
  });
};
