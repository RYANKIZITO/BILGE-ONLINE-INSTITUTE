-- Add new enum values for AssessmentType
ALTER TYPE "AssessmentType" ADD VALUE 'MID_PROGRAMME';
ALTER TYPE "AssessmentType" ADD VALUE 'FINAL_CAPSTONE';

-- Add categoryWeight and maxScore to Assessment
ALTER TABLE "Assessment"
ADD COLUMN "categoryWeight" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "maxScore" INTEGER NOT NULL DEFAULT 100;
