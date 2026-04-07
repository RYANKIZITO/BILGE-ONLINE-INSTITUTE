ALTER TYPE "EnrollmentCancellationReasonOption"
ADD VALUE IF NOT EXISTS 'WANTS_TO_SWITCH_PROGRAM';

ALTER TYPE "EnrollmentRefundReviewStatus"
ADD VALUE IF NOT EXISTS 'SWITCH_APPROVED';

ALTER TABLE "EnrollmentCancellation"
ADD COLUMN "requestedTargetCourseId" TEXT;

CREATE INDEX "EnrollmentCancellation_requestedTargetCourseId_idx"
ON "EnrollmentCancellation"("requestedTargetCourseId");

ALTER TABLE "EnrollmentCancellation"
ADD CONSTRAINT "EnrollmentCancellation_requestedTargetCourseId_fkey"
FOREIGN KEY ("requestedTargetCourseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
