-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardedAt" TIMESTAMP(3),
ADD COLUMN     "primaryGoal" TEXT,
ADD COLUMN     "sampleLoadedAt" TIMESTAMP(3),
ADD COLUMN     "tradingPlatform" TEXT;

-- AlterTable
ALTER TABLE "Strategy" ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxDailyLossPct" DECIMAL(8,4),
ADD COLUMN     "maxOpenPositions" INTEGER,
ADD COLUMN     "riskPerTradePct" DECIMAL(8,4);

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TradePlan" ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sizing" JSONB;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false;
