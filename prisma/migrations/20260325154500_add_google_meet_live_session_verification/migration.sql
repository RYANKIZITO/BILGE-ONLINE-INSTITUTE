CREATE TYPE "LiveSessionVerificationStatus" AS ENUM ('MANUAL_ONLY', 'PENDING', 'VERIFIED', 'UNVERIFIED');

ALTER TABLE "LiveSession"
ADD COLUMN "meetingProvider" TEXT,
ADD COLUMN "meetingUrl" TEXT,
ADD COLUMN "meetingCode" TEXT,
ADD COLUMN "googleMeetSpaceName" TEXT,
ADD COLUMN "googleMeetOrganizerEmail" TEXT,
ADD COLUMN "providerConferenceName" TEXT,
ADD COLUMN "verificationStatus" "LiveSessionVerificationStatus" NOT NULL DEFAULT 'MANUAL_ONLY',
ADD COLUMN "verificationCheckedAt" TIMESTAMP(3),
ADD COLUMN "providerVerifiedAt" TIMESTAMP(3),
ADD COLUMN "providerParticipantCount" INTEGER,
ADD COLUMN "providerEvidence" JSONB;

CREATE INDEX "LiveSession_verificationStatus_scheduledStartTime_idx" ON "LiveSession"("verificationStatus", "scheduledStartTime");
CREATE INDEX "LiveSession_googleMeetSpaceName_idx" ON "LiveSession"("googleMeetSpaceName");
