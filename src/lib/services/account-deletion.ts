import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildDeletionPreview, type DeletionPreview } from "@/lib/privacy/data-inventory";

type CountDb = Pick<
  PrismaClient,
  | "user"
  | "onboardingProfile"
  | "riskProfile"
  | "strategy"
  | "tradePlan"
  | "tradeImport"
  | "trade"
  | "tradeJournalEntry"
  | "review"
  | "idea"
  | "tradingSession"
  | "watchlist"
  | "portfolio"
  | "alert"
  | "backtest"
  | "uploadedFile"
  | "aiReview"
  | "auditLog"
  | "session"
  | "passwordResetToken"
  | "payment"
>;

type DeleteDb = CountDb & Pick<PrismaClient, "$transaction">;

export async function countAccountDeletionRecords(userId: string, db: CountDb = prisma): Promise<Record<string, number>> {
  const [
    account,
    onboardingProfile,
    riskProfile,
    strategies,
    tradePlans,
    tradeImports,
    trades,
    journalEntries,
    reviews,
    ideas,
    sessions,
    watchlists,
    portfolios,
    alerts,
    backtests,
    uploads,
    aiAudits,
    auditLogs,
    authSessions,
    resetTokens,
    payments
  ] = await Promise.all([
    db.user.count({ where: { id: userId } }),
    db.onboardingProfile.count({ where: { userId } }),
    db.riskProfile.count({ where: { userId } }),
    db.strategy.count({ where: { userId } }),
    db.tradePlan.count({ where: { userId } }),
    db.tradeImport.count({ where: { userId } }),
    db.trade.count({ where: { userId } }),
    db.tradeJournalEntry.count({ where: { userId } }),
    db.review.count({ where: { userId } }),
    db.idea.count({ where: { userId } }),
    db.tradingSession.count({ where: { userId } }),
    db.watchlist.count({ where: { userId } }),
    db.portfolio.count({ where: { userId } }),
    db.alert.count({ where: { userId } }),
    db.backtest.count({ where: { userId } }),
    db.uploadedFile.count({ where: { userId } }),
    db.aiReview.count({ where: { userId } }),
    db.auditLog.count({ where: { userId } }),
    db.session.count({ where: { userId } }),
    db.passwordResetToken.count({ where: { userId } }),
    db.payment.count({ where: { userId } })
  ]);

  return {
    account,
    onboardingProfile,
    riskProfile,
    strategies,
    tradePlans,
    tradeImports,
    trades,
    journalEntries,
    reviews,
    ideas,
    sessions,
    watchlists,
    portfolios,
    alerts,
    backtests,
    uploads,
    aiAudits,
    auditLogs,
    authSessions: authSessions + resetTokens,
    payments
  };
}

export async function buildAccountDeletionPreview(userId: string, db: CountDb = prisma): Promise<DeletionPreview> {
  return buildDeletionPreview(await countAccountDeletionRecords(userId, db));
}

export async function deleteUserAccount(userId: string, db: DeleteDb = prisma): Promise<DeletionPreview> {
  const preview = await buildAccountDeletionPreview(userId, db);

  await db.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({
      where: {
        OR: [
          { userId },
          { entity: "User", entityId: userId }
        ]
      }
    });

    const removed = await tx.user.delete({ where: { id: userId }, select: { email: true } });

    // The person may also have asked for an invite before signing up (an access request keeps the name, e-mail and note).
    // Requests are stored under the lower-cased e-mail. Deleting the account deletes that request too.
    await tx.accessRequest.deleteMany({ where: { email: removed.email.trim().toLowerCase() } });

    await tx.auditLog.create({
      data: {
        action: "user.account.delete.completed",
        entity: "User",
        metadata: {
          totalRecords: preview.totalRecords,
          categories: preview.categories.map((category) => ({
            key: category.key,
            count: category.count
          }))
        }
      }
    });
  });

  return preview;
}
