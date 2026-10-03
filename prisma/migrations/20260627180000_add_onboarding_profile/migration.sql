-- CreateTable
CREATE TABLE "OnboardingProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "experience" TEXT NOT NULL,
    "market" "MarketType" NOT NULL,
    "disciplineIssue" TEXT NOT NULL,
    "language" "Locale" NOT NULL,
    "segment" TEXT NOT NULL,
    "defaultRiskPercent" DECIMAL(8,4) NOT NULL,
    "focusAreas" TEXT[],
    "recommendedFeatures" TEXT[],
    "startingChecklist" TEXT[],
    "sprint" JSONB NOT NULL,
    "starterStrategyId" TEXT,
    "firstReviewId" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProfile_userId_key" ON "OnboardingProfile"("userId");

-- CreateIndex
CREATE INDEX "OnboardingProfile_userId_idx" ON "OnboardingProfile"("userId");

-- CreateIndex
CREATE INDEX "OnboardingProfile_segment_idx" ON "OnboardingProfile"("segment");

-- CreateIndex
CREATE INDEX "OnboardingProfile_completedAt_idx" ON "OnboardingProfile"("completedAt");

-- AddForeignKey
ALTER TABLE "OnboardingProfile" ADD CONSTRAINT "OnboardingProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
