CREATE TYPE "EnrollmentSwitchFinancialDirection" AS ENUM (
    'NOT_APPLICABLE',
    'EVEN_TRANSFER',
    'TOP_UP_REQUIRED',
    'CREDIT_DUE',
    'MANUAL_REVIEW'
);

ALTER TYPE "EnrollmentRefundReviewStatus" ADD VALUE 'SWITCH_TOP_UP_REQUIRED';

ALTER TABLE "EnrollmentCancellation"
ADD COLUMN "switchFinancialDirection" "EnrollmentSwitchFinancialDirection" NOT NULL DEFAULT 'NOT_APPLICABLE',
ADD COLUMN "switchPricingTier" TEXT,
ADD COLUMN "sourceCourseFee" DOUBLE PRECISION,
ADD COLUMN "targetCourseFee" DOUBLE PRECISION,
ADD COLUMN "switchTransferAmount" DOUBLE PRECISION,
ADD COLUMN "switchBalanceAmount" DOUBLE PRECISION,
ADD COLUMN "switchPricingCurrency" TEXT;
