-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
