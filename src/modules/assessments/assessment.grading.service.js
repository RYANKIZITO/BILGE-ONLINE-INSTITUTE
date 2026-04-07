import { prisma } from "../../config/prisma.js";

const clampScore = (score, maxScore) => {
  if (!Number.isFinite(maxScore) || maxScore <= 0) {
    return { score: 0, maxScore: 0 };
  }

  const safeScore = Number.isFinite(score) ? score : 0;
  const clamped = Math.min(Math.max(safeScore, 0), maxScore);

  return { score: clamped, maxScore };
};

const percentFromScore = (score, maxScore) =>
  maxScore > 0 ? (score / maxScore) * 100 : 0;

export const computeFinalCourseMark = async (courseId, studentId) => {
  const assessments = await prisma.assessment.findMany({
    where: { courseId },
    select: {
      id: true,
      type: true,
      maxScore: true,
    },
  });

  if (!assessments.length) {
    return {
      continuousPercent: 0,
      continuousWeighted: 0,
      midPercent: 0,
      midWeighted: 0,
      finalCapstonePercent: 0,
      finalCapstoneWeighted: 0,
      finalCourseMark: 0,
    };
  }

  const submissions = await prisma.assessmentSubmission.findMany({
    where: {
      studentId,
      assessment: { courseId },
    },
    select: {
      assessmentId: true,
      score: true,
      attempt: true,
    },
  });

  const bestSubmissionByAssessment = new Map();

  for (const submission of submissions) {
    const existing = bestSubmissionByAssessment.get(submission.assessmentId);

    if (!existing || (submission.score ?? 0) > (existing.score ?? 0)) {
      bestSubmissionByAssessment.set(submission.assessmentId, submission);
    }
  }

  let continuousScoreTotal = 0;
  let continuousMaxTotal = 0;
  let midPercent = 0;
  let finalCapstonePercent = 0;

  assessments.forEach((assessment) => {
    const submission = bestSubmissionByAssessment.get(assessment.id);

    const { score, maxScore } = clampScore(
      submission?.score ?? 0,
      assessment.maxScore
    );

    if (assessment.type === "CONTINUOUS") {
      continuousScoreTotal += score;
      continuousMaxTotal += maxScore;
      return;
    }

    if (assessment.type === "MID_PROGRAMME") {
      midPercent = percentFromScore(score, maxScore);
      return;
    }

    if (assessment.type === "FINAL_CAPSTONE") {
      finalCapstonePercent = percentFromScore(score, maxScore);
    }
  });

  const continuousPercent =
    continuousMaxTotal > 0
      ? percentFromScore(continuousScoreTotal, continuousMaxTotal)
      : 0;

  const continuousWeighted = continuousPercent * 0.3;
  const midWeighted = midPercent * 0.2;
  const finalCapstoneWeighted = finalCapstonePercent * 0.5;
  const finalCourseMark =
    continuousWeighted + midWeighted + finalCapstoneWeighted;

  return {
    continuousPercent,
    continuousWeighted,
    midPercent,
    midWeighted,
    finalCapstonePercent,
    finalCapstoneWeighted,
    finalCourseMark,
  };
};