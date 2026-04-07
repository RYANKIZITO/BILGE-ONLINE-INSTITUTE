CREATE TYPE "EnrollmentRefundReviewStatus" AS ENUM (
    'NOT_APPLICABLE',
    'PENDING_REVIEW',
    'APPROVED',
    'DECLINED'
);

ALTER TABLE "EnrollmentCancellation"
ADD COLUMN "paymentId" TEXT,
ADD COLUMN "refundReviewStatus" "EnrollmentRefundReviewStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
ADD COLUMN "refundRecommended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "refundAmount" DOUBLE PRECISION,
ADD COLUMN "refundCurrency" TEXT,
ADD COLUMN "refundDecisionNote" TEXT,
ADD COLUMN "reviewedByUserId" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3);

CREATE INDEX "EnrollmentCancellation_refundReviewStatus_createdAt_idx"
ON "EnrollmentCancellation"("refundReviewStatus", "createdAt");

CREATE INDEX "EnrollmentCancellation_reviewedByUserId_idx"
ON "EnrollmentCancellation"("reviewedByUserId");

ALTER TABLE "EnrollmentCancellation"
ADD CONSTRAINT "EnrollmentCancellation_paymentId_fkey"
FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EnrollmentCancellation"
ADD CONSTRAINT "EnrollmentCancellation_reviewedByUserId_fkey"
FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
