ALTER TABLE "EnrollmentCancellation"
ADD COLUMN "topUpPaymentId" TEXT,
ADD COLUMN "providerAdjustmentReference" TEXT,
ADD COLUMN "providerAdjustmentStatus" TEXT,
ADD COLUMN "providerAdjustmentProcessedAt" TIMESTAMP(3);

ALTER TABLE "EnrollmentCancellation"
ADD CONSTRAINT "EnrollmentCancellation_topUpPaymentId_fkey"
FOREIGN KEY ("topUpPaymentId") REFERENCES "Payment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "EnrollmentCancellation_topUpPaymentId_idx"
ON "EnrollmentCancellation"("topUpPaymentId");
