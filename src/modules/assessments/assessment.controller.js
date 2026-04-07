import { prisma } from "../../config/prisma.js";
import { computeFinalCourseMark } from "./assessment.grading.service.js";
import { syncCourseStatusFromContent } from "../courses/course.status.js";

const getFlash = (req) => {
  const flash = req.session.flash || null;
  req.session.flash = null;
  return flash;
};

const getInstructorCourse = async (courseId, instructorId) =>
  prisma.course.findFirst({
    where: { id: courseId, instructorId },
    select: { id: true, title: true },
  });

const getCourseAssessment = async (courseId, assessmentId) =>
  prisma.assessment.findFirst({
    where: { id: assessmentId, courseId },
    select: {
      id: true,
      title: true,
      type: true,
      published: true,
      categoryWeight: true,
      maxScore: true,
    },
  });

const ASSESSMENT_WEIGHTS = {
  CONTINUOUS: 30,
  MID_PROGRAMME: 20,
  FINAL_CAPSTONE: 50,
};

const isValidAssessmentType = (type) =>
  Object.prototype.hasOwnProperty.call(ASSESSMENT_WEIGHTS, type);

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

const buildQuestionIntelligence = (questions, submissionAnswers) => {
  const answersByQuestionId = submissionAnswers.reduce((acc, answer) => {
    if (!acc[answer.questionId]) acc[answer.questionId] = [];
    acc[answer.questionId].push(answer);
    return acc;
  }, {});

  return questions.map((question) => {
    const answers = answersByQuestionId[question.id] || [];
    const totalResponses = answers.length;

    if (question.type === "MULTIPLE_CHOICE") {
      const correctResponses = answers.filter((answer) => answer.isCorrect === true).length;
      const wrongResponses = answers.filter((answer) => answer.isCorrect === false).length;
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
        correctResponses,
        wrongResponses,
        successPercent,
        difficultyLabel:
          successPercent < 40
            ? "Very Hard"
            : successPercent < 60
              ? "Hard"
              : successPercent < 80
                ? "Moderate"
                : "Easy",
        optionStats,
        keywordStats: null,
      };
    }

    const keywordList = extractKeywords(question.gradingKeywords);

    const keywordStats = keywordList.map((keyword) => {
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

    const correctResponses = answers.filter((answer) => answer.isCorrect === true).length;
    const partialOrWrongResponses = totalResponses - correctResponses;
    const successPercent =
      totalResponses > 0 ? (correctResponses / totalResponses) * 100 : 0;

    return {
      questionId: question.id,
      prompt: question.prompt,
      type: question.type,
      totalResponses,
      correctResponses,
      wrongResponses: partialOrWrongResponses,
      successPercent,
      difficultyLabel:
        successPercent < 40
          ? "Very Hard"
          : successPercent < 60
            ? "Hard"
            : successPercent < 80
              ? "Moderate"
              : "Easy",
      optionStats: [],
      keywordStats,
    };
  });
};

export const listCourseAssessments = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;
    const courseId = req.params.id;
    const studentId = String(req.query.studentId || "").trim() || null;

    const course = await getInstructorCourse(courseId, instructorId);

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/instructor/courses");
    }

    const assessments = await prisma.assessment.findMany({
      where: { courseId: course.id },
      orderBy: { createdAt: "desc" },
    });

    let gradingPreview = null;

    if (studentId) {
      gradingPreview = await computeFinalCourseMark(course.id, studentId);
    }

    return res.render("instructor/assessments/index", {
      user: req.session.user,
      course,
      assessments,
      gradingPreview,
      flash: getFlash(req),
    });
  } catch (err) {
    return next(err);
  }
};

export const newCourseAssessmentForm = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;
    const courseId = req.params.id;

    const course = await getInstructorCourse(courseId, instructorId);

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/instructor/courses");
    }

    return res.render("instructor/assessments/new", {
      user: req.session.user,
      course,
      flash: getFlash(req),
    });
  } catch (err) {
    return next(err);
  }
};

export const createCourseAssessment = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;
    const courseId = req.params.id;

    const course = await getInstructorCourse(courseId, instructorId);

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/instructor/courses");
    }

    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const type = String(req.body.type || "CONTINUOUS").trim();
    const parsedMaxScore = Number.parseInt(req.body.maxScore, 10);

    if (!title) {
      req.session.flash = {
        type: "error",
        message: "Assessment title is required",
      };
      return res.redirect(`/instructor/courses/${course.id}/assessments/new`);
    }

    if (!isValidAssessmentType(type)) {
      req.session.flash = {
        type: "error",
        message: "Invalid assessment type selected",
      };
      return res.redirect(`/instructor/courses/${course.id}/assessments/new`);
    }

    if (Number.isNaN(parsedMaxScore) || parsedMaxScore < 1) {
      req.session.flash = {
        type: "error",
        message: "Max score must be a positive number",
      };
      return res.redirect(`/instructor/courses/${course.id}/assessments/new`);
    }

    if (type === "MID_PROGRAMME" || type === "FINAL_CAPSTONE") {
      const existingTypedAssessment = await prisma.assessment.findFirst({
        where: {
          courseId: course.id,
          type,
        },
        select: { id: true },
      });

      if (existingTypedAssessment) {
        req.session.flash = {
          type: "error",
          message:
            type === "MID_PROGRAMME"
              ? "This course already has a Mid-Programme assessment"
              : "This course already has a Final Capstone assessment",
        };
        return res.redirect(`/instructor/courses/${course.id}/assessments/new`);
      }
    }

    await prisma.assessment.create({
      data: {
        courseId: course.id,
        title,
        description: description || null,
        type,
        categoryWeight: ASSESSMENT_WEIGHTS[type],
        maxScore: parsedMaxScore,
        published: false,
      },
    });

    req.session.flash = {
      type: "success",
      message: "Assessment created",
    };

    return res.redirect(`/instructor/courses/${course.id}/assessments`);
  } catch (err) {
    return next(err);
  }
};

export const showAssessmentQuestions = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;
    const { courseId, assessmentId } = req.params;

    const course = await getInstructorCourse(courseId, instructorId);

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/instructor/courses");
    }

    const assessment = await getCourseAssessment(course.id, assessmentId);

    if (!assessment) {
      req.session.flash = { type: "error", message: "Assessment not found" };
      return res.redirect(`/instructor/courses/${course.id}/assessments`);
    }

    const questions = await prisma.assessmentQuestion.findMany({
      where: { assessmentId: assessment.id },
      orderBy: { position: "asc" },
    });

    const submissions = await prisma.assessmentSubmission.findMany({
      where: { assessmentId: assessment.id },
      select: { id: true },
    });

    const submissionIds = submissions.map((submission) => submission.id);

    const submissionAnswers = submissionIds.length
      ? await prisma.submissionAnswer.findMany({
          where: {
            submissionId: { in: submissionIds },
          },
          select: {
            submissionId: true,
            questionId: true,
            answerText: true,
            selectedOptionIndex: true,
            isCorrect: true,
          },
        })
      : [];

    const questionIntelligence = buildQuestionIntelligence(
      questions,
      submissionAnswers
    );

    const hardestQuestions = [...questionIntelligence]
      .filter((question) => question.totalResponses > 0)
      .sort((a, b) => a.successPercent - b.successPercent)
      .slice(0, 5);

    return res.render("instructor/assessments/questions", {
      user: req.session.user,
      course,
      assessment,
      questions,
      questionIntelligence,
      hardestQuestions,
      totalSubmissions: submissions.length,
      flash: getFlash(req),
    });
  } catch (err) {
    return next(err);
  }
};

export const newAssessmentQuestionForm = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;
    const { courseId, assessmentId } = req.params;

    const course = await getInstructorCourse(courseId, instructorId);

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/instructor/courses");
    }

    const assessment = await getCourseAssessment(course.id, assessmentId);

    if (!assessment) {
      req.session.flash = { type: "error", message: "Assessment not found" };
      return res.redirect(`/instructor/courses/${course.id}/assessments`);
    }

    return res.render("instructor/assessments/question-form", {
      user: req.session.user,
      course,
      assessment,
      flash: getFlash(req),
    });
  } catch (err) {
    return next(err);
  }
};

export const createAssessmentQuestion = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;
    const { courseId, assessmentId } = req.params;

    const course = await getInstructorCourse(courseId, instructorId);

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/instructor/courses");
    }

    const assessment = await getCourseAssessment(course.id, assessmentId);

    if (!assessment) {
      req.session.flash = { type: "error", message: "Assessment not found" };
      return res.redirect(`/instructor/courses/${course.id}/assessments`);
    }

    const prompt = String(req.body.prompt || "").trim();
    const type = String(req.body.type || "").trim();

    if (!prompt) {
      req.session.flash = {
        type: "error",
        message: "Question prompt is required",
      };
      return res.redirect(
        `/instructor/courses/${course.id}/assessments/${assessment.id}/questions/new`
      );
    }

    if (type !== "MULTIPLE_CHOICE" && type !== "SHORT_TEXT") {
      req.session.flash = { type: "error", message: "Invalid question type" };
      return res.redirect(
        `/instructor/courses/${course.id}/assessments/${assessment.id}/questions/new`
      );
    }

    let options = null;
    let correctOptionIndex = null;
    let gradingKeywords = null;

    if (type === "MULTIPLE_CHOICE") {
      const optionValues = [0, 1, 2, 3].map((index) =>
        String(req.body[`option${index}`] || "").trim()
      );

      if (optionValues.some((value) => !value)) {
        req.session.flash = {
          type: "error",
          message: "All 4 options are required",
        };
        return res.redirect(
          `/instructor/courses/${course.id}/assessments/${assessment.id}/questions/new`
        );
      }

      const parsedIndex = Number.parseInt(req.body.correctOptionIndex, 10);

      if (Number.isNaN(parsedIndex) || parsedIndex < 0 || parsedIndex > 3) {
        req.session.flash = {
          type: "error",
          message: "Correct option must be selected",
        };
        return res.redirect(
          `/instructor/courses/${course.id}/assessments/${assessment.id}/questions/new`
        );
      }

      options = optionValues;
      correctOptionIndex = parsedIndex;
    }

    if (type === "SHORT_TEXT") {
      const parsedKeywords = String(req.body.gradingKeywords || "")
        .split(",")
        .map((keyword) => keyword.trim().toLowerCase())
        .filter(Boolean);

      if (parsedKeywords.length === 0) {
        req.session.flash = {
          type: "error",
          message:
            "At least one grading keyword is required for short text questions",
        };
        return res.redirect(
          `/instructor/courses/${course.id}/assessments/${assessment.id}/questions/new`
        );
      }

      gradingKeywords = parsedKeywords;
    }

    const maxPosition = await prisma.assessmentQuestion.aggregate({
      where: { assessmentId: assessment.id },
      _max: { position: true },
    });

    const nextPosition = (maxPosition._max.position ?? 0) + 1;

    await prisma.assessmentQuestion.create({
      data: {
        assessmentId: assessment.id,
        prompt,
        type,
        options,
        correctOptionIndex,
        gradingKeywords,
        position: nextPosition,
      },
    });

    req.session.flash = { type: "success", message: "Question added" };

    return res.redirect(
      `/instructor/courses/${course.id}/assessments/${assessment.id}`
    );
  } catch (err) {
    return next(err);
  }
};

export const deleteAssessmentQuestion = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;
    const { courseId, assessmentId, questionId } = req.params;

    const course = await getInstructorCourse(courseId, instructorId);

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/instructor/courses");
    }

    const assessment = await getCourseAssessment(course.id, assessmentId);

    if (!assessment) {
      req.session.flash = { type: "error", message: "Assessment not found" };
      return res.redirect(`/instructor/courses/${course.id}/assessments`);
    }

    const question = await prisma.assessmentQuestion.findFirst({
      where: { id: questionId, assessmentId: assessment.id },
      select: { id: true },
    });

    if (!question) {
      req.session.flash = { type: "error", message: "Question not found" };
      return res.redirect(
        `/instructor/courses/${course.id}/assessments/${assessment.id}`
      );
    }

    await prisma.assessmentQuestion.delete({
      where: { id: question.id },
    });

    req.session.flash = { type: "success", message: "Question deleted" };

    return res.redirect(
      `/instructor/courses/${course.id}/assessments/${assessment.id}`
    );
  } catch (err) {
    return next(err);
  }
};

export const editCourseAssessmentForm = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;
    const { courseId, assessmentId } = req.params;

    const course = await getInstructorCourse(courseId, instructorId);

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/instructor/courses");
    }

    const assessment = await prisma.assessment.findFirst({
      where: { id: assessmentId, courseId: course.id },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        maxScore: true,
      },
    });

    if (!assessment) {
      req.session.flash = { type: "error", message: "Assessment not found" };
      return res.redirect(`/instructor/courses/${course.id}/assessments`);
    }

    return res.render("instructor/assessments/edit", {
      user: req.session.user,
      course,
      assessment,
      flash: getFlash(req),
    });
  } catch (err) {
    return next(err);
  }
};

export const updateCourseAssessment = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;
    const { courseId, assessmentId } = req.params;

    const course = await getInstructorCourse(courseId, instructorId);

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/instructor/courses");
    }

    const existingAssessment = await prisma.assessment.findFirst({
      where: { id: assessmentId, courseId: course.id },
      select: { id: true },
    });

    if (!existingAssessment) {
      req.session.flash = { type: "error", message: "Assessment not found" };
      return res.redirect(`/instructor/courses/${course.id}/assessments`);
    }

    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const type = String(req.body.type || "CONTINUOUS").trim();
    const parsedMaxScore = Number.parseInt(req.body.maxScore, 10);

    if (!title) {
      req.session.flash = {
        type: "error",
        message: "Assessment title is required",
      };
      return res.redirect(
        `/instructor/courses/${course.id}/assessments/${assessmentId}/edit`
      );
    }

    if (!isValidAssessmentType(type)) {
      req.session.flash = {
        type: "error",
        message: "Invalid assessment type selected",
      };
      return res.redirect(
        `/instructor/courses/${course.id}/assessments/${assessmentId}/edit`
      );
    }

    if (Number.isNaN(parsedMaxScore) || parsedMaxScore < 1) {
      req.session.flash = {
        type: "error",
        message: "Max score must be a positive number",
      };
      return res.redirect(
        `/instructor/courses/${course.id}/assessments/${assessmentId}/edit`
      );
    }

    if (type === "MID_PROGRAMME" || type === "FINAL_CAPSTONE") {
      const conflictingAssessment = await prisma.assessment.findFirst({
        where: {
          courseId: course.id,
          type,
          NOT: { id: assessmentId },
        },
        select: { id: true },
      });

      if (conflictingAssessment) {
        req.session.flash = {
          type: "error",
          message:
            type === "MID_PROGRAMME"
              ? "This course already has a Mid-Programme assessment"
              : "This course already has a Final Capstone assessment",
        };
        return res.redirect(
          `/instructor/courses/${course.id}/assessments/${assessmentId}/edit`
        );
      }
    }

    await prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        title,
        description: description || null,
        type,
        categoryWeight: ASSESSMENT_WEIGHTS[type],
        maxScore: parsedMaxScore,
      },
    });

    req.session.flash = {
      type: "success",
      message: "Assessment updated",
    };

    return res.redirect(`/instructor/courses/${course.id}/assessments`);
  } catch (err) {
    return next(err);
  }
};

export const deleteCourseAssessment = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;
    const { courseId, assessmentId } = req.params;

    const course = await getInstructorCourse(courseId, instructorId);

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/instructor/courses");
    }

    const assessment = await prisma.assessment.findFirst({
      where: { id: assessmentId, courseId: course.id },
      select: { id: true },
    });

    if (!assessment) {
      req.session.flash = { type: "error", message: "Assessment not found" };
      return res.redirect(`/instructor/courses/${course.id}/assessments`);
    }

    await prisma.assessment.delete({
      where: { id: assessment.id },
    });
    await syncCourseStatusFromContent(course.id);

    req.session.flash = {
      type: "success",
      message: "Assessment deleted",
    };

    return res.redirect(`/instructor/courses/${course.id}/assessments`);
  } catch (err) {
    return next(err);
  }
};

export const publishCourseAssessment = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;
    const { courseId, assessmentId } = req.params;

    const course = await getInstructorCourse(courseId, instructorId);

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/instructor/courses");
    }

    const assessment = await prisma.assessment.findFirst({
      where: { id: assessmentId, courseId: course.id },
      select: { id: true, published: true },
    });

    if (!assessment) {
      req.session.flash = { type: "error", message: "Assessment not found" };
      return res.redirect(`/instructor/courses/${course.id}/assessments`);
    }

    if (assessment.published) {
      req.session.flash = {
        type: "info",
        message: "Assessment is already published",
      };
      return res.redirect(`/instructor/courses/${course.id}/assessments`);
    }

    await prisma.assessment.update({
      where: { id: assessment.id },
      data: { published: true },
    });
    await syncCourseStatusFromContent(course.id);

    req.session.flash = {
      type: "success",
      message: "Assessment published",
    };

    return res.redirect(`/instructor/courses/${course.id}/assessments`);
  } catch (err) {
    return next(err);
  }
};

export const unpublishCourseAssessment = async (req, res, next) => {
  try {
    const instructorId = req.session.user.id;
    const { courseId, assessmentId } = req.params;

    const course = await getInstructorCourse(courseId, instructorId);

    if (!course) {
      req.session.flash = { type: "error", message: "Course not found" };
      return res.redirect("/instructor/courses");
    }

    const assessment = await prisma.assessment.findFirst({
      where: { id: assessmentId, courseId: course.id },
      select: { id: true, published: true },
    });

    if (!assessment) {
      req.session.flash = { type: "error", message: "Assessment not found" };
      return res.redirect(`/instructor/courses/${course.id}/assessments`);
    }

    if (!assessment.published) {
      req.session.flash = {
        type: "info",
        message: "Assessment is already unpublished",
      };
      return res.redirect(`/instructor/courses/${course.id}/assessments`);
    }

    await prisma.assessment.update({
      where: { id: assessment.id },
      data: { published: false },
    });
    await syncCourseStatusFromContent(course.id);

    req.session.flash = {
      type: "success",
      message: "Assessment unpublished",
    };

    return res.redirect(`/instructor/courses/${course.id}/assessments`);
  } catch (err) {
    return next(err);
  }
};
