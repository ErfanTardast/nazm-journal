import { prisma } from "@/lib/db/prisma";
import { calculateBacktestMetrics } from "@/lib/calculations/backtest";
import type { z } from "zod";
import type { backtestCreateSchema } from "@/lib/validation/trading";

export async function listBacktests(userId: string) {
  return prisma.backtest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      strategy: true
    }
  });
}

export async function createBacktest(userId: string, input: z.infer<typeof backtestCreateSchema>) {
  const result = calculateBacktestMetrics(input.startingBalance, input.trades);
  return prisma.backtest.create({
    data: {
      userId,
      strategyId: input.strategyId ?? undefined,
      name: input.name,
      market: input.market,
      timeframe: input.timeframe,
      startingBalance: input.startingBalance,
      result,
      trades: input.trades,
      equityCurve: result.equityCurve
    },
    include: {
      strategy: true
    }
  });
}

