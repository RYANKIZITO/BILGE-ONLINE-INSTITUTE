-- AlterTable
ALTER TABLE "User"
ADD COLUMN "studentCode" TEXT;

-- Backfill existing students in creation order
WITH ordered_students AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS seq,
    COALESCE(
      NULLIF(
        regexp_replace(
          split_part(lower(trim(COALESCE("fullName", name, 'student'))), ' ', 1),
          '[^a-z0-9]+',
          '',
          'g'
        ),
        ''
      ),
      'student'
    ) AS first_name
  FROM "User"
  WHERE role = 'STUDENT'
)
UPDATE "User" AS u
SET "studentCode" = 'BOI/' || lpad(ordered_students.seq::text, 9, '0') || '/' || ordered_students.first_name
FROM ordered_students
WHERE u.id = ordered_students.id;

-- CreateIndex
CREATE UNIQUE INDEX "User_studentCode_key" ON "User"("studentCode");
