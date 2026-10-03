import { prisma } from "@/lib/db/prisma";
import { notFound } from "@/lib/api/errors";
import type { z } from "zod";
import type { sessionCreateSchema, sessionEndSchema } from "@/lib/validation/trading";

export type SessionInput = z.infer<typeof sessionCreateSchema>;
export type SessionEndInput = z.infer<typeof sessionEndSchema>;

export async function getActiveSession(userId: string) {
  return prisma.tradingSession.findFirst({
    where: { userId, status: "active" },
    orderBy: { startedAt: "desc" }
  });
}

export async function startSession(userId: string, input: SessionInput) {
  // Abandon any existing active sessions before starting a new one
  await prisma.tradingSession.updateMany({
    where: { userId, status: "active" },
    data: { status: "abandoned", endedAt: new Date() }
  });

  return prisma.tradingSession.create({
    data: {
      userId,
      market: input.market,
      sessionLabel: input.sessionLabel,
      emotionalState: input.emotionalState ?? undefined,
      maxDailyLoss: input.maxDailyLoss ?? undefined,
      allowedStrategyIds: input.allowedStrategyIds,
      mistakeToAvoid: input.mistakeToAvoid ?? undefined,
      notes: input.notes ?? undefined
    }
  });
}

export async function endSession(userId: string, id: string, input: SessionEndInput) {
  const existing = await prisma.tradingSession.findFirst({ where: { id, userId } });
  if (!existing) throw notFound("Session not found");

  return prisma.tradingSession.update({
    where: { id },
    data: {
      status: input.status,
      endedAt: new Date(),
      ...(input.notes != null ? { notes: input.notes } : {})
    }
  });
}

export async function listSessions(userId: string, limit = 10) {
  return prisma.tradingSession.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take: limit
  });
}
