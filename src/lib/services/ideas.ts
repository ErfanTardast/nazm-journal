import { prisma } from "@/lib/db/prisma";
import { notFound } from "@/lib/api/errors";
import type { z } from "zod";
import type { ideaCreateSchema, ideaUpdateSchema } from "@/lib/validation/trading";

export async function listIdeas(
  userId: string,
  filters: {
    query?: string;
    status?: z.infer<typeof ideaUpdateSchema>["status"];
    market?: z.infer<typeof ideaCreateSchema>["market"];
    type?: z.infer<typeof ideaCreateSchema>["type"];
  } = {}
) {
  const query = filters.query?.trim();
  return prisma.idea.findMany({
    where: {
      userId,
      status: filters.status,
      market: filters.market,
      type: filters.type,
      OR: query
        ? [
            { title: { contains: query, mode: "insensitive" } },
            { thesis: { contains: query, mode: "insensitive" } },
            { symbols: { has: query.toUpperCase() } },
            { tags: { has: query.toLowerCase() } }
          ]
        : undefined
    },
    include: {
      relatedStrategy: { select: { id: true, name: true } },
      convertedTradePlan: { select: { id: true, symbol: true, status: true } }
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
  });
}

export async function createIdea(userId: string, input: z.infer<typeof ideaCreateSchema>) {
  return prisma.idea.create({
    data: {
      userId,
      title: input.title,
      market: input.market,
      symbols: input.symbols,
      type: input.type,
      status: input.status,
      thesis: input.thesis,
      invalidation: input.invalidation ?? undefined,
      relatedStrategyId: input.relatedStrategyId ?? undefined,
      relatedWatchlistSymbol: input.relatedWatchlistSymbol ?? undefined,
      relatedNewsContext: input.relatedNewsContext ?? undefined,
      confidence: input.confidence,
      tags: input.tags.map((tag) => tag.toLowerCase())
    }
  });
}

export async function updateIdea(userId: string, input: z.infer<typeof ideaUpdateSchema>) {
  const existing = await prisma.idea.findFirst({ where: { id: input.id, userId } });
  if (!existing) {
    throw notFound("Idea not found");
  }

  return prisma.idea.update({
    where: { id: input.id },
    data: {
      title: input.title,
      market: input.market,
      symbols: input.symbols,
      type: input.type,
      status: input.status,
      thesis: input.thesis,
      invalidation: input.invalidation ?? undefined,
      relatedStrategyId: input.relatedStrategyId ?? undefined,
      relatedWatchlistSymbol: input.relatedWatchlistSymbol ?? undefined,
      relatedNewsContext: input.relatedNewsContext ?? undefined,
      confidence: input.confidence,
      tags: input.tags?.map((tag) => tag.toLowerCase())
    }
  });
}

export async function deleteIdea(userId: string, id: string) {
  const existing = await prisma.idea.findFirst({ where: { id, userId } });
  if (!existing) {
    throw notFound("Idea not found");
  }

  await prisma.idea.delete({ where: { id } });
  return { deleted: true };
}
