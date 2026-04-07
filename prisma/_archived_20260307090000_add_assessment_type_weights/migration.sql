-- Add new enum values for AssessmentType
ALTER TYPE "AssessmentType" ADD VALUE 'MID_PROGRAMME';
ALTER TYPE "AssessmentType" ADD VALUE 'FINAL_CAPSTONE';

-- Add categoryWeight and maxScore to Assessment
ALTER TABLE "Assessment"
ADD COLUMN "categoryWeight" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "maxScore" INTEGER NOT NULL DEFAULT 100;

-- Enforce only one MID_PROGRAMME per course
CREATE UNIQUE INDEX "Assessment_course_mid_programme_unique"
ON "Assessment" ("courseId")
WHERE ("type" = 'MID_PROGRAMME');

-- Enforce only one FINAL_CAPSTONE per course
CREATE UNIQUE INDEX "Assessment_course_final_capstone_unique"
ON "Assessment" ("courseId")
WHERE ("type" = 'FINAL_CAPSTONE');
