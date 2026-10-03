-- CreateEnum
CREATE TYPE "TradingSessionStatus" AS ENUM ('active', 'completed', 'abandoned');

-- CreateTable
CREATE TABLE "TradingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TradingSessionStatus" NOT NULL DEFAULT 'active',
    "market" "MarketType" NOT NULL,
    "sessionLabel" TEXT NOT NULL,
    "emotionalState" TEXT,
    "maxDailyLoss" DECIMAL(8,4),
    "allowedStrategyIds" TEXT[],
    "mistakeToAvoid" TEXT,
    "notes" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradingSession_userId_idx" ON "TradingSession"("userId");

-- CreateIndex
CREATE INDEX "TradingSession_status_idx" ON "TradingSession"("status");

-- CreateIndex
CREATE INDEX "TradingSession_startedAt_idx" ON "TradingSession"("startedAt");

-- AddForeignKey
ALTER TABLE "TradingSession" ADD CONSTRAINT "TradingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
