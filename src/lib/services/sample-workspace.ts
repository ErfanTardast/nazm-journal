import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { AppError, notFound } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import type { Locale } from "@/lib/i18n/locales";
import { buildSampleWorkspace } from "@/lib/sample";

/**
 * The sample workspace: a labelled month of trades, strategies, plans and reviews that a new account can load to see
 * the product with data in it. Every row it writes has `isSample: true`, and the account's `sampleLoadedAt` says it is
 * there. It is only ever loaded into an account with no trade of its own, and it is removed, whole and nothing else,
 * by one click or by the person's first real trade. Sample and real trades never exist side by side.
 */
export type SampleCounts = { trades: number; strategies: number; plans: number; reviews: number };
export type SampleState = { active: boolean; loadedAt: string | null; canLoad: boolean };

/** What the sample's writes need; a transaction client has it, and so does the database client. */
type Db = Pick<Prisma.TransactionClient, "user" | "strategy" | "trade" | "tradeJournalEntry" | "tradePlan" | "review">;

/** A month of sample rows is about a hundred writes in six statements; allow the pool a moment on a slow database. */
const TRANSACTION = { maxWait: 10_000, timeout: 30_000 };

async function sampleCounts(db: Db, userId: string): Promise<SampleCounts> {
  const where = { userId, isSample: true };
  const [trades, strategies, plans, reviews] = await Promise.all([
    db.trade.count({ where }),
    db.strategy.count({ where }),
    db.tradePlan.count({ where }),
    db.review.count({ where })
  ]);
  return { trades, strategies, plans, reviews };
}

/** Whether sample data is loaded, and whether the account may load it (only while it has no trade of its own). */
export async function getSampleWorkspaceState(userId: string): Promise<SampleState> {
  const [user, ownTrades] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { sampleLoadedAt: true } }),
    prisma.trade.count({ where: { userId, isSample: false } })
  ]);
  return { active: Boolean(user?.sampleLoadedAt), loadedAt: user?.sampleLoadedAt?.toISOString() ?? null, canLoad: ownTrades === 0 };
}

const sampleNotEmpty = () => new AppError("SAMPLE_NOT_EMPTY", "Sample data can only be loaded into a journal with no trades of its own", 409);

/**
 * Writes the sample workspace in the person's language, all in one transaction. The first statement claims the
 * account (`sampleLoadedAt` is still empty), so of two requests at once one writes and the other, which waits on that
 * row, finds it taken and answers with what is there. A failure at any point leaves nothing behind.
 *
 * Sample and real trades must never exist together, and a person's first trade reads `sampleLoadedAt` without a lock:
 * a load that has claimed the row but not committed is invisible to it, so that trade does not remove the sample. The
 * count of the person's own trades is therefore taken twice, once at the start and once as the last statement before
 * the commit, which sees a trade that was committed while the rows were being written and then undoes the load (the
 * person is told the journal is not empty). This narrows the window from the length of the load to the single commit
 * round trip; it does not close it. Closing it would take the account's row lock (`SELECT ... FOR UPDATE`) in every
 * trade's own transaction, which every trade created would pay for, so it was not done.
 */
export async function loadSampleWorkspace(
  userId: string,
  locale: Locale,
  now: Date = new Date()
): Promise<{ created: boolean; loadedAt: Date; counts: SampleCounts }> {
  const workspace = buildSampleWorkspace(now, locale);
  const ids = {
    strategy: new Map(workspace.strategies.map((strategy) => [strategy.key, randomUUID()])),
    trade: new Map(workspace.trades.map((trade) => [trade.key, randomUUID()])),
    plan: new Map(workspace.plans.map((plan) => [plan.key, randomUUID()])),
    review: new Map(workspace.reviews.map((review) => [review.key, randomUUID()]))
  };
  const strategyId = (key: string) => ids.strategy.get(key) as string;
  const tradeId = (key: string) => ids.trade.get(key) as string;

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.user.updateMany({ where: { id: userId, sampleLoadedAt: null }, data: { sampleLoadedAt: now } });
    if (claimed.count === 0) {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { sampleLoadedAt: true } });
      if (!user?.sampleLoadedAt) throw notFound("User not found");
      return { created: false, loadedAt: user.sampleLoadedAt, counts: await sampleCounts(tx, userId) };
    }

    if ((await tx.trade.count({ where: { userId, isSample: false } })) > 0) throw sampleNotEmpty();

    await tx.strategy.createMany({
      data: workspace.strategies.map((strategy) => ({
        id: strategyId(strategy.key),
        userId,
        name: strategy.name,
        description: strategy.description,
        entryRules: strategy.entryRules,
        exitRules: strategy.exitRules,
        invalidationRules: strategy.invalidationRules,
        riskRules: strategy.riskRules,
        allowedMarkets: strategy.allowedMarkets,
        timeframes: strategy.timeframes,
        allowedSessions: strategy.allowedSessions,
        checklist: strategy.checklist,
        commonMistakes: strategy.commonMistakes,
        idealMarketConditions: strategy.idealMarketConditions,
        tags: strategy.tags,
        riskPerTradePct: strategy.riskPerTradePct,
        maxDailyLossPct: strategy.maxDailyLossPct,
        maxOpenPositions: strategy.maxOpenPositions,
        status: strategy.status,
        isActive: strategy.isActive,
        isSample: true
      }))
    });

    await tx.trade.createMany({
      data: workspace.trades.map((trade) => ({
        id: tradeId(trade.key),
        userId,
        strategyId: strategyId(trade.strategyKey),
        symbol: trade.symbol,
        market: trade.market,
        side: trade.side,
        status: trade.status,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        quantity: trade.quantity,
        riskAmount: trade.riskAmount,
        riskPercent: trade.riskPercent,
        rMultiple: trade.rMultiple,
        realizedPnl: trade.realizedPnl,
        fees: trade.fees,
        session: trade.session,
        setupType: trade.setupType,
        confidenceScore: trade.confidenceScore,
        preTradeNotes: trade.preTradeNotes,
        postTradeNotes: trade.postTradeNotes,
        lessonsLearned: trade.lessonsLearned,
        ruleFollowed: trade.ruleFollowed,
        outcome: trade.outcome,
        isSample: true,
        openedAt: trade.openedAt,
        closedAt: trade.closedAt
      }))
    });

    await tx.tradeJournalEntry.createMany({
      data: workspace.trades.map((trade) => ({
        userId,
        tradeId: tradeId(trade.key),
        emotionalState: trade.journal.emotionalState,
        mistakes: trade.journal.mistakes,
        tags: trade.journal.tags,
        notes: trade.journal.notes,
        preTradeNotes: trade.journal.preTradeNotes,
        postTradeNotes: trade.journal.postTradeNotes,
        lessonsLearned: trade.journal.lessonsLearned,
        ruleFollowed: trade.journal.ruleFollowed,
        review: trade.journal.review
      }))
    });

    await tx.tradePlan.createMany({
      data: workspace.plans.map((plan) => ({
        id: ids.plan.get(plan.key) as string,
        userId,
        strategyId: strategyId(plan.strategyKey),
        market: plan.market,
        symbol: plan.symbol,
        bias: plan.bias,
        entryZone: plan.entryZone,
        stopLoss: plan.stopLoss,
        takeProfit: plan.takeProfit,
        riskAmount: plan.riskAmount,
        riskPercent: plan.riskPercent,
        checklist: plan.checklist as Prisma.InputJsonValue,
        invalidationRule: plan.invalidationRule,
        relevantNews: plan.relevantNews,
        notes: plan.notes,
        status: plan.status,
        plannedFor: plan.plannedFor,
        isSample: true
      }))
    });

    await tx.review.createMany({
      data: workspace.reviews.map((review) => ({
        id: ids.review.get(review.key) as string,
        userId,
        type: review.type,
        status: review.status,
        periodStart: review.periodStart,
        periodEnd: review.periodEnd,
        title: review.title,
        checklist: review.checklist as unknown as Prisma.InputJsonValue,
        metrics: review.metrics as Prisma.InputJsonValue,
        insights: review.insights,
        risks: review.risks,
        lessons: review.lessons,
        nextActions: review.nextActions,
        linkedTradeIds: review.linkedTradeKeys.map(tradeId),
        linkedStrategyIds: review.linkedStrategyKeys.map(strategyId),
        isSample: true,
        completedAt: review.completedAt
      }))
    });

    // The last statement: a first trade committed while the rows above were written is seen here.
    if ((await tx.trade.count({ where: { userId, isSample: false } })) > 0) throw sampleNotEmpty();

    return {
      created: true,
      loadedAt: now,
      counts: {
        trades: workspace.trades.length,
        strategies: workspace.strategies.length,
        plans: workspace.plans.length,
        reviews: workspace.reviews.length
      }
    };
  }, TRANSACTION);
}

/**
 * Deletes the account's sample rows, only those: every delete is filtered by this account and by `isSample`, so a row
 * of the person's own (or of anyone else) cannot go. The first statement clears the marker, which waits for a load that
 * is still running to finish, so rows are never left behind a cleared marker. A plan of the person's own that used a
 * sample strategy keeps working, with no strategy. The journal entries of the sample trades go with their trades.
 */
export async function removeSampleWorkspace(userId: string): Promise<{ wasActive: boolean; removed: SampleCounts }> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: userId }, select: { sampleLoadedAt: true } });
    await tx.user.updateMany({ where: { id: userId }, data: { sampleLoadedAt: null } });

    const sampleStrategies = await tx.strategy.findMany({ where: { userId, isSample: true }, select: { id: true } });
    if (sampleStrategies.length > 0) {
      await tx.tradePlan.updateMany({
        where: { userId, isSample: false, strategyId: { in: sampleStrategies.map((strategy) => strategy.id) } },
        data: { strategyId: null }
      });
    }

    const where = { userId, isSample: true };
    const trades = await tx.trade.deleteMany({ where });
    const plans = await tx.tradePlan.deleteMany({ where });
    const reviews = await tx.review.deleteMany({ where });
    const strategies = await tx.strategy.deleteMany({ where });
    return {
      wasActive: Boolean(before?.sampleLoadedAt),
      removed: { trades: trades.count, strategies: strategies.count, plans: plans.count, reviews: reviews.count }
    };
  }, TRANSACTION);
}

/**
 * Called before a person's own first trade is written, on every path that writes one. One read of the account's
 * `sampleLoadedAt`: an account without sample data pays nothing more. True when the sample workspace was removed.
 */
export async function removeSampleWorkspaceIfLoaded(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { sampleLoadedAt: true } });
  if (!user?.sampleLoadedAt) return false;
  await removeSampleWorkspace(userId);
  return true;
}
