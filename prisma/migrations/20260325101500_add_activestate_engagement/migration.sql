CREATE TYPE "LiveSessionType" AS ENUM ('MID_WEEK', 'END_WEEK');
CREATE TYPE "LiveSessionStatus" AS ENUM ('SCHEDULED', 'HOSTED', 'MISSED', 'CANCELLED');
CREATE TYPE "CourseQuestionStatus" AS ENUM ('PENDING', 'ANSWERED', 'RESOLVED');
CREATE TYPE "CommunityContributionType" AS ENUM ('POST', 'COMMENT');

CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "sessionType" "LiveSessionType" NOT NULL,
    "status" "LiveSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledStartTime" TIMESTAMP(3) NOT NULL,
    "actualStartTime" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "hostConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseQuestion" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "responderId" TEXT,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "status" "CourseQuestionStatus" NOT NULL DEFAULT 'PENDING',
    "answerContent" TEXT,
    "answeredAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscussionContribution" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "type" "CommunityContributionType" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscussionContribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LiveSession_courseId_sessionType_scheduledStartTime_key" ON "LiveSession"("courseId", "sessionType", "scheduledStartTime");
CREATE INDEX "LiveSession_instructorId_scheduledStartTime_idx" ON "LiveSession"("instructorId", "scheduledStartTime");
CREATE INDEX "LiveSession_courseId_scheduledStartTime_idx" ON "LiveSession"("courseId", "scheduledStartTime");
CREATE INDEX "LiveSession_status_scheduledStartTime_idx" ON "LiveSession"("status", "scheduledStartTime");

CREATE INDEX "CourseQuestion_courseId_status_createdAt_idx" ON "CourseQuestion"("courseId", "status", "createdAt");
CREATE INDEX "CourseQuestion_authorId_createdAt_idx" ON "CourseQuestion"("authorId", "createdAt");
CREATE INDEX "CourseQuestion_responderId_answeredAt_idx" ON "CourseQuestion"("responderId", "answeredAt");

CREATE INDEX "DiscussionContribution_courseId_createdAt_idx" ON "DiscussionContribution"("courseId", "createdAt");
CREATE INDEX "DiscussionContribution_authorId_createdAt_idx" ON "DiscussionContribution"("authorId", "createdAt");
CREATE INDEX "DiscussionContribution_parentId_idx" ON "DiscussionContribution"("parentId");

ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourseQuestion" ADD CONSTRAINT "CourseQuestion_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseQuestion" ADD CONSTRAINT "CourseQuestion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseQuestion" ADD CONSTRAINT "CourseQuestion_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DiscussionContribution" ADD CONSTRAINT "DiscussionContribution_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscussionContribution" ADD CONSTRAINT "DiscussionContribution_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscussionContribution" ADD CONSTRAINT "DiscussionContribution_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DiscussionContribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
