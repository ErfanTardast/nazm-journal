import { prisma } from "@/lib/db/prisma";

export async function buildExportBundle(userId: string) {
  const [
    user,
    onboardingProfile,
    riskProfile,
    trades,
    reviews,
    ideas,
    strategies,
    plans,
    tradeImports,
    alerts,
    watchlists,
    portfolios,
    tradingSessions,
    backtests,
    uploads,
    payments
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        locale: true,
        timezone: true,
        theme: true,
        riskPerTradePct: true,
        maxDailyLossPct: true,
        maxWeeklyLossPct: true,
        tier: true,
        tierExpiresAt: true,
        // The first-run answers: where the person trades, what they came for, and when they finished (or skipped) the steps.
        tradingPlatform: true,
        primaryGoal: true,
        onboardedAt: true,
        createdAt: true
      }
    }),
    prisma.onboardingProfile.findUnique({ where: { userId } }),
    prisma.riskProfile.findUnique({ where: { userId } }),
    // The export is the person's own data: the labelled sample workspace (isSample) is left out, journal entries with it.
    prisma.trade.findMany({
      where: { userId, isSample: false },
      include: { journalEntry: true },
      orderBy: { openedAt: "desc" }
    }),
    prisma.review.findMany({ where: { userId, isSample: false }, orderBy: { periodStart: "desc" } }),
    prisma.idea.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.strategy.findMany({ where: { userId, isSample: false }, orderBy: { createdAt: "desc" } }),
    prisma.tradePlan.findMany({ where: { userId, isSample: false }, orderBy: { createdAt: "desc" } }),
    prisma.tradeImport.findMany({ where: { userId }, include: { rows: true }, orderBy: { createdAt: "desc" } }),
    prisma.alert.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.watchlist.findMany({ where: { userId }, include: { items: true }, orderBy: { createdAt: "desc" } }),
    prisma.portfolio.findMany({
      where: { userId },
      include: { holdings: true, transactions: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.tradingSession.findMany({ where: { userId }, orderBy: { startedAt: "desc" } }),
    prisma.backtest.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.uploadedFile.findMany({
      where: { userId },
      select: {
        id: true,
        tradeId: true,
        tradePlanId: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        checksum: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.payment.findMany({
      where: { userId },
      select: {
        id: true,
        tier: true,
        periodDays: true,
        amount: true,
        currency: true,
        method: true,
        trackingCode: true,
        paidAt: true,
        status: true,
        reviewedAt: true,
        reviewNote: true,
        refundedAt: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" }
    })
  ]);

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: "1",
    user,
    onboardingProfile,
    riskProfile,
    trades,
    reviews,
    ideas,
    strategies,
    plans,
    tradeImports,
    alerts,
    watchlists,
    portfolios,
    tradingSessions,
    backtests,
    uploads,
    payments
  };
}
