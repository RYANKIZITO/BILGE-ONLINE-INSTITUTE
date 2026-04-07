import { prisma } from "../../config/prisma.js";

const CONTINUOUS_INTERVAL = 7;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_PASS_PERCENT = 50;

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

const getShortTextKeywordStats = (answerText, gradingKeywords) => {
  const normalizedAnswer = normalizeAnswerText(answerText);
  const keywords = extractKeywords(gradingKeywords);

  if (!keywords.length) {
    return {
      keywords: [],
      matchedKeywords: [],
      missedKeywords: [],
      matchedCount: 0,
      totalKeywords: 0,
      ratio: 0,
      isCorrect: null,
    };
  }

  const matchedKeywords = keywords.filter((keyword) =>
    normalizedAnswer.includes(keyword)
  );

  const missedKeywords = keywords.filter(
    (keyword) => !normalizedAnswer.includes(keyword)
  );

  const matchedCount = matchedKeywords.length;
  const totalKeywords = keywords.length;
  const ratio = totalKeywords > 0 ? matchedCount / totalKeywords : 0;

  return {
    keywords,
    matchedKeywords,
    missedKeywords,
    matchedCount,
    totalKeywords,
    ratio,
    isCorrect: matchedCount === totalKeywords,
  };
};

const getPassMarkScore = (maxScore) =>
  Math.ceil((Number(maxScore) || 0) * (DEFAULT_PASS_PERCENT / 100));

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
      lessons: {
        where: { published: true },
        orderBy: { position: "asc" },
        select: { id: true, position: true },
      },
    },
  });
};

const getPublishedAssessmentForStudent = async (courseId, assessmentId) => {
  return prisma.assessment.findFirst({
    where: {
      id: assessmentId,
      courseId,
      published: true,
    },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      maxScore: true,
      categoryWeight: true,
      published: true,
      createdAt: true,
      questions: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          prompt: true,
          type: true,
          options: true,
          correctOptionIndex: true,
          gradingKeywords: true,
          position: true,
        },
      },
    },
  });
};

const getAssessmentThreshold = (assessment, totalLessons, continuousIndexMap) => {
  if (assessment.type === "CONTINUOUS") {
    const index = continuousIndexMap.get(assessment.id) ?? 0;
    return (index + 1) * CONTINUOUS_INTERVAL;
  }

  if (assessment.type === "MID_PROGRAMME") {
    return totalLessons > 0 ? Math.ceil(totalLessons / 2) : Number.MAX_SAFE_INTEGER;
  }

  if (assessment.type === "FINAL_CAPSTONE") {
    return totalLessons > 0 ? totalLessons : Number.MAX_SAFE_INTEGER;
  }

  return Number.MAX_SAFE_INTEGER;
};

const buildContinuousIndexMap = (assessments) => {
  const continuous = assessments
    .filter((assessment) => assessment.type === "CONTINUOUS")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return new Map(continuous.map((assessment, index) => [assessment.id, index]));
};

const buildGate = (assessment, totalLessons, continuousIndexMap) => {
  const threshold = getAssessmentThreshold(assessment, totalLessons, continuousIndexMap);

  if (assessment.type === "MID_PROGRAMME") {
    return {
      assessmentId: assessment.id,
      title: assessment.title,
      type: assessment.type,
      threshold,
      message:
        "Mid-Programme Assessment must be passed before you continue to the next lessons.",
      lockReason: "Locked until Mid-Programme Assessment is passed.",
    };
  }

  if (assessment.type === "FINAL_CAPSTONE") {
    return {
      assessmentId: assessment.id,
      title: assessment.title,
      type: assessment.type,
      threshold,
      message: "Final Capstone Assessment must be passed to complete this course.",
      lockReason: "Locked until Final Capstone Assessment is passed.",
    };
  }

  return {
    assessmentId: assessment.id,
    title: assessment.title,
    type: assessment.type,
    threshold,
    message: `${assessment.title} must be passed before you continue to the next lessons.`,
    lockReason: `Locked until ${assessment.title} is passed.`,
  };
};

const getActiveAssessmentGate = (
  assessments,
  passStatusByAssessmentId,
  completedLessons,
  totalLessons
) => {
  const continuousIndexMap = buildContinuousIndexMap(assessments);

  const ordered = [...assessments].sort((a, b) => {
    const aThreshold = getAssessmentThreshold(a, totalLessons, continuousIndexMap);
    const bThreshold = getAssessmentThreshold(b, totalLessons, continuousIndexMap);

    if (aThreshold !== bThreshold) {
      return aThreshold - bThreshold;
    }

    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  for (const assessment of ordered) {
    const threshold = getAssessmentThreshold(assessment, totalLessons, continuousIndexMap);

    if (passStatusByAssessmentId[assessment.id]?.passed) continue;

    if (completedLessons >= threshold) {
      return buildGate(assessment, totalLessons, continuousIndexMap);
    }
  }

  return null;
};

const isAssessmentUnlocked = (
  assessment,
  completedLessons,
  totalLessons,
  allAssessments
) => {
  const continuousIndexMap = buildContinuousIndexMap(allAssessments);
  const threshold = getAssessmentThreshold(assessment, totalLessons, continuousIndexMap);
  return completedLessons >= threshold;
};

const buildAssessmentAttemptSummary = (assessment, submissions) => {
  const orderedSubmissions = [...submissions].sort((a, b) => b.attempt - a.attempt);
  const latestSubmission = orderedSubmissions[0] || null;

  let bestSubmission = null;

  for (const submission of orderedSubmissions) {
    if (!bestSubmission || (submission.score ?? 0) > (bestSubmission.score ?? 0)) {
      bestSubmission = submission;
    }
  }

  const passMarkScore = getPassMarkScore(assessment.maxScore);
  const hasPassed = orderedSubmissions.some(
    (submission) => Number(submission.score || 0) >= passMarkScore
  );

  const attemptsUsed = orderedSubmissions.length;
  const attemptsRemaining = Math.max(0, DEFAULT_MAX_ATTEMPTS - attemptsUsed);
  const canRetake = !hasPassed && attemptsUsed < DEFAULT_MAX_ATTEMPTS;

  return {
    latestSubmission,
    bestSubmission,
    attemptsUsed,
    attemptsRemaining,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    passPercent: DEFAULT_PASS_PERCENT,
    passMarkScore,
    hasPassed,
    canRetake,
    submissions: orderedSubmissions,
  };
};

export const listStudentAssessments = async (req, res, next) => {
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

    const lessonIds = course.lessons.map((lesson) => lesson.id);

    const progress = lessonIds.length
      ? await prisma.progress.findMany({
          where: {
            userId: studentId,
            lessonId: { in: lessonIds },
          },
          select: {
            lessonId: true,
            completed: true,
          },
        })
      : [];

    const progressByLesson = Object.fromEntries(
      progress.map((entry) => [entry.lessonId, entry])
    );

    const totalLessons = course.lessons.length;
    const completedLessons = course.lessons.filter(
      (lesson) => progressByLesson[lesson.id]?.completed
    ).length;

    const assessments = await prisma.assessment.findMany({
      where: {
        courseId: course.id,
        published: true,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
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
      orderBy: [{ assessmentId: "asc" }, { attempt: "desc" }],
      select: {
        id: true,
        assessmentId: true,
        attempt: true,
        score: true,
        submittedAt: true,
      },
    });

    const submissionsGrouped = submissions.reduce((acc, submission) => {
      if (!acc[submission.assessmentId]) acc[submission.assessmentId] = [];
      acc[submission.assessmentId].push(submission);
      return acc;
    }, {});

    const submissionSummaryByAssessmentId = Object.fromEntries(
      assessments.map((assessment) => [
        assessment.id,
        buildAssessmentAttemptSummary(
          assessment,
          submissionsGrouped[assessment.id] || []
        ),
      ])
    );

    const passStatusByAssessmentId = Object.fromEntries(
      assessments.map((assessment) => [
        assessment.id,
        {
          passed: submissionSummaryByAssessmentId[assessment.id].hasPassed,
        },
      ])
    );

    const activeAssessmentGate = getActiveAssessmentGate(
      assessments,
      passStatusByAssessmentId,
      completedLessons,
      totalLessons
    );

    const assessmentStates = Object.fromEntries(
      assessments.map((assessment) => [
        assessment.id,
        {
          unlocked: isAssessmentUnlocked(
            assessment,
            completedLessons,
            totalLessons,
            assessments
          ),
        },
      ])
    );

    return res.render("student/assessments/index", {
      user: req.session.user,
      course,
      assessments,
      submissionSummaryByAssessmentId,
      activeAssessmentGate,
      assessmentStates,
      flash: req.session.flash || null,
    });
  } catch (err) {
    return next(err);
  } finally {
    req.session.flash = null;
  }
};

export const showStudentAssessment = async (req, res, next) => {
  try {
    const studentId = req.session.user.id;
    const { slug, assessmentId } = req.params;

    const course = await getEnrolledCourse(slug, studentId);

    if (!course) {
      req.session.flash = {
        type: "error",
        message: "Course not found or you are not enrolled.",
      };
      return res.redirect("/courses");
    }

    const assessment = await getPublishedAssessmentForStudent(course.id, assessmentId);

    if (!assessment) {
      req.session.flash = {
        type: "error",
        message: "Assessment not found or not published.",
      };
      return res.redirect(`/courses/${course.slug}/assessments`);
    }

    const allAssessments = await prisma.assessment.findMany({
      where: {
        courseId: course.id,
        published: true,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        type: true,
        createdAt: true,
      },
    });

    const lessonIds = course.lessons.map((lesson) => lesson.id);

    const progress = lessonIds.length
      ? await prisma.progress.findMany({
          where: {
            userId: studentId,
            lessonId: { in: lessonIds },
          },
          select: {
            lessonId: true,
            completed: true,
          },
        })
      : [];

    const progressByLesson = Object.fromEntries(
      progress.map((entry) => [entry.lessonId, entry])
    );

    const totalLessons = course.lessons.length;
    const completedLessons = course.lessons.filter(
      (lesson) => progressByLesson[lesson.id]?.completed
    ).length;

    const existingSubmissions = await prisma.assessmentSubmission.findMany({
      where: {
        assessmentId: assessment.id,
        studentId,
      },
      orderBy: { attempt: "desc" },
      include: {
        answers: {
          select: {
            questionId: true,
            answerText: true,
            selectedOptionIndex: true,
            isCorrect: true,
          },
        },
      },
    });

    const attemptSummary = buildAssessmentAttemptSummary(assessment, existingSubmissions);
    const latestSubmission = attemptSummary.latestSubmission;

    if (
      !latestSubmission &&
      !isAssessmentUnlocked(assessment, completedLessons, totalLessons, allAssessments)
    ) {
      req.session.flash = {
        type: "info",
        message: `${assessment.title} is still locked. Complete the required lesson progress first.`,
      };
      return res.redirect(`/courses/${course.slug}?view=1`);
    }

    const answersByQuestionId = latestSubmission
      ? Object.fromEntries(
          latestSubmission.answers.map((answer) => [answer.questionId, answer])
        )
      : {};

    const shortTextFeedbackByQuestionId = Object.fromEntries(
      assessment.questions
        .filter((question) => question.type === "SHORT_TEXT")
        .map((question) => {
          const existingAnswer = answersByQuestionId[question.id];
          const stats = getShortTextKeywordStats(
            existingAnswer?.answerText || "",
            question.gradingKeywords
          );

          return [
            question.id,
            {
              matchedKeywords: stats.matchedKeywords,
              missedKeywords: stats.missedKeywords,
              matchedCount: stats.matchedCount,
              totalKeywords: stats.totalKeywords,
              ratio: stats.ratio,
            },
          ];
        })
    );

    return res.render("student/assessments/show", {
      user: req.session.user,
      course,
      assessment,
      submission: latestSubmission,
      answersByQuestionId,
      shortTextFeedbackByQuestionId,
      retakeSummary: attemptSummary,
      flash: req.session.flash || null,
    });
  } catch (err) {
    return next(err);
  } finally {
    req.session.flash = null;
  }
};

export const submitStudentAssessment = async (req, res, next) => {
  try {
    const studentId = req.session.user.id;
    const { slug, assessmentId } = req.params;

    const course = await getEnrolledCourse(slug, studentId);

    if (!course) {
      req.session.flash = {
        type: "error",
        message: "Course not found or you are not enrolled.",
      };
      return res.redirect("/courses");
    }

    const assessment = await getPublishedAssessmentForStudent(course.id, assessmentId);

    if (!assessment) {
      req.session.flash = {
        type: "error",
        message: "Assessment not found or not published.",
      };
      return res.redirect(`/courses/${course.slug}/assessments`);
    }

    const allAssessments = await prisma.assessment.findMany({
      where: {
        courseId: course.id,
        published: true,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        type: true,
        createdAt: true,
      },
    });

    const lessonIds = course.lessons.map((lesson) => lesson.id);

    const progress = lessonIds.length
      ? await prisma.progress.findMany({
          where: {
            userId: studentId,
            lessonId: { in: lessonIds },
          },
          select: {
            lessonId: true,
            completed: true,
          },
        })
      : [];

    const progressByLesson = Object.fromEntries(
      progress.map((entry) => [entry.lessonId, entry])
    );

    const totalLessons = course.lessons.length;
    const completedLessons = course.lessons.filter(
      (lesson) => progressByLesson[lesson.id]?.completed
    ).length;

    if (!isAssessmentUnlocked(assessment, completedLessons, totalLessons, allAssessments)) {
      req.session.flash = {
        type: "info",
        message: `${assessment.title} is still locked. Complete the required lesson progress first.`,
      };
      return res.redirect(`/courses/${course.slug}?view=1`);
    }

    const previousSubmissions = await prisma.assessmentSubmission.findMany({
      where: {
        assessmentId: assessment.id,
        studentId,
      },
      orderBy: { attempt: "desc" },
      select: {
        id: true,
        attempt: true,
        score: true,
      },
    });

    const attemptSummary = buildAssessmentAttemptSummary(assessment, previousSubmissions);

    if (attemptSummary.hasPassed) {
      req.session.flash = {
        type: "info",
        message: "You already passed this assessment.",
      };
      return res.redirect(`/courses/${course.slug}/assessments/${assessment.id}`);
    }

    if (!attemptSummary.canRetake && attemptSummary.attemptsUsed > 0) {
      req.session.flash = {
        type: "error",
        message: "You have used all allowed attempts for this assessment.",
      };
      return res.redirect(`/courses/${course.slug}/assessments/${assessment.id}`);
    }

    let totalEarnedUnits = 0;
    let totalPossibleUnits = 0;

    const answerRows = assessment.questions.map((question) => {
      if (question.type === "MULTIPLE_CHOICE") {
        totalPossibleUnits += 1;

        const raw = req.body[`question_${question.id}`];
        const selectedOptionIndex =
          raw === undefined || raw === null || raw === ""
            ? null
            : Number.parseInt(raw, 10);

        const isCorrect =
          Number.isInteger(selectedOptionIndex) &&
          selectedOptionIndex === question.correctOptionIndex;

        if (isCorrect) {
          totalEarnedUnits += 1;
        }

        return {
          questionId: question.id,
          selectedOptionIndex: Number.isInteger(selectedOptionIndex)
            ? selectedOptionIndex
            : null,
          answerText: null,
          isCorrect: selectedOptionIndex === null ? false : isCorrect,
        };
      }

      const answerText = String(req.body[`question_${question.id}`] || "").trim();
      const stats = getShortTextKeywordStats(answerText, question.gradingKeywords);

      if (stats.totalKeywords > 0) {
        totalPossibleUnits += stats.totalKeywords;
        totalEarnedUnits += stats.matchedCount;
      }

      return {
        questionId: question.id,
        selectedOptionIndex: null,
        answerText: answerText || null,
        isCorrect: stats.isCorrect,
      };
    });

    const score =
      totalPossibleUnits > 0
        ? Math.round((totalEarnedUnits / totalPossibleUnits) * assessment.maxScore)
        : 0;

    const nextAttempt = attemptSummary.attemptsUsed + 1;

    try {
      await prisma.$transaction(async (tx) => {
        const submission = await tx.assessmentSubmission.create({
          data: {
            assessmentId: assessment.id,
            studentId,
            attempt: nextAttempt,
            score,
            submittedAt: new Date(),
          },
          select: { id: true },
        });

        if (answerRows.length > 0) {
          await tx.submissionAnswer.createMany({
            data: answerRows.map((answer) => ({
              submissionId: submission.id,
              questionId: answer.questionId,
              selectedOptionIndex: answer.selectedOptionIndex,
              answerText: answer.answerText,
              isCorrect: answer.isCorrect,
            })),
          });
        }
      });
    } catch (err) {
      if (err?.code === "P2002") {
        req.session.flash = {
          type: "info",
          message: "This assessment attempt was already recorded.",
        };
        return res.redirect(`/courses/${course.slug}/assessments/${assessment.id}`);
      }

      throw err;
    }

    const passMarkScore = getPassMarkScore(assessment.maxScore);
    const passed = score >= passMarkScore;

    req.session.flash = {
      type: passed ? "success" : "info",
      message: passed
        ? `Assessment passed successfully on attempt ${nextAttempt}.`
        : `Assessment submitted. You scored ${score} / ${assessment.maxScore}. You may retake if attempts remain.`,
    };

    return res.redirect(`/courses/${course.slug}/assessments/${assessment.id}`);
  } catch (err) {
    return next(err);
  }
};