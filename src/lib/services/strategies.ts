import { prisma } from "@/lib/db/prisma";
import { notFound } from "@/lib/api/errors";
import type { z } from "zod";
import type { strategyCreateSchema, strategyUpdateSchema } from "@/lib/validation/trading";

export async function listStrategies(userId: string) {
  return prisma.strategy.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: {
          trades: true,
          backtests: true
        }
      }
    }
  });
}

export async function createStrategy(userId: string, input: z.infer<typeof strategyCreateSchema>) {
  return prisma.strategy.create({
    data: {
      userId,
      name: input.name,
      description: input.description ?? undefined,
      entryRules: input.entryRules,
      exitRules: input.exitRules,
      invalidationRules: input.invalidationRules,
      riskRules: input.riskRules,
      allowedMarkets: input.allowedMarkets,
      timeframes: input.timeframes,
      allowedSessions: input.allowedSessions,
      checklist: input.checklist,
      commonMistakes: input.commonMistakes,
      idealMarketConditions: input.idealMarketConditions,
      tags: input.tags,
      riskPerTradePct: input.riskPerTradePct ?? undefined,
      maxDailyLossPct: input.maxDailyLossPct ?? undefined,
      maxOpenPositions: input.maxOpenPositions ?? undefined,
      status: input.status,
      isActive: input.isActive
    }
  });
}

export async function updateStrategy(userId: string, input: z.infer<typeof strategyUpdateSchema>) {
  const existing = await prisma.strategy.findFirst({ where: { id: input.id, userId } });
  if (!existing) {
    throw notFound("Strategy not found");
  }

  return prisma.strategy.update({
    where: { id: input.id },
    data: {
      name: input.name,
      description: input.description ?? undefined,
      entryRules: input.entryRules,
      exitRules: input.exitRules,
      invalidationRules: input.invalidationRules,
      riskRules: input.riskRules,
      allowedMarkets: input.allowedMarkets,
      timeframes: input.timeframes,
      allowedSessions: input.allowedSessions,
      checklist: input.checklist,
      commonMistakes: input.commonMistakes,
      idealMarketConditions: input.idealMarketConditions,
      tags: input.tags,
      // A limit sent as null is cleared; one that was not sent is left as it is.
      riskPerTradePct: input.riskPerTradePct,
      maxDailyLossPct: input.maxDailyLossPct,
      maxOpenPositions: input.maxOpenPositions,
      status: input.status,
      isActive: input.isActive
    }
  });
}

export async function getStrategyPerformance(userId: string, strategyId: string) {
  const strategy = await prisma.strategy.findFirst({
    where: { id: strategyId, userId },
    include: {
      trades: true,
      backtests: true
    }
  });
  if (!strategy) {
    throw notFound("Strategy not found");
  }

  const closed = strategy.trades.filter((trade) => trade.status === "closed");
  const pnl = closed.reduce((sum, trade) => sum + Number(trade.realizedPnl ?? 0), 0);
  const wins = closed.filter((trade) => Number(trade.realizedPnl ?? 0) > 0).length;
  return {
    strategyId,
    name: strategy.name,
    totalTrades: closed.length,
    winRate: closed.length ? wins / closed.length : 0,
    realizedPnl: pnl,
    backtests: strategy.backtests.length,
    commonMistakes: strategy.commonMistakes
  };
}

export async function deleteStrategy(userId: string, id: string) {
  const existing = await prisma.strategy.findFirst({ where: { id, userId } });
  if (!existing) {
    throw notFound("Strategy not found");
  }
  await prisma.strategy.delete({ where: { id } });
  return { deleted: true };
}
