import { prisma } from "@/lib/db/prisma";
import { notFound } from "@/lib/api/errors";
import { applyPortfolioTransaction } from "@/lib/calculations/portfolio";
import { serializeHolding, serializePortfolio } from "./serializers";
import type { z } from "zod";
import type {
  portfolioCreateSchema,
  portfolioTransactionSchema,
  portfolioUpdateSchema
} from "@/lib/validation/trading";

export async function listPortfolios(userId: string) {
  const portfolios = await prisma.portfolio.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      holdings: { include: { asset: true } },
      transactions: { orderBy: { executedAt: "desc" }, include: { asset: true } }
    }
  });
  return portfolios.map((portfolio) => ({
    ...serializePortfolio(portfolio),
    holdings: portfolio.holdings.map(serializeHolding),
    transactions: portfolio.transactions.map((transaction) => ({
      ...transaction,
      quantity: Number(transaction.quantity),
      price: Number(transaction.price),
      fees: Number(transaction.fees)
    }))
  }));
}

export async function createPortfolio(userId: string, input: z.infer<typeof portfolioCreateSchema>) {
  return serializePortfolio(
    await prisma.portfolio.create({
      data: {
        userId,
        name: input.name,
        baseCurrency: input.baseCurrency,
        cashBalance: input.cashBalance
      }
    })
  );
}

export async function updatePortfolio(userId: string, input: z.infer<typeof portfolioUpdateSchema>) {
  const existing = await prisma.portfolio.findFirst({ where: { id: input.id, userId } });
  if (!existing) {
    throw notFound("Portfolio not found");
  }
  return serializePortfolio(
    await prisma.portfolio.update({
      where: { id: input.id },
      data: {
        name: input.name,
        baseCurrency: input.baseCurrency,
        cashBalance: input.cashBalance
      }
    })
  );
}

export async function deletePortfolio(userId: string, id: string) {
  const existing = await prisma.portfolio.findFirst({ where: { id, userId } });
  if (!existing) {
    throw notFound("Portfolio not found");
  }
  await prisma.portfolio.delete({ where: { id } });
  return { deleted: true };
}

export async function addPortfolioTransaction(
  userId: string,
  portfolioId: string,
  input: z.infer<typeof portfolioTransactionSchema>
) {
  const portfolio = await prisma.portfolio.findFirst({ where: { id: portfolioId, userId } });
  if (!portfolio) {
    throw notFound("Portfolio not found");
  }

  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.upsert({
      where: { symbol_market: { symbol: input.symbol, market: input.market } },
      update: {},
      create: { symbol: input.symbol, name: input.symbol, market: input.market }
    });

    const existingHolding = await tx.portfolioHolding.findUnique({
      where: { portfolioId_assetId: { portfolioId, assetId: asset.id } }
    });

    const nextHolding = applyPortfolioTransaction(
      {
        quantity: existingHolding ? Number(existingHolding.quantity) : 0,
        averageEntry: existingHolding ? Number(existingHolding.averageEntry) : 0,
        realizedPnl: existingHolding ? Number(existingHolding.realizedPnl) : 0,
        cashBalance: Number(portfolio.cashBalance)
      },
      {
        side: input.side,
        quantity: input.quantity,
        price: input.price,
        fees: input.fees
      }
    );

    const transaction = await tx.portfolioTransaction.create({
      data: {
        portfolioId,
        assetId: asset.id,
        side: input.side,
        quantity: input.quantity,
        price: input.price,
        fees: input.fees,
        executedAt: input.executedAt,
        notes: input.notes ?? undefined
      },
      include: { asset: true }
    });

    const holding = await tx.portfolioHolding.upsert({
      where: { portfolioId_assetId: { portfolioId, assetId: asset.id } },
      update: {
        quantity: nextHolding.quantity,
        averageEntry: nextHolding.averageEntry,
        realizedPnl: nextHolding.realizedPnl
      },
      create: {
        portfolioId,
        assetId: asset.id,
        quantity: nextHolding.quantity,
        averageEntry: nextHolding.averageEntry,
        realizedPnl: nextHolding.realizedPnl
      },
      include: { asset: true }
    });

    const updatedPortfolio = await tx.portfolio.update({
      where: { id: portfolioId },
      data: { cashBalance: nextHolding.cashBalance }
    });

    return {
      transaction: {
        ...transaction,
        quantity: Number(transaction.quantity),
        price: Number(transaction.price),
        fees: Number(transaction.fees)
      },
      holding: serializeHolding(holding),
      portfolio: serializePortfolio(updatedPortfolio)
    };
  });
}

