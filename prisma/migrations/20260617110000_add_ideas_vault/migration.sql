CREATE TYPE "IdeaType" AS ENUM (
  'market_observation',
  'setup_idea',
  'strategy_improvement',
  'risk_rule_idea',
  'lesson_learned',
  'backtest_idea',
  'news_context_note'
);

CREATE TYPE "IdeaStatus" AS ENUM (
  'draft',
  'watching',
  'tested',
  'converted_to_plan',
  'archived'
);

CREATE TABLE "Idea" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "market" "MarketType" NOT NULL,
  "symbols" TEXT[] NOT NULL,
  "type" "IdeaType" NOT NULL,
  "status" "IdeaStatus" NOT NULL DEFAULT 'draft',
  "thesis" TEXT NOT NULL,
  "invalidation" TEXT,
  "relatedStrategyId" TEXT,
  "relatedWatchlistSymbol" TEXT,
  "relatedNewsContext" TEXT,
  "confidence" INTEGER NOT NULL DEFAULT 5,
  "tags" TEXT[] NOT NULL,
  "convertedTradePlanId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Idea_userId_idx" ON "Idea"("userId");
CREATE INDEX "Idea_market_idx" ON "Idea"("market");
CREATE INDEX "Idea_type_idx" ON "Idea"("type");
CREATE INDEX "Idea_status_idx" ON "Idea"("status");
CREATE INDEX "Idea_createdAt_idx" ON "Idea"("createdAt");

ALTER TABLE "Idea" ADD CONSTRAINT "Idea_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Idea" ADD CONSTRAINT "Idea_relatedStrategyId_fkey"
  FOREIGN KEY ("relatedStrategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Idea" ADD CONSTRAINT "Idea_convertedTradePlanId_fkey"
  FOREIGN KEY ("convertedTradePlanId") REFERENCES "TradePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
