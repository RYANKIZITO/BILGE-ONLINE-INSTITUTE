import { prisma } from "../../config/prisma.js";
import { recomputeCourseStatus } from "../courses/course.status.js";
import { computeFinalCourseMark } from "../assessments/assessment.grading.service.js";
import {
  getInstructorCourseEngagementData,
  getInstructorEngagementSnapshot,
  SESSION_TYPE_OPTIONS,
} from "./instructor-engagement.service.js";
import {
  validateExternalLessonVideoUrl,
} from "../videos/video-processing.service.js";
import {
  deleteCloudflareStreamVideoByUrl,
  isCloudflareStreamVideoUrl,
  uploadLessonVideoToCloudflareStream,
} from "../videos/cloudflare-stream.service.js";

const getFlash = (req) => {
  const flash = req.session.flash || null;
  req.session.flash = null;
  return flash;
};

const getInstructorCourse = async (courseId, instructorId) =>
  prisma.course.findFirst({
    where: { id: courseId, instructorId },
    include: {
      lessons: {
        orderBy: { position: "asc" },
      },
    },
  });

const cleanupReplacedCloudflareLessonVideo = (rawUrl) => {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return;
  }

  deleteCloudflareStreamVideoByUrl(value).catch((error) => {
    console.error("Failed to delete replaced Cloudflare Stream lesson video", error);
  });
};

const buildScoreDistribution = (scores) => {
  const buckets = [
    { label: "0-39", min: 0, max: 39, count: 0 },
    { label: "40-59", min: 40, max: 59, count: 0 },
    { label: "60-79", min: 60, max: 79, count: 0 },
    { label: "80-100", min: 80, max: 100, count: 0 },
  ];

  scores.forEach((score) => {
    const rounded = Math.round(score);
    const bucket = buckets.find(
      (item) => rounded >= item.min && rounded <= item.max
    );

    if (bucket) {
      bucket.count += 1;
    }
  });

  return buckets;
};

const buildInstructorInsights = ({
  totalStudents,
  completionRate,
  averageCourseScore,
  hardestAssessments,
  lessonDropoff,
  strongestStudents,
  weakestStudents,
}) => {
  const insights = [];

  if (totalStudents === 0) {
    insights.push({
      level: "info",
      title: "No enrolled students yet",
      message:
        "This course has no enrolled students yet, so analytics and teaching insights will appear after students join and begin learning.",
      action: "Share and publish the course to start collecting learning data.",
    });

    return insights;
  }

  if (completionRate < 40) {
    insights.push({
      level: "warning",
      title: "Low course completion rate",
      message: `Only ${completionRate.toFixed(2)}% of enrolled students have completed this course.`,
      action:
        "Review lesson difficulty, add clearer explanations, and check the lessons where students stop progressing.",
    });
  } else if (completionRate >= 75) {
    insights.push({
      level: "success",
      title: "Strong completion rate",
      message: `${completionRate.toFixed(2)}% of enrolled students are completing the course successfully.`,
      action:
        "Maintain this structure and replicate the same teaching pattern in future courses.",
    });
  }

  if (averageCourseScore < 50) {
    insights.push({
      level: "warning",
      title: "Overall learner performance is weak",
      message: `Average course score is ${averageCourseScore.toFixed(2)}%, which suggests many students are struggling.`,
      action:
        "Revisit your hardest assessments and add revision guidance before those checkpoints.",
    });
  } else if (averageCourseScore >= 75) {
    insights.push({
      level: "success",
      title: "Overall learner performance is strong",
      message: `Average course score is ${averageCourseScore.toFixed(2)}%, showing strong understanding across the course.`,
      action: "Consider adding advanced challenge content for top performers.",
    });
  }

  if (hardestAssessments.length > 0) {
    const hardest = hardestAssessments[0];

    if (hardest.averagePercent < 50) {
      insights.push({
        level: "warning",
        title: "Assessment difficulty hotspot detected",
        message: `${hardest.title} is the hardest assessment with an average of ${hardest.averagePercent.toFixed(2)}%.`,
        action:
          "Review the wording, lesson preparation before it, and whether the assessment is harder than the teaching content.",
      });
    } else {
      insights.push({
        level: "info",
        title: "Most difficult assessment identified",
        message: `${hardest.title} currently has the lowest average among submitted assessments at ${hardest.averagePercent.toFixed(2)}%.`,
        action: "Monitor this assessment as more submissions come in.",
      });
    }
  }

  if (lessonDropoff.length > 0) {
    const hardestLesson = lessonDropoff[0];

    if (hardestLesson.completionPercent < 50) {
      insights.push({
        level: "warning",
        title: "Lesson drop-off detected",
        message: `Lesson ${hardestLesson.position}: ${hardestLesson.title} has the lowest completion rate at ${hardestLesson.completionPercent.toFixed(2)}%.`,
        action:
          "Consider simplifying this lesson, improving examples, or splitting it into smaller parts.",
      });
    } else {
      insights.push({
        level: "info",
        title: "Lowest lesson completion tracked",
        message: `Lesson ${hardestLesson.position}: ${hardestLesson.title} is currently the weakest progression point at ${hardestLesson.completionPercent.toFixed(2)}%.`,
        action: "Keep monitoring it as more student progress data arrives.",
      });
    }
  }

  if (strongestStudents.length > 0 && weakestStudents.length > 0) {
    const topStudent = strongestStudents[0];
    const lowStudent = weakestStudents[0];
    const gap =
      topStudent.summary.finalCourseMark - lowStudent.summary.finalCourseMark;

    if (gap >= 30) {
      insights.push({
        level: "info",
        title: "Wide performance gap across students",
        message: `There is a ${gap.toFixed(2)} point gap between the strongest and weakest current student performance.`,
        action:
          "Add revision prompts, guided recap lessons, or support material for lower-performing students.",
      });
    }
  }

  return insights;
};

const buildCourseDiagnostics = ({
  totalStudents,
  completionRate,
  averageCourseScore,
  hardestAssessments,
  lessonDropoff,
  strongestStudents,
  weakestStudents,
}) => {
  const diagnostics = [];

  if (totalStudents === 0) {
    diagnostics.push({
      level: "info",
      signal: "No learning data yet",
      finding:
        "Diagnostics will appear after students enroll, complete lessons, and submit assessments.",
      recommendation:
        "Focus on promotion, publishing, and enrollment first so the course can start generating meaningful diagnostics.",
    });

    return diagnostics;
  }

  if (lessonDropoff.length > 0) {
    const firstDropoff = lessonDropoff[0];

    if (firstDropoff.completionPercent < 50) {
      diagnostics.push({
        level: "warning",
        signal: "High lesson drop-off risk",
        finding: `Lesson ${firstDropoff.position}: ${firstDropoff.title} is completed by only ${firstDropoff.completionPercent.toFixed(2)}% of students.`,
        recommendation:
          "Shorten the lesson, improve explanation clarity, or insert a simpler transition before this point.",
      });
    }
  }

  if (hardestAssessments.length > 0) {
    const firstHardAssessment = hardestAssessments[0];

    if (firstHardAssessment.averagePercent < 50) {
      diagnostics.push({
        level: "warning",
        signal: "Assessment difficulty risk",
        finding: `${firstHardAssessment.title} has an average performance of ${firstHardAssessment.averagePercent.toFixed(2)}%, suggesting students are underprepared or the assessment is too difficult.`,
        recommendation:
          "Review the teaching material before this assessment and simplify or rebalance the hardest questions.",
      });
    }
  }

  if (
    completionRate < 40 &&
    hardestAssessments.length > 0 &&
    lessonDropoff.length > 0
  ) {
    diagnostics.push({
      level: "warning",
      signal: "Compound progression bottleneck",
      finding:
        "The course shows both low completion and weak checkpoint performance, which suggests students are likely stalling before or around assessment gates.",
      recommendation:
        "Add recap content before assessments, reduce lesson friction around the drop-off zone, and reinforce key concepts before gating points.",
    });
  }

  if (strongestStudents.length > 0 && weakestStudents.length > 0) {
    const strongest = strongestStudents[0];
    const weakest = weakestStudents[0];
    const performanceGap =
      strongest.summary.finalCourseMark - weakest.summary.finalCourseMark;

    if (performanceGap >= 30) {
      diagnostics.push({
        level: "info",
        signal: "Wide learner gap",
        finding: `There is a ${performanceGap.toFixed(2)} point performance gap between the top and lowest current learner outcomes.`,
        recommendation:
          "Introduce guided revision, recap checkpoints, and clearer support for lower-performing learners.",
      });
    }
  }

  if (averageCourseScore >= 75 && completionRate >= 70) {
    diagnostics.push({
      level: "success",
      signal: "Healthy course learning pattern",
      finding:
        "Both course completion and average performance are strong, suggesting the lesson sequence and assessment difficulty are balanced well.",
      recommendation:
        "Preserve this course structure and reuse the same design pattern in future courses.",
    });
  }

  if (diagnostics.length === 0) {
    diagnostics.push({
      level: "info",
      signal: "Stable but still developing",
      finding:
        "The course does not currently show a major diagnostic risk, but more student activity will make the signals stronger and more precise.",
      recommendation:
        "Continue monitoring assessment outcomes and lesson completion as enrollment grows.",
    });
  }

  return diagnostics;
};

const normalizeAnswerText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractKeywords = (gradingKeywords) => {
  if (!gradingKeywords) return [];

  if (Array.isArray(gradingKeywords)) {
    return gradingKeywords
      .map((item) => String(item).trim().toLowerCase())
      .filter(Boolean);
  }

  return [];
};

const buildQuestionDiagnostics = (assessmentQuestionStats) => {
  const diagnostics = [];

  const flattenedQuestions = assessmentQuestionStats.flatMap((assessment) =>
    assessment.questionStats.map((question) => ({
      assessmentTitle: assessment.title,
      assessmentType: assessment.type,
      ...question,
    }))
  );

  const hardQuestions = flattenedQuestions
    .filter((question) => question.totalResponses > 0)
    .sort((a, b) => a.successPercent - b.successPercent)
    .slice(0, 5);

  hardQuestions.forEach((question) => {
    if (question.successPercent < 40) {
      diagnostics.push({
        level: "warning",
        signal: "Hard question detected",
        finding: `${question.assessmentTitle} → "${question.prompt}" has a success rate of ${question.successPercent.toFixed(2)}%.`,
        recommendation:
          "Check whether the question wording is confusing or whether the lesson content before it needs stronger reinforcement.",
      });
    }
  });

  const keywordFailures = flattenedQuestions
    .filter(
      (question) =>
        question.type === "SHORT_TEXT" &&
        Array.isArray(question.keywordStats) &&
        question.keywordStats.length > 0
    )
    .flatMap((question) =>
      question.keywordStats.map((keywordStat) => ({
        assessmentTitle: question.assessmentTitle,
        prompt: question.prompt,
        keyword: keywordStat.keyword,
        matchedCount: keywordStat.matchedCount,
        matchPercent: keywordStat.matchPercent,
      }))
    )
    .sort((a, b) => a.matchPercent - b.matchPercent)
    .slice(0, 5);

  keywordFailures.forEach((keywordFailure) => {
    if (keywordFailure.matchPercent < 40) {
      diagnostics.push({
        level: "warning",
        signal: "Keyword misunderstanding detected",
        finding: `In ${keywordFailure.assessmentTitle}, the keyword "${keywordFailure.keyword}" is matched by only ${keywordFailure.matchPercent.toFixed(2)}% of student answers.`,
        recommendation:
          "Reinforce this concept in the related lesson and consider adding examples or recap material around it.",
      });
    }
  });

  const mcqDistractors = flattenedQuestions
    .filter(
      (question) =>
        question.type === "MULTIPLE_CHOICE" &&
        Array.isArray(question.optionStats) &&
        question.optionStats.length > 0 &&
        question.totalResponses > 0
    )
    .map((question) => {
      const distractors = question.optionStats
        .filter((option) => !option.isCorrectOption)
        .map((option) => ({
          ...option,
          selectionPercent:
            question.totalResponses > 0
              ? (option.selections / question.totalResponses) * 100
              : 0,
        }))
        .sort((a, b) => b.selectionPercent - a.selectionPercent);

      return {
        assessmentTitle: question.assessmentTitle,
        prompt: question.prompt,
        topDistractor: distractors[0] || null,
      };
    })
    .filter(
      (item) => item.topDistractor && item.topDistractor.selectionPercent >= 40
    )
    .slice(0, 5);

  mcqDistractors.forEach((distractor) => {
    diagnostics.push({
      level: "info",
      signal: "Strong distractor pattern",
      finding: `In ${distractor.assessmentTitle}, many students choose the wrong option "${distractor.topDistractor.option}" for "${distractor.prompt}".`,
      recommendation:
        "This wrong option may be misleading or may reflect a concept students systematically misunderstand.",
    });
  });

  if (diagnostics.length === 0) {
    diagnostics.push({
      level: "info",
      signal: "Question performance looks stable",
      finding:
        "No high-risk question pattern has been detected yet from the current response data.",
      recommendation:
        "Continue collecting submissions to strengthen question-level diagnostics.",
    });
  }

  return diagnostics;
};

const buildAssessmentQuestionStats = (assessments) =>
  assessments.map((assessment) => {
    const questionStats = assessment.questions.map((question) => {
      const answers = question.submissionAnswers || [];
      const totalResponses = answers.length;

      if (question.type === "MULTIPLE_CHOICE") {
        const correctResponses = answers.filter(
          (answer) => answer.isCorrect === true
        ).length;

        const successPercent =
          totalResponses > 0 ? (correctResponses / totalResponses) * 100 : 0;

        const optionStats = Array.isArray(question.options)
          ? question.options.map((option, index) => {
              const selections = answers.filter(
                (answer) => answer.selectedOptionIndex === index
              ).length;

              return {
                option,
                optionIndex: index,
                selections,
                isCorrectOption: question.correctOptionIndex === index,
              };
            })
          : [];

        return {
          questionId: question.id,
          prompt: question.prompt,
          type: question.type,
          totalResponses,
          successPercent,
          optionStats,
          keywordStats: [],
        };
      }

      const keywords = extractKeywords(question.gradingKeywords);

      const keywordStats = keywords.map((keyword) => {
        const matchedCount = answers.filter((answer) =>
          normalizeAnswerText(answer.answerText).includes(keyword)
        ).length;

        const matchPercent =
          totalResponses > 0 ? (matchedCount / totalResponses) * 100 : 0;

        return {
          keyword,
          matchedCount,
          matchPercent,
        };
      });

      const fullyCorrectResponses = answers.filter(
        (answer) => answer.isCorrect === true
      ).length;

      const successPercent =
        totalResponses > 0 ? (fullyCorrectResponses / totalResponses) * 100 : 0;

      return {
        questionId: question.id,
        prompt: question.prompt,
        type: question.type,
        totalResponses,
        successPercent,
        optionStats: [],
        keywordStats,
      };
    });

    return {
      id: assessment.id,
      title: assessment.title,
      type: assessment.type,
      questionStats,
    };
  });

export const listInstructorCourses = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;

    const courses = await prisma.course.findMany({
      where: { instructorId },
      orderBy: { createdAt: "desc" },
    });

    return res.render("instructor/courses", {
      user: req.session.user,
      courses,
      flash: getFlash(req),
    });
  } catch (err) {
    return next(err);
  }
};

export const manageInstructorCourse = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;
    const course = await getInstructorCourse(req.params.id, instructorId);

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/instructor/courses");
    }

    const [engagementWorkspace, engagementSnapshot] = await Promise.all([
      getInstructorCourseEngagementData(course.id),
      getInstructorEngagementSnapshot(instructorId),
    ]);

    return res.render("instructor/course-manage", {
      user: req.session.user,
      course,
      engagementWorkspace,
      engagementSnapshot,
      sessionTypeOptions: SESSION_TYPE_OPTIONS,
      flash: getFlash(req),
    });
  } catch (err) {
    return next(err);
  }
};

export const showInstructorCourseGradebook = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;

    const course = await prisma.course.findFirst({
      where: { id: req.params.id, instructorId },
      select: {
        id: true,
        title: true,
        enrollments: {
          orderBy: { createdAt: "asc" },
          select: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/instructor/courses");
    }

    const gradeRows = await Promise.all(
      course.enrollments.map(async (enrollment) => {
        const student = enrollment.user;
        const summary = await computeFinalCourseMark(course.id, student.id);

        return {
          student,
          summary,
        };
      })
    );

    return res.render("instructor/course-gradebook", {
      user: req.session.user,
      course,
      gradeRows,
      flash: getFlash(req),
    });
  } catch (err) {
    return next(err);
  }
};

export const showInstructorCourseAnalytics = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;

    const course = await prisma.course.findFirst({
      where: { id: req.params.id, instructorId },
      select: {
        id: true,
        title: true,
        lessons: {
          where: { published: true },
          orderBy: { position: "asc" },
          select: {
            id: true,
            title: true,
            position: true,
          },
        },
        assessments: {
          where: { published: true },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            title: true,
            type: true,
            maxScore: true,
            submissions: {
              select: {
                score: true,
                studentId: true,
              },
            },
            questions: {
              orderBy: { position: "asc" },
              select: {
                id: true,
                prompt: true,
                type: true,
                options: true,
                correctOptionIndex: true,
                gradingKeywords: true,
                submissionAnswers: {
                  select: {
                    selectedOptionIndex: true,
                    answerText: true,
                    isCorrect: true,
                  },
                },
              },
            },
          },
        },
        enrollments: {
          orderBy: { createdAt: "asc" },
          select: {
            completed: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/instructor/courses");
    }

    const enrolledStudents = course.enrollments.map((enrollment) => enrollment.user);
    const totalStudents = enrolledStudents.length;
    const completedStudents = course.enrollments.filter(
      (enrollment) => enrollment.completed
    ).length;
    const completionRate =
      totalStudents > 0 ? (completedStudents / totalStudents) * 100 : 0;

    const studentAnalyticsRows = await Promise.all(
      enrolledStudents.map(async (student) => {
        const summary = await computeFinalCourseMark(course.id, student.id);
        return {
          student,
          summary,
        };
      })
    );

    const courseMarks = studentAnalyticsRows.map(
      (row) => row.summary.finalCourseMark
    );

    const averageCourseScore =
      courseMarks.length > 0
        ? courseMarks.reduce((sum, value) => sum + value, 0) / courseMarks.length
        : 0;

    const strongestStudents = [...studentAnalyticsRows]
      .sort((a, b) => b.summary.finalCourseMark - a.summary.finalCourseMark)
      .slice(0, 5);

    const weakestStudents = [...studentAnalyticsRows]
      .sort((a, b) => a.summary.finalCourseMark - b.summary.finalCourseMark)
      .slice(0, 5);

    const assessmentAnalytics = course.assessments.map((assessment) => {
      const scores = assessment.submissions
        .map((submission) => submission.score)
        .filter((score) => typeof score === "number");

      const averageScore =
        scores.length > 0
          ? scores.reduce((sum, value) => sum + value, 0) / scores.length
          : 0;

      const averagePercent =
        assessment.maxScore > 0 ? (averageScore / assessment.maxScore) * 100 : 0;

      return {
        id: assessment.id,
        title: assessment.title,
        type: assessment.type,
        maxScore: assessment.maxScore,
        submissionCount: assessment.submissions.length,
        averageScore,
        averagePercent,
      };
    });

    const hardestAssessments = [...assessmentAnalytics]
      .filter((assessment) => assessment.submissionCount > 0)
      .sort((a, b) => a.averagePercent - b.averagePercent)
      .slice(0, 5);

    const lessonProgressCounts = course.lessons.length
      ? await Promise.all(
          course.lessons.map(async (lesson) => {
            const completedCount = await prisma.progress.count({
              where: {
                lessonId: lesson.id,
                completed: true,
              },
            });

            return {
              id: lesson.id,
              title: lesson.title,
              position: lesson.position,
              completedCount,
              completionPercent:
                totalStudents > 0 ? (completedCount / totalStudents) * 100 : 0,
            };
          })
        )
      : [];

    const lessonDropoff = [...lessonProgressCounts]
      .sort((a, b) => a.completionPercent - b.completionPercent)
      .slice(0, 5);

    const scoreDistribution = buildScoreDistribution(courseMarks);

    const insights = buildInstructorInsights({
      totalStudents,
      completionRate,
      averageCourseScore,
      hardestAssessments,
      lessonDropoff,
      strongestStudents,
      weakestStudents,
    });

    const assessmentQuestionStats = buildAssessmentQuestionStats(
      course.assessments
    );

    const diagnostics = buildCourseDiagnostics({
      totalStudents,
      completionRate,
      averageCourseScore,
      hardestAssessments,
      lessonDropoff,
      strongestStudents,
      weakestStudents,
    });

    const questionDiagnostics = buildQuestionDiagnostics(
      assessmentQuestionStats
    );

    return res.render("instructor/course-analytics", {
      user: req.session.user,
      course: {
        id: course.id,
        title: course.title,
      },
      analytics: {
        totalStudents,
        completedStudents,
        completionRate,
        averageCourseScore,
        strongestStudents,
        weakestStudents,
        assessmentAnalytics,
        hardestAssessments,
        lessonProgressCounts,
        lessonDropoff,
        scoreDistribution,
        insights,
        diagnostics,
        questionDiagnostics,
        assessmentQuestionStats,
      },
      flash: getFlash(req),
    });
  } catch (err) {
    return next(err);
  }
};

export const createLessonForm = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;

    const course = await prisma.course.findFirst({
      where: { id: req.params.id, instructorId },
      select: { id: true, title: true },
    });

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/instructor/courses");
    }

    return res.render("instructor/lesson-form", {
      user: req.session.user,
      course,
      lesson: null,
      mode: "create",
      flash: getFlash(req),
    });
  } catch (err) {
    return next(err);
  }
};

export const createLesson = async (req, res, next) => {
  let uploadedCloudflareVideoUrl = null;

  try {
    const instructorId = req.session.user.id;

    const course = await prisma.course.findFirst({
      where: { id: req.params.id, instructorId },
      select: { id: true, title: true },
    });

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/instructor/courses");
    }

    const title = String(req.body.title || "").trim();

    if (!title) {
      req.session.flash = { type: "error", message: "Lesson title is required" };
      return res.redirect(`/instructor/courses/${course.id}/lessons/new`);
    }

    const content = String(req.body.content || "").trim();

    const videoFile = req.files?.videoFile?.[0] || req.file || null;
    const docxFile = req.files?.docxFile?.[0] || null;

    const uploadedDocxUrl = docxFile ? `/uploads/${docxFile.filename}` : "";
    const submittedVideoUrl = String(req.body.videoUrl || "").trim();
    const hasUploadedVideo = Boolean(videoFile);
    const videoUrlRaw = submittedVideoUrl;
    const durationRaw = String(req.body.videoDurationSec || "").trim();
    const duration = durationRaw ? Number(durationRaw) : null;

    let finalVideoUrl = videoUrlRaw || null;
    if (hasUploadedVideo) {
      try {
        const uploadedVideo = await uploadLessonVideoToCloudflareStream(videoFile, {
          creatorId: String(instructorId),
          videoName: title || videoFile?.originalname || "lesson-video",
        });
        finalVideoUrl = uploadedVideo.iframeUrl;
        uploadedCloudflareVideoUrl = uploadedVideo.iframeUrl;
      } catch (error) {
        req.session.flash = { type: "error", message: error.message };
        return res.redirect(`/instructor/courses/${course.id}/lessons/new`);
      }
    } else {
      const videoUrlError = validateExternalLessonVideoUrl(videoUrlRaw);
      if (videoUrlError) {
        req.session.flash = { type: "error", message: videoUrlError };
        return res.redirect(`/instructor/courses/${course.id}/lessons/new`);
      }
    }

    if (!content && !finalVideoUrl && !uploadedDocxUrl) {
      req.session.flash = {
        type: "error",
        message: "Add lesson content, upload a video, or attach a DOCX before saving.",
      };
      return res.redirect(`/instructor/courses/${course.id}/lessons/new`);
    }

    const maxPosition = await prisma.lesson.aggregate({
      where: { courseId: course.id },
      _max: { position: true },
    });

    const nextPosition = (maxPosition._max.position || 0) + 1;
    const published = req.body.published === "on";

    await prisma.lesson.create({
      data: {
        courseId: course.id,
        title,
        content,
        position: nextPosition,
        videoUrl: finalVideoUrl,
        docxUrl: uploadedDocxUrl || null,
        videoDurationSec: Number.isFinite(duration)
          ? Math.max(0, Math.floor(duration))
          : null,
        published,
      },
    });

    await recomputeCourseStatus(course.id);

    req.session.flash = { type: "success", message: "Lesson created" };
    return res.redirect(`/instructor/courses/${course.id}/manage`);
  } catch (err) {
    if (uploadedCloudflareVideoUrl) {
      cleanupReplacedCloudflareLessonVideo(uploadedCloudflareVideoUrl);
    }
    return next(err);
  }
};

export const editLessonForm = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;

    const lesson = await prisma.lesson.findUnique({
      where: { id: req.params.lessonId },
      include: {
        course: { select: { id: true, title: true, instructorId: true } },
      },
    });

    if (!lesson || lesson.course.instructorId !== instructorId) {
      req.session.flash = { type: "error", message: "Lesson not found" };
      return res.redirect("/instructor/courses");
    }

    return res.render("instructor/lesson-form", {
      user: req.session.user,
      course: lesson.course,
      lesson,
      mode: "edit",
      flash: getFlash(req),
    });
  } catch (err) {
    return next(err);
  }
};

export const updateLesson = async (req, res, next) => {
  let uploadedCloudflareVideoUrl = null;
  let previousCloudflareVideoUrlToDelete = null;

  try {
    const instructorId = req.session.user.id;

    const lesson = await prisma.lesson.findUnique({
      where: { id: req.params.lessonId },
      include: {
        course: { select: { id: true, instructorId: true } },
      },
    });

    if (!lesson || lesson.course.instructorId !== instructorId) {
      req.session.flash = { type: "error", message: "Lesson not found" };
      return res.redirect("/instructor/courses");
    }

    const title = String(req.body.title || "").trim();

    if (!title) {
      req.session.flash = { type: "error", message: "Lesson title is required" };
      return res.redirect(`/instructor/lessons/${lesson.id}/edit`);
    }

    const content = String(req.body.content || "").trim();

    const videoFile = req.files?.videoFile?.[0] || req.file || null;
    const docxFile = req.files?.docxFile?.[0] || null;

    const uploadedDocxUrl = docxFile ? `/uploads/${docxFile.filename}` : "";
    const submittedVideoUrl = String(req.body.videoUrl || "").trim();
    const hasUploadedVideo = Boolean(videoFile);
    const videoUrlRaw = submittedVideoUrl;
    const durationRaw = String(req.body.videoDurationSec || "").trim();
    const duration = durationRaw ? Number(durationRaw) : null;
    const nextDocxUrl = uploadedDocxUrl || lesson.docxUrl || null;
    const existingVideoUrl = String(lesson.videoUrl || "").trim();

    let finalVideoUrl = lesson.videoUrl || null;
    if (hasUploadedVideo) {
      try {
        const uploadedVideo = await uploadLessonVideoToCloudflareStream(videoFile, {
          creatorId: String(instructorId),
          videoName: title || videoFile?.originalname || "lesson-video",
        });
        finalVideoUrl = uploadedVideo.iframeUrl;
        uploadedCloudflareVideoUrl = uploadedVideo.iframeUrl;
        if (
          existingVideoUrl &&
          existingVideoUrl !== finalVideoUrl &&
          isCloudflareStreamVideoUrl(existingVideoUrl)
        ) {
          previousCloudflareVideoUrlToDelete = existingVideoUrl;
        }
      } catch (error) {
        req.session.flash = { type: "error", message: error.message };
        return res.redirect(`/instructor/lessons/${lesson.id}/edit`);
      }
    } else if (submittedVideoUrl !== existingVideoUrl) {
      const videoUrlError = validateExternalLessonVideoUrl(videoUrlRaw);
      if (videoUrlError) {
        req.session.flash = { type: "error", message: videoUrlError };
        return res.redirect(`/instructor/lessons/${lesson.id}/edit`);
      }
      finalVideoUrl = videoUrlRaw || null;
      if (
        existingVideoUrl &&
        existingVideoUrl !== finalVideoUrl &&
        isCloudflareStreamVideoUrl(existingVideoUrl)
      ) {
        previousCloudflareVideoUrlToDelete = existingVideoUrl;
      }
    }

    const nextPublished = req.body.published === "on";

    await prisma.lesson.update({
      where: { id: lesson.id },
      data: {
        title,
        content,
        videoUrl: finalVideoUrl,
        docxUrl: nextDocxUrl,
        videoDurationSec: Number.isFinite(duration)
          ? Math.max(0, Math.floor(duration))
          : null,
        published: nextPublished,
      },
    });

    if (lesson.published !== nextPublished) {
      await recomputeCourseStatus(lesson.course.id);
    }

    if (previousCloudflareVideoUrlToDelete) {
      cleanupReplacedCloudflareLessonVideo(previousCloudflareVideoUrlToDelete);
    }

    req.session.flash = { type: "success", message: "Lesson updated" };
    return res.redirect(`/instructor/courses/${lesson.course.id}/manage`);
  } catch (err) {
    if (uploadedCloudflareVideoUrl) {
      cleanupReplacedCloudflareLessonVideo(uploadedCloudflareVideoUrl);
    }
    return next(err);
  }
};

export const moveLesson = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;
    const { direction } = req.body;

    const lesson = await prisma.lesson.findUnique({
      where: { id: req.params.lessonId },
      include: {
        course: { select: { id: true, instructorId: true } },
      },
    });

    if (!lesson || lesson.course.instructorId !== instructorId) {
      req.session.flash = { type: "error", message: "Lesson not found" };
      return res.redirect("/instructor/courses");
    }

    if (direction !== "up" && direction !== "down") {
      req.session.flash = { type: "error", message: "Invalid move direction" };
      return res.redirect(`/instructor/courses/${lesson.course.id}/manage`);
    }

    const adjacent = await prisma.lesson.findFirst({
      where: {
        courseId: lesson.course.id,
        position: direction === "up" ? { lt: lesson.position } : { gt: lesson.position },
      },
      orderBy: { position: direction === "up" ? "desc" : "asc" },
    });

    if (!adjacent) {
      req.session.flash = { type: "info", message: "Lesson cannot move further" };
      return res.redirect(`/instructor/courses/${lesson.course.id}/manage`);
    }

    const tempPosition = -1;
    const currentPosition = lesson.position;
    const adjacentPosition = adjacent.position;

    await prisma.$transaction([
      prisma.lesson.update({
        where: { id: lesson.id },
        data: { position: tempPosition },
      }),
      prisma.lesson.update({
        where: { id: adjacent.id },
        data: { position: currentPosition },
      }),
      prisma.lesson.update({
        where: { id: lesson.id },
        data: { position: adjacentPosition },
      }),
    ]);

    req.session.flash = { type: "success", message: "Lesson order updated" };
    return res.redirect(`/instructor/courses/${lesson.course.id}/manage`);
  } catch (err) {
    return next(err);
  }
};

export const showAssessmentPlaceholder = async (req, res, next) => {
  try {
    return res.render("instructor/assessment-placeholder", {
      user: req.session.user,
    });
  } catch (err) {
    return next(err);
  }
};
