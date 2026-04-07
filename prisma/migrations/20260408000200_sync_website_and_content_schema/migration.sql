DO $$
BEGIN
  CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ContactMessageStatus" AS ENUM ('NEW', 'READ', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP INDEX IF EXISTS "EnrollmentCancellation_topUpPaymentId_idx";

ALTER TABLE "Course"
ADD COLUMN IF NOT EXISTS "estimatedDuration" TEXT,
ADD COLUMN IF NOT EXISTS "featuredOnWebsite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "level" TEXT,
ADD COLUMN IF NOT EXISTS "seoDescription" TEXT,
ADD COLUMN IF NOT EXISTS "seoTitle" TEXT,
ADD COLUMN IF NOT EXISTS "shortDescription" TEXT;

ALTER TABLE "Page"
ADD COLUMN IF NOT EXISTS "excerpt" TEXT,
ADD COLUMN IF NOT EXISTS "heroSubtitle" TEXT,
ADD COLUMN IF NOT EXISTS "heroTitle" TEXT,
ADD COLUMN IF NOT EXISTS "metaDescription" TEXT,
ADD COLUMN IF NOT EXISTS "metaTitle" TEXT,
ADD COLUMN IF NOT EXISTS "published" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "sections" JSONB;

CREATE TABLE IF NOT EXISTS "SiteSetting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InstructorProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "headline" TEXT,
  "shortBio" TEXT,
  "longBio" TEXT,
  "expertise" JSONB,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "linkedinUrl" TEXT,
  "twitterUrl" TEXT,
  "websiteUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InstructorProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Testimonial" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "quote" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT,
  "organization" TEXT,
  "profilePhotoUrl" TEXT,
  "resultHighlight" TEXT,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "status" "ContentStatus" NOT NULL DEFAULT 'PUBLISHED',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FAQ" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "category" TEXT,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "status" "ContentStatus" NOT NULL DEFAULT 'PUBLISHED',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FAQ_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BlogCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BlogCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BlogPost" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "featuredImageUrl" TEXT,
  "authorName" TEXT NOT NULL,
  "metaTitle" TEXT,
  "metaDescription" TEXT,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "status" "ContentStatus" NOT NULL DEFAULT 'PUBLISHED',
  "publishedAt" TIMESTAMP(3),
  "categoryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ContactMessage" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "subject" TEXT,
  "interestArea" TEXT,
  "message" TEXT NOT NULL,
  "website" TEXT,
  "status" "ContactMessageStatus" NOT NULL DEFAULT 'NEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "session" (
  "sid" VARCHAR(255) NOT NULL,
  "sess" JSONB NOT NULL,
  "expire" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SiteSetting_key_key" ON "SiteSetting"("key");
CREATE UNIQUE INDEX IF NOT EXISTS "InstructorProfile_userId_key" ON "InstructorProfile"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "InstructorProfile_slug_key" ON "InstructorProfile"("slug");
CREATE INDEX IF NOT EXISTS "InstructorProfile_visible_featured_idx" ON "InstructorProfile"("visible", "featured");
CREATE UNIQUE INDEX IF NOT EXISTS "Testimonial_slug_key" ON "Testimonial"("slug");
CREATE INDEX IF NOT EXISTS "Testimonial_status_featured_sortOrder_idx" ON "Testimonial"("status", "featured", "sortOrder");
CREATE UNIQUE INDEX IF NOT EXISTS "FAQ_slug_key" ON "FAQ"("slug");
CREATE INDEX IF NOT EXISTS "FAQ_status_featured_sortOrder_idx" ON "FAQ"("status", "featured", "sortOrder");
CREATE INDEX IF NOT EXISTS "FAQ_category_status_sortOrder_idx" ON "FAQ"("category", "status", "sortOrder");
CREATE UNIQUE INDEX IF NOT EXISTS "BlogCategory_slug_key" ON "BlogCategory"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "BlogCategory_name_key" ON "BlogCategory"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "BlogPost_slug_key" ON "BlogPost"("slug");
CREATE INDEX IF NOT EXISTS "BlogPost_status_featured_publishedAt_idx" ON "BlogPost"("status", "featured", "publishedAt");
CREATE INDEX IF NOT EXISTS "BlogPost_categoryId_status_publishedAt_idx" ON "BlogPost"("categoryId", "status", "publishedAt");
CREATE INDEX IF NOT EXISTS "ContactMessage_status_createdAt_idx" ON "ContactMessage"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "ContactMessage_email_createdAt_idx" ON "ContactMessage"("email", "createdAt");
CREATE INDEX IF NOT EXISTS "session_expire_idx" ON "session"("expire");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'InstructorProfile_userId_fkey'
  ) THEN
    ALTER TABLE "InstructorProfile"
    ADD CONSTRAINT "InstructorProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'BlogPost_categoryId_fkey'
  ) THEN
    ALTER TABLE "BlogPost"
    ADD CONSTRAINT "BlogPost_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "BlogCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
