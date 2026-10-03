import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { conflict, notFound, validationError } from "@/lib/api/errors";
import { tradePlanSide } from "@/lib/calculations/trade-plan-side";
import { createTrade } from "./trades";
import type { z } from "zod";
import type { tradePlanConvertSchema, tradePlanCreateSchema, tradePlanUpdateSchema } from "@/lib/validation/trading";

export async function listTradePlans(userId: string) {
  return prisma.tradePlan.findMany({
    where: { userId },
    orderBy: [{ status: "asc" }, { plannedFor: "asc" }],
    include: { strategy: true, newsItems: true }
  });
}

/**
 * A plan can only point at one of the user's own strategies: the plan list returns the whole strategy row, so an id
 * that belongs to someone else (or to nothing) is refused like any other bad field, naming `strategyId`.
 */
async function assertOwnStrategy(userId: string, strategyId: string | null | undefined) {
  if (!strategyId) return;
  const own = await prisma.strategy.findFirst({ where: { id: strategyId, userId }, select: { id: true } });
  if (!own) throw validationError({ formErrors: [], fieldErrors: { strategyId: ["Strategy not found"] } });
}

export async function createTradePlan(userId: string, input: z.infer<typeof tradePlanCreateSchema>) {
  await assertOwnStrategy(userId, input.strategyId);
  return prisma.tradePlan.create({
    data: {
      userId,
      strategyId: input.strategyId ?? undefined,
      market: input.market,
      symbol: input.symbol,
      bias: input.bias,
      entryZone: input.entryZone,
      stopLoss: input.stopLoss ?? undefined,
      takeProfit: input.takeProfit ?? undefined,
      riskAmount: input.riskAmount ?? undefined,
      riskPercent: input.riskPercent ?? undefined,
      checklist: input.checklist as Prisma.InputJsonValue,
      invalidationRule: input.invalidationRule ?? undefined,
      relevantNews: input.relevantNews ?? undefined,
      notes: input.notes ?? undefined,
      sizing: input.sizing ?? undefined,
      status: input.status,
      plannedFor: input.plannedFor ?? undefined
    }
  });
}

export async function updateTradePlan(userId: string, input: z.infer<typeof tradePlanUpdateSchema>) {
  const existing = await prisma.tradePlan.findFirst({ where: { id: input.id, userId } });
  if (!existing) throw notFound("Trade plan not found");
  await assertOwnStrategy(userId, input.strategyId);
  // The check and the write are one statement, so a conversion that lands in between cannot be overwritten.
  // A converted plan is closed for good, and a plan a conversion has claimed (closed, trade not recorded yet) is closed
  // too: an update from a stale tab must not reopen either. A sender that names the status it last saw
  // (`expectedStatus`) is applied only while the plan still has it.
  const updated = await prisma.tradePlan.updateMany({
    where: {
      id: input.id,
      userId,
      convertedTradeId: null,
      ...(input.expectedStatus
        ? { status: input.expectedStatus }
        : input.status && input.status !== "closed"
          ? { status: { not: "closed" as const } }
          : {})
    },
    data: {
      // null detaches the strategy; a plan update that does not send the field leaves the link as it is.
      strategyId: input.strategyId,
      market: input.market,
      symbol: input.symbol,
      bias: input.bias,
      entryZone: input.entryZone,
      stopLoss: input.stopLoss ?? undefined,
      takeProfit: input.takeProfit ?? undefined,
      riskAmount: input.riskAmount ?? undefined,
      riskPercent: input.riskPercent ?? undefined,
      checklist: input.checklist as Prisma.InputJsonValue | undefined,
      invalidationRule: input.invalidationRule ?? undefined,
      relevantNews: input.relevantNews ?? undefined,
      notes: input.notes ?? undefined,
      // The risk desk's sizing: null clears it, and an update that does not send it leaves it as it is.
      sizing: input.sizing === null ? Prisma.JsonNull : input.sizing,
      status: input.status,
      plannedFor: input.plannedFor ?? undefined
    }
  });
  if (updated.count === 0) {
    throw conflict(input.expectedStatus ? "This plan was changed since it was loaded" : "This plan was already converted to a trade");
  }
  const plan = await prisma.tradePlan.findFirst({ where: { id: input.id, userId } });
  if (!plan) throw notFound("Trade plan not found");
  return plan;
}

export async function deleteTradePlan(userId: string, id: string) {
  const existing = await prisma.tradePlan.findFirst({ where: { id, userId } });
  if (!existing) throw notFound("Trade plan not found");
  await prisma.tradePlan.delete({ where: { id } });
  return { deleted: true };
}

export async function convertTradePlan(userId: string, id: string, input: z.infer<typeof tradePlanConvertSchema>) {
  const plan = await prisma.tradePlan.findFirst({ where: { id, userId } });
  if (!plan) throw notFound("Trade plan not found");
  // Sample rows are removed when the first real trade is created, so converting one would delete the plan in the
  // middle of its own conversion.
  if (plan.isSample) throw conflict("A sample plan cannot be converted to a trade");
  // The trade keeps the plan's strategy only when it is one of the user's own and not a sample one: the first real trade
  // removes the sample strategy in the same call, and an id that is not the user's must never travel into a trade.
  // Looked up before the plan is claimed, so a failed lookup leaves the plan as it was.
  const strategy = plan.strategyId
    ? await prisma.strategy.findFirst({ where: { id: plan.strategyId, userId }, select: { isSample: true } })
    : null;
  const tradeStrategyId = strategy && !strategy.isSample ? plan.strategyId : null;
  // A second click (or a stale tab) must not record the same plan as another trade.
  if (plan.convertedTradeId || plan.status === "closed") throw conflict("This plan was already converted to a trade");
  // Claim the plan before creating the trade: of two overlapping requests only one updates a row.
  const claimed = await prisma.tradePlan.updateMany({
    where: { id, userId, convertedTradeId: null, status: { not: "closed" } },
    data: { status: "closed" }
  });
  if (claimed.count === 0) throw conflict("This plan was already converted to a trade");
  let trade: Awaited<ReturnType<typeof createTrade>>;
  try {
    trade = await createTrade(userId, {
      strategyId: tradeStrategyId,
      symbol: plan.symbol,
      market: plan.market,
      side: tradePlanSide(plan),
      status: input.exitPrice ? "closed" : "open",
      entryPrice: input.entryPrice,
      exitPrice: input.exitPrice ?? null,
      stopLoss: plan.stopLoss ? Number(plan.stopLoss) : null,
      takeProfit: plan.takeProfit ? Number(plan.takeProfit) : null,
      quantity: input.quantity,
      fees: input.fees,
      riskAmount: plan.riskAmount ? Number(plan.riskAmount) : null,
      riskPercent: plan.riskPercent ? Number(plan.riskPercent) : null,
      openedAt: input.openedAt ?? new Date(),
      closedAt: input.closedAt ?? null,
      setupType: "planned-trade-conversion",
      preTradeNotes: plan.notes,
      postTradeNotes: input.postTradeNotes,
      outcome: input.outcome,
      ruleFollowed: "unknown",
      journal: {
        notes: plan.notes,
        postTradeNotes: input.postTradeNotes,
        tags: ["converted-plan"],
        mistakes: [],
        ruleFollowed: "unknown"
      }
    });
  } catch (error) {
    // Release the claim so the plan can be converted again once the problem is fixed.
    await prisma.tradePlan.update({ where: { id }, data: { status: plan.status } });
    throw error;
  }
  await prisma.tradePlan.update({
    where: { id },
    data: { status: "closed", convertedTradeId: String(trade.id) }
  });
  return { trade, planId: id };
}
