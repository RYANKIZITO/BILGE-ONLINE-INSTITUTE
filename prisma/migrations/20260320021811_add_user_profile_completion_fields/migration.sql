-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fullName" TEXT,
ADD COLUMN     "nationalIdNumber" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "profileCompleted" BOOLEAN NOT NULL DEFAULT false;
