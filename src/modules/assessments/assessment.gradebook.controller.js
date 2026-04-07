import { prisma } from "../../config/prisma.js";
import { computeFinalCourseMark } from "./assessment.grading.service.js";

const getEnrolledCourse = async (slug, studentId) => {
  return prisma.course.findFirst({
    where: {
      slug,
      published: true,
      enrollments: {
        some: {
          userId: studentId,
        },
      },
    },
    select: {
      id: true,
      slug: true,
      title: true,
    },
  });
};

export const showStudentCourseGradebook = async (req, res, next) => {
  try {
    const studentId = req.session.user.id;
    const { slug } = req.params;

    const course = await getEnrolledCourse(slug, studentId);

    if (!course) {
      req.session.flash = {
        type: "error",
        message: "Course not found or you are not enrolled.",
      };
      return res.redirect("/courses");
    }

    const assessments = await prisma.assessment.findMany({
      where: {
        courseId: course.id,
        published: true,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        type: true,
        maxScore: true,
        categoryWeight: true,
        createdAt: true,
      },
    });

    const submissions = await prisma.assessmentSubmission.findMany({
      where: {
        studentId,
        assessment: {
          courseId: course.id,
        },
      },
      select: {
        assessmentId: true,
        score: true,
        submittedAt: true,
      },
    });

    const submissionsByAssessmentId = Object.fromEntries(
      submissions.map((submission) => [submission.assessmentId, submission])
    );

    const gradeSummary = await computeFinalCourseMark(course.id, studentId);

    return res.render("student/gradebook/course", {
      user: req.session.user,
      course,
      assessments,
      submissionsByAssessmentId,
      gradeSummary,
      flash: req.session.flash || null,
    });
  } catch (err) {
    return next(err);
  } finally {
    req.session.flash = null;
  }
};