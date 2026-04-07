-- Drop the global uniqueness rule so one student can use the same student code
-- as the certificate number across multiple course certificates.
DROP INDEX IF EXISTS "Certificate_certificateNumber_key";

-- Align existing certificates to the owning student's system-generated student code.
UPDATE "Certificate" AS c
SET "certificateNumber" = u."studentCode"
FROM "User" AS u
WHERE c."userId" = u."id"
  AND u."studentCode" IS NOT NULL
  AND c."certificateNumber" IS DISTINCT FROM u."studentCode";
