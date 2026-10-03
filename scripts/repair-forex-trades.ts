/**
 * One-off repair: forex rows saved while every market was treated as units stored P&L, risk and R as
 * price x lots (risk ~0.001, R in the thousands). Report only by default; --apply writes the new values.
 * Safe to run again: a repaired row no longer matches the old formula.
 *
 *   npm run db:repair-forex
 *   npm run db:repair-forex -- --apply
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { repairLegacyLotOutcome } from "@/lib/calculations/journal";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const toNumber = (value: { toString(): string } | null) => (value === null ? null : Number(value));
const show = (value: number | null) => (value === null ? "-" : String(Number(value.toFixed(4))));

async function main() {
  const rows = await prisma.trade.findMany({
    where: { market: "forex" },
    select: {
      id: true,
      symbol: true,
      side: true,
      status: true,
      entryPrice: true,
      exitPrice: true,
      stopLoss: true,
      quantity: true,
      fees: true,
      riskAmount: true,
      realizedPnl: true,
      rMultiple: true
    }
  });

  let repaired = 0;
  for (const row of rows) {
    const before = { riskAmount: toNumber(row.riskAmount), realizedPnl: toNumber(row.realizedPnl), rMultiple: toNumber(row.rMultiple) };
    const next = repairLegacyLotOutcome({
      market: "forex",
      symbol: row.symbol,
      side: row.side,
      status: row.status,
      entryPrice: Number(row.entryPrice),
      exitPrice: toNumber(row.exitPrice),
      stopLoss: toNumber(row.stopLoss),
      quantity: Number(row.quantity),
      fees: Number(row.fees),
      ...before
    });
    if (!next) continue;

    repaired += 1;
    console.log(
      `${row.id} ${row.symbol}: risk ${show(before.riskAmount)} -> ${show(next.riskAmount)}, ` +
        `P&L ${show(before.realizedPnl)} -> ${show(next.realizedPnl)}, R ${show(before.rMultiple)} -> ${show(next.rMultiple)}`
    );
    if (apply) await prisma.trade.update({ where: { id: row.id }, data: next });
  }

  console.log(
    apply
      ? `Repaired ${repaired} of ${rows.length} forex trades.`
      : `${repaired} of ${rows.length} forex trades need repair. Nothing written; run again with --apply to write.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
