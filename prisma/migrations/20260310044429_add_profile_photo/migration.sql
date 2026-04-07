/*
  Warnings:

  - You are about to drop the `session` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[assessmentId,studentId,attempt]` on the table `AssessmentSubmission` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "AssessmentSubmission_assessmentId_studentId_key";

-- AlterTable
ALTER TABLE "AssessmentQuestion" ADD COLUMN     "gradingKeywords" JSONB;

-- AlterTable
ALTER TABLE "AssessmentSubmission" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "docxUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "profilePhotoUrl" TEXT;

-- DropTable
DROP TABLE "session";

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentSubmission_assessmentId_studentId_attempt_key" ON "AssessmentSubmission"("assessmentId", "studentId", "attempt");
