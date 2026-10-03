-- CreateEnum
CREATE TYPE "ReviewType" AS ENUM ('daily', 'weekly', 'mistake', 'risk', 'strategy');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('open', 'completed', 'skipped');

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ReviewType" NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'open',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "checklist" JSONB NOT NULL,
    "metrics" JSONB,
    "insights" TEXT[],
    "risks" TEXT[],
    "lessons" TEXT[],
    "nextActions" TEXT[],
    "linkedTradeIds" TEXT[],
    "linkedStrategyIds" TEXT[],
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Review_userId_idx" ON "Review"("userId");

-- CreateIndex
CREATE INDEX "Review_type_idx" ON "Review"("type");

-- CreateIndex
CREATE INDEX "Review_status_idx" ON "Review"("status");

-- CreateIndex
CREATE INDEX "Review_periodStart_periodEnd_idx" ON "Review"("periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
