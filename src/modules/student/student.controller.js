import { prisma } from "../../config/prisma.js";

export const studentDashboard = async (req, res, next) => {
  try {
    const userId = req.session.user.id;

    const enrollments = await prisma.enrollment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        course: {
          select: { title: true, slug: true },
        },
      },
    });

    return res.render("student/dashboard", {
      courses: enrollments,
    });
  } catch (err) {
    return next(err);
  }
};
