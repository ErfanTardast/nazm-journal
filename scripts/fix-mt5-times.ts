/**
 * Re-read the open/close times of imported MT5 positions in each owner's broker time zone (Settings; New York
 * close when unset). Imports before that setting existed parsed the report's zone-less broker times in the app
 * server's own zone. The raw report value is kept on the trade's import row, so this recomputes from it and is
 * safe to run again. Report only by default; --apply writes.
 *
 *   npm run db:fix-mt5-times
 *   npm run db:fix-mt5-times -- --apply
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { mt5TimesFromImportRow } from "@/lib/import/mt5-times";
import { NEW_YORK_CLOSE } from "@/lib/time/zones";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const same = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

async function main() {
  const trades = await prisma.trade.findMany({
    where: { externalId: { startsWith: "mt5:" }, importRow: { isNot: null } },
    select: {
      id: true,
      openedAt: true,
      closedAt: true,
      user: { select: { brokerTimeZone: true } },
      importRow: { select: { rawData: true, tradeImport: { select: { mapping: true } } } }
    }
  });

  let changed = 0;
  let unresolved = 0;
  for (const trade of trades) {
    const zone = trade.user.brokerTimeZone ?? NEW_YORK_CLOSE;
    const raw = (trade.importRow?.rawData ?? {}) as Record<string, unknown>;
    const mapping = (trade.importRow?.tradeImport?.mapping ?? null) as Record<string, unknown> | null;
    const times = mt5TimesFromImportRow(raw, mapping, zone);
    if (!times) {
      unresolved += 1; // no zone-less open time on the import row: cannot be recomputed
      continue;
    }
    const { openedAt, closedAt } = times;
    if (same(openedAt, trade.openedAt) && same(closedAt ?? trade.closedAt, trade.closedAt)) continue;

    changed += 1;
    if (changed <= 3) {
      console.log(`${trade.id}: opened ${trade.openedAt.toISOString()} -> ${openedAt.toISOString()} (${String(raw.openedAt)} in ${zone})`);
    }
    if (apply) await prisma.trade.update({ where: { id: trade.id }, data: { openedAt, ...(closedAt ? { closedAt } : {}) } });
  }

  if (unresolved) console.log(`${unresolved} trades have no raw report time on their import row and were left as they are.`);
  console.log(
    apply
      ? `Updated ${changed} of ${trades.length} imported MT5 trades.`
      : `${changed} of ${trades.length} imported MT5 trades would change. Nothing written; run again with --apply to write.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
