CREATE TYPE "EnrollmentCancellationReasonOption" AS ENUM (
    'SCHEDULE_CONFLICT',
    'FINANCIAL_CONSTRAINTS',
    'COURSE_NOT_RIGHT',
    'NO_LONGER_INTERESTED',
    'TECHNICAL_DIFFICULTIES',
    'DUPLICATE_ENROLLMENT',
    'OTHER'
);

CREATE TABLE "EnrollmentCancellation" (
    "id" TEXT NOT NULL,
    "previousEnrollmentId" TEXT,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "reasonOption" "EnrollmentCancellationReasonOption" NOT NULL,
    "reasonText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentCancellation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EnrollmentCancellation_userId_createdAt_idx" ON "EnrollmentCancellation"("userId", "createdAt");
CREATE INDEX "EnrollmentCancellation_courseId_createdAt_idx" ON "EnrollmentCancellation"("courseId", "createdAt");
CREATE INDEX "EnrollmentCancellation_createdAt_idx" ON "EnrollmentCancellation"("createdAt");

ALTER TABLE "EnrollmentCancellation"
ADD CONSTRAINT "EnrollmentCancellation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EnrollmentCancellation"
ADD CONSTRAINT "EnrollmentCancellation_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
