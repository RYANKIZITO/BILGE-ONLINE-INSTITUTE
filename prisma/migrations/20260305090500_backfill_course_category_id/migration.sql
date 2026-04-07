-- Backfill Category rows from legacy Course.category values.
INSERT INTO "Category" ("id", "name")
SELECT 'cat_' || md5(btrim("category")), btrim("category")
FROM "Course"
WHERE "category" IS NOT NULL AND btrim("category") <> ''
ON CONFLICT ("name") DO NOTHING;

-- Populate Course.categoryId using Category.name.
UPDATE "Course" AS c
SET "categoryId" = cat."id"
FROM "Category" AS cat
WHERE c."categoryId" IS NULL
  AND c."category" IS NOT NULL
  AND btrim(c."category") <> ''
  AND cat."name" = btrim(c."category");

-- Safety check: abort if any Course is missing categoryId.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Course" WHERE "categoryId" IS NULL) THEN
    RAISE EXCEPTION 'Backfill failed: at least one Course is missing categoryId.';
  END IF;
END $$;

-- Enforce NOT NULL and FK, then drop legacy column.
ALTER TABLE "Course" ALTER COLUMN "categoryId" SET NOT NULL;

ALTER TABLE "Course"
  ADD CONSTRAINT "Course_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Course" DROP COLUMN "category";
