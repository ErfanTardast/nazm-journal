-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('free', 'pro', 'elite');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tier" "Tier" NOT NULL DEFAULT 'free',
ADD COLUMN     "tierExpiresAt" TIMESTAMP(3);

