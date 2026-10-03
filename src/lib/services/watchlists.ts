import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { notFound } from "@/lib/api/errors";
import type { z } from "zod";
import type { watchlistCreateSchema, watchlistUpdateSchema } from "@/lib/validation/trading";

export async function listWatchlists(userId: string) {
  return prisma.watchlist.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: { asset: true }
      }
    }
  });
}

export async function createWatchlist(userId: string, input: z.infer<typeof watchlistCreateSchema>) {
  return prisma.watchlist.create({
    data: {
      userId,
      name: input.name,
      items: {
        create: input.items.map((item) => ({
          symbol: item.symbol,
          market: item.market,
          notes: item.notes
        }))
      }
    },
    include: { items: true }
  });
}

export async function updateWatchlist(userId: string, input: z.infer<typeof watchlistUpdateSchema>) {
  const existing = await prisma.watchlist.findFirst({ where: { id: input.id, userId } });
  if (!existing) {
    throw notFound("Watchlist not found");
  }

  const itemUpdate: Prisma.WatchlistUpdateInput =
    input.items === undefined
      ? {}
      : {
          items: {
            deleteMany: {},
            create: input.items.map((item) => ({
              symbol: item.symbol,
              market: item.market,
              notes: item.notes
            }))
          }
        };

  return prisma.watchlist.update({
    where: { id: input.id },
    data: {
      name: input.name,
      ...itemUpdate
    },
    include: { items: true }
  });
}

export async function deleteWatchlist(userId: string, id: string) {
  const existing = await prisma.watchlist.findFirst({ where: { id, userId } });
  if (!existing) {
    throw notFound("Watchlist not found");
  }
  await prisma.watchlist.delete({ where: { id } });
  return { deleted: true };
}

