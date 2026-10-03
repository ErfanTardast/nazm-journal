-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('en', 'fa');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('dark', 'light', 'system');

-- CreateEnum
CREATE TYPE "MarketType" AS ENUM ('crypto', 'forex', 'stocks');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('long', 'short');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('open', 'closed', 'planned', 'canceled');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('price', 'indicator', 'risk', 'journal_reminder', 'daily_review', 'weekly_review');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('active', 'triggered', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'email', 'telegram', 'discord', 'webhook');

-- CreateEnum
CREATE TYPE "TradePlanStatus" AS ENUM ('planned', 'active', 'closed', 'canceled');

-- CreateEnum
CREATE TYPE "RuleFollowStatus" AS ENUM ('followed', 'broken', 'mixed', 'unknown');

-- CreateEnum
CREATE TYPE "TradeImportStatus" AS ENUM ('preview', 'imported', 'failed');

-- CreateEnum
CREATE TYPE "NewsCategory" AS ENUM ('macro', 'central_bank', 'inflation', 'employment', 'crypto_regulation', 'exchange_event', 'earnings', 'company_news', 'geopolitical', 'risk_event', 'other');

-- CreateEnum
CREATE TYPE "ImportanceLevel" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "AiMode" AS ENUM ('professional_coach', 'learning');

-- CreateEnum
CREATE TYPE "LearningTemplateType" AS ENUM ('journal_prompt', 'strategy_checklist', 'mistake_review', 'weekly_review', 'risk_explanation');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "theme" "Theme" NOT NULL DEFAULT 'dark',
    "riskPerTradePct" DECIMAL(8,4) NOT NULL DEFAULT 1.0,
    "maxDailyLossPct" DECIMAL(8,4) NOT NULL DEFAULT 3.0,
    "maxWeeklyLossPct" DECIMAL(8,4) NOT NULL DEFAULT 6.0,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "accessTokenHash" TEXT,
    "refreshTokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" "MarketType" NOT NULL,
    "baseAsset" TEXT,
    "quoteAsset" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL,
    "watchlistId" TEXT NOT NULL,
    "assetId" TEXT,
    "symbol" TEXT NOT NULL,
    "market" "MarketType" NOT NULL,
    "notes" TEXT,
    "strategyNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SymbolNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT,
    "symbol" TEXT NOT NULL,
    "market" "MarketType" NOT NULL,
    "notes" TEXT NOT NULL,
    "strategySuitability" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SymbolNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "cashBalance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioHolding" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "quantity" DECIMAL(28,10) NOT NULL DEFAULT 0,
    "averageEntry" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "realizedPnl" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioHolding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioTransaction" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "quantity" DECIMAL(28,10) NOT NULL,
    "price" DECIMAL(18,6) NOT NULL,
    "fees" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entryRules" JSONB NOT NULL,
    "exitRules" JSONB NOT NULL,
    "invalidationRules" JSONB NOT NULL,
    "riskRules" JSONB NOT NULL,
    "allowedMarkets" "MarketType"[],
    "timeframes" TEXT[],
    "allowedSessions" TEXT[],
    "checklist" TEXT[],
    "commonMistakes" TEXT[],
    "idealMarketConditions" TEXT[],
    "tags" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyVersion" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changeNote" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioId" TEXT,
    "assetId" TEXT,
    "strategyId" TEXT,
    "tradeImportRowId" TEXT,
    "symbol" TEXT NOT NULL,
    "market" "MarketType" NOT NULL,
    "side" "TradeSide" NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'open',
    "entryPrice" DECIMAL(18,6) NOT NULL,
    "exitPrice" DECIMAL(18,6),
    "stopLoss" DECIMAL(18,6),
    "takeProfit" DECIMAL(18,6),
    "quantity" DECIMAL(28,10) NOT NULL,
    "riskAmount" DECIMAL(18,6),
    "riskPercent" DECIMAL(8,4),
    "rMultiple" DECIMAL(12,4),
    "realizedPnl" DECIMAL(18,6),
    "fees" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "session" TEXT,
    "setupType" TEXT,
    "confidenceScore" INTEGER,
    "preTradeNotes" TEXT,
    "postTradeNotes" TEXT,
    "lessonsLearned" TEXT,
    "ruleFollowed" "RuleFollowStatus" NOT NULL DEFAULT 'unknown',
    "outcome" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeJournalEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "emotionalState" TEXT,
    "mistakes" TEXT[],
    "tags" TEXT[],
    "notes" TEXT,
    "preTradeNotes" TEXT,
    "postTradeNotes" TEXT,
    "lessonsLearned" TEXT,
    "ruleFollowed" "RuleFollowStatus" NOT NULL DEFAULT 'unknown',
    "review" TEXT,
    "screenshotUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'trademaster_csv',
    "status" "TradeImportStatus" NOT NULL DEFAULT 'preview',
    "mapping" JSONB NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeImportRow" (
    "id" TEXT NOT NULL,
    "tradeImportId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "mappedData" JSONB,
    "isValid" BOOLEAN NOT NULL,
    "errors" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradePlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT,
    "convertedTradeId" TEXT,
    "market" "MarketType" NOT NULL,
    "symbol" TEXT NOT NULL,
    "bias" TEXT NOT NULL,
    "entryZone" TEXT NOT NULL,
    "stopLoss" DECIMAL(18,6),
    "takeProfit" DECIMAL(18,6),
    "riskAmount" DECIMAL(18,6),
    "riskPercent" DECIMAL(8,4),
    "checklist" JSONB NOT NULL,
    "invalidationRule" TEXT,
    "relevantNews" TEXT,
    "notes" TEXT,
    "status" "TradePlanStatus" NOT NULL DEFAULT 'planned',
    "plannedFor" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Backtest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT,
    "name" TEXT NOT NULL,
    "market" "MarketType" NOT NULL,
    "timeframe" TEXT NOT NULL,
    "startingBalance" DECIMAL(18,6) NOT NULL,
    "result" JSONB NOT NULL,
    "trades" JSONB NOT NULL,
    "equityCurve" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Backtest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceSummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountSize" DECIMAL(18,6) NOT NULL DEFAULT 25000,
    "riskPerTradePct" DECIMAL(8,4) NOT NULL DEFAULT 1,
    "maxDailyRiskPct" DECIMAL(8,4) NOT NULL DEFAULT 3,
    "maxWeeklyRiskPct" DECIMAL(8,4) NOT NULL DEFAULT 6,
    "maxOpenRiskPct" DECIMAL(8,4) NOT NULL DEFAULT 5,
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'active',
    "symbol" TEXT,
    "condition" JSONB NOT NULL,
    "message" TEXT NOT NULL,
    "channels" "NotificationChannel"[],
    "triggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedFile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tradeId" TEXT,
    "tradePlanId" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "language" "Locale" NOT NULL,
    "market" "MarketType" NOT NULL,
    "relatedSymbols" TEXT[],
    "category" "NewsCategory" NOT NULL,
    "importance" "ImportanceLevel" NOT NULL DEFAULT 'medium',
    "sentiment" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "possibleAffectedAssets" TEXT[],
    "riskNotes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "newsItemId" TEXT NOT NULL,
    "mode" "AiMode" NOT NULL DEFAULT 'professional_coach',
    "whatHappened" TEXT NOT NULL,
    "affectedMarket" "MarketType" NOT NULL,
    "impactLevel" "ImportanceLevel" NOT NULL,
    "cautionNotes" TEXT[],
    "conflicts" JSONB NOT NULL,
    "reviewChecklist" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketContext" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "market" "MarketType" NOT NULL,
    "symbol" TEXT,
    "language" "Locale" NOT NULL,
    "summary" TEXT NOT NULL,
    "risks" TEXT[],
    "reviewItems" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "AiMode" NOT NULL,
    "workflow" TEXT NOT NULL,
    "subjectId" TEXT,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "disclaimer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "repeatedMistakes" TEXT[],
    "emotionalPatterns" TEXT[],
    "lessons" TEXT[],
    "nextWeekFocus" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningGlossary" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "language" "Locale" NOT NULL,
    "level" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "example" TEXT,
    "relatedTerms" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningGlossary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningTemplate" (
    "id" TEXT NOT NULL,
    "type" "LearningTemplateType" NOT NULL,
    "language" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MistakeTag" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "language" "Locale" NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MistakeTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmotionTag" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "language" "Locale" NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmotionTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TradeNews" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TradeNews_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_PlanNews" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PlanNews_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_provider_providerAccountId_key" ON "OAuthAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_symbol_market_key" ON "Asset"("symbol", "market");

-- CreateIndex
CREATE INDEX "Watchlist_userId_idx" ON "Watchlist"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_watchlistId_symbol_market_key" ON "WatchlistItem"("watchlistId", "symbol", "market");

-- CreateIndex
CREATE INDEX "SymbolNote_userId_idx" ON "SymbolNote"("userId");

-- CreateIndex
CREATE INDEX "SymbolNote_symbol_idx" ON "SymbolNote"("symbol");

-- CreateIndex
CREATE INDEX "Portfolio_userId_idx" ON "Portfolio"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioHolding_portfolioId_assetId_key" ON "PortfolioHolding"("portfolioId", "assetId");

-- CreateIndex
CREATE INDEX "PortfolioTransaction_portfolioId_idx" ON "PortfolioTransaction"("portfolioId");

-- CreateIndex
CREATE INDEX "PortfolioTransaction_assetId_idx" ON "PortfolioTransaction"("assetId");

-- CreateIndex
CREATE INDEX "Strategy_userId_idx" ON "Strategy"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyVersion_strategyId_version_key" ON "StrategyVersion"("strategyId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_tradeImportRowId_key" ON "Trade"("tradeImportRowId");

-- CreateIndex
CREATE INDEX "Trade_userId_idx" ON "Trade"("userId");

-- CreateIndex
CREATE INDEX "Trade_portfolioId_idx" ON "Trade"("portfolioId");

-- CreateIndex
CREATE INDEX "Trade_symbol_idx" ON "Trade"("symbol");

-- CreateIndex
CREATE INDEX "Trade_openedAt_idx" ON "Trade"("openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TradeJournalEntry_tradeId_key" ON "TradeJournalEntry"("tradeId");

-- CreateIndex
CREATE INDEX "TradeJournalEntry_userId_idx" ON "TradeJournalEntry"("userId");

-- CreateIndex
CREATE INDEX "TradeImport_userId_idx" ON "TradeImport"("userId");

-- CreateIndex
CREATE INDEX "TradeImport_status_idx" ON "TradeImport"("status");

-- CreateIndex
CREATE INDEX "TradeImportRow_tradeImportId_idx" ON "TradeImportRow"("tradeImportId");

-- CreateIndex
CREATE INDEX "TradeImportRow_isValid_idx" ON "TradeImportRow"("isValid");

-- CreateIndex
CREATE INDEX "TradePlan_userId_idx" ON "TradePlan"("userId");

-- CreateIndex
CREATE INDEX "TradePlan_status_idx" ON "TradePlan"("status");

-- CreateIndex
CREATE INDEX "TradePlan_symbol_idx" ON "TradePlan"("symbol");

-- CreateIndex
CREATE INDEX "Backtest_userId_idx" ON "Backtest"("userId");

-- CreateIndex
CREATE INDEX "PerformanceSummary_userId_idx" ON "PerformanceSummary"("userId");

-- CreateIndex
CREATE INDEX "PerformanceSummary_periodStart_periodEnd_idx" ON "PerformanceSummary"("periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "RiskProfile_userId_key" ON "RiskProfile"("userId");

-- CreateIndex
CREATE INDEX "Alert_userId_idx" ON "Alert"("userId");

-- CreateIndex
CREATE INDEX "Alert_status_idx" ON "Alert"("status");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_readAt_idx" ON "Notification"("readAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "UploadedFile_userId_idx" ON "UploadedFile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- CreateIndex
CREATE INDEX "NewsItem_market_idx" ON "NewsItem"("market");

-- CreateIndex
CREATE INDEX "NewsItem_language_idx" ON "NewsItem"("language");

-- CreateIndex
CREATE INDEX "NewsItem_publishedAt_idx" ON "NewsItem"("publishedAt");

-- CreateIndex
CREATE INDEX "NewsAnalysis_userId_idx" ON "NewsAnalysis"("userId");

-- CreateIndex
CREATE INDEX "NewsAnalysis_newsItemId_idx" ON "NewsAnalysis"("newsItemId");

-- CreateIndex
CREATE INDEX "MarketContext_userId_idx" ON "MarketContext"("userId");

-- CreateIndex
CREATE INDEX "MarketContext_market_idx" ON "MarketContext"("market");

-- CreateIndex
CREATE INDEX "AiReview_userId_idx" ON "AiReview"("userId");

-- CreateIndex
CREATE INDEX "AiReview_workflow_idx" ON "AiReview"("workflow");

-- CreateIndex
CREATE INDEX "WeeklyReview_userId_idx" ON "WeeklyReview"("userId");

-- CreateIndex
CREATE INDEX "WeeklyReview_weekStart_weekEnd_idx" ON "WeeklyReview"("weekStart", "weekEnd");

-- CreateIndex
CREATE UNIQUE INDEX "LearningGlossary_term_language_key" ON "LearningGlossary"("term", "language");

-- CreateIndex
CREATE INDEX "LearningTemplate_type_idx" ON "LearningTemplate"("type");

-- CreateIndex
CREATE INDEX "LearningTemplate_language_idx" ON "LearningTemplate"("language");

-- CreateIndex
CREATE UNIQUE INDEX "MistakeTag_userId_key_language_key" ON "MistakeTag"("userId", "key", "language");

-- CreateIndex
CREATE UNIQUE INDEX "EmotionTag_userId_key_language_key" ON "EmotionTag"("userId", "key", "language");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");

-- CreateIndex
CREATE INDEX "_TradeNews_B_index" ON "_TradeNews"("B");

-- CreateIndex
CREATE INDEX "_PlanNews_B_index" ON "_PlanNews"("B");

-- AddForeignKey
ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "Watchlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SymbolNote" ADD CONSTRAINT "SymbolNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SymbolNote" ADD CONSTRAINT "SymbolNote_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioHolding" ADD CONSTRAINT "PortfolioHolding_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioHolding" ADD CONSTRAINT "PortfolioHolding_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioTransaction" ADD CONSTRAINT "PortfolioTransaction_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioTransaction" ADD CONSTRAINT "PortfolioTransaction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyVersion" ADD CONSTRAINT "StrategyVersion_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_tradeImportRowId_fkey" FOREIGN KEY ("tradeImportRowId") REFERENCES "TradeImportRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeJournalEntry" ADD CONSTRAINT "TradeJournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeJournalEntry" ADD CONSTRAINT "TradeJournalEntry_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeImport" ADD CONSTRAINT "TradeImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeImportRow" ADD CONSTRAINT "TradeImportRow_tradeImportId_fkey" FOREIGN KEY ("tradeImportId") REFERENCES "TradeImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradePlan" ADD CONSTRAINT "TradePlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradePlan" ADD CONSTRAINT "TradePlan_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradePlan" ADD CONSTRAINT "TradePlan_convertedTradeId_fkey" FOREIGN KEY ("convertedTradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backtest" ADD CONSTRAINT "Backtest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backtest" ADD CONSTRAINT "Backtest_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceSummary" ADD CONSTRAINT "PerformanceSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskProfile" ADD CONSTRAINT "RiskProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_tradePlanId_fkey" FOREIGN KEY ("tradePlanId") REFERENCES "TradePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsItem" ADD CONSTRAINT "NewsItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsAnalysis" ADD CONSTRAINT "NewsAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsAnalysis" ADD CONSTRAINT "NewsAnalysis_newsItemId_fkey" FOREIGN KEY ("newsItemId") REFERENCES "NewsItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketContext" ADD CONSTRAINT "MarketContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiReview" ADD CONSTRAINT "AiReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReview" ADD CONSTRAINT "WeeklyReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MistakeTag" ADD CONSTRAINT "MistakeTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmotionTag" ADD CONSTRAINT "EmotionTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TradeNews" ADD CONSTRAINT "_TradeNews_A_fkey" FOREIGN KEY ("A") REFERENCES "NewsItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TradeNews" ADD CONSTRAINT "_TradeNews_B_fkey" FOREIGN KEY ("B") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlanNews" ADD CONSTRAINT "_PlanNews_A_fkey" FOREIGN KEY ("A") REFERENCES "NewsItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlanNews" ADD CONSTRAINT "_PlanNews_B_fkey" FOREIGN KEY ("B") REFERENCES "TradePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
