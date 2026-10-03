import { prisma } from "@/lib/db/prisma";

export type MistakePattern = {
  mistake: string;
  frequency: number;
  streak: number;
  lastSeen: Date;
  avgRImpact: number | null;
};

export async function getMistakeMemory(userId: string, windowDays = 30): Promise<MistakePattern[]> {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  // Dated by the trade, not the journal row: an import creates rows for old trades on the day it runs.
  const entries = await prisma.tradeJournalEntry.findMany({
    where: { userId, trade: { openedAt: { gte: windowStart } }, mistakes: { isEmpty: false } },
    select: {
      mistakes: true,
      trade: { select: { rMultiple: true, openedAt: true } }
    },
    orderBy: { trade: { openedAt: "desc" } }
  });

  // Map: mistake label → list of occurrences
  const map = new Map<string, { dates: Date[]; rValues: (number | null)[] }>();

  for (const entry of entries) {
    for (const raw of entry.mistakes) {
      const label = raw.trim();
      if (!label) continue;
      const existing = map.get(label) ?? { dates: [], rValues: [] };
      const r = entry.trade?.rMultiple != null ? Number(entry.trade.rMultiple) : null;
      existing.dates.push(entry.trade.openedAt);
      existing.rValues.push(r);
      map.set(label, existing);
    }
  }

  // Compute streak using the 5 most recent journal sessions
  const recentSessionMistakes = entries
    .slice(0, 5)
    .map((e) => new Set(e.mistakes.map((m) => m.trim())));

  const patterns: MistakePattern[] = [];

  for (const [mistake, { dates, rValues }] of map.entries()) {
    const frequency = dates.length;
    const lastSeen = dates[0]; // already sorted desc

    const numericR = rValues.filter((r): r is number => r !== null && Number.isFinite(r));
    const avgRImpact =
      numericR.length > 0 ? numericR.reduce((sum, r) => sum + r, 0) / numericR.length : null;

    const streak = recentSessionMistakes.filter((sessionSet) => sessionSet.has(mistake)).length;

    patterns.push({ mistake, frequency, streak, lastSeen, avgRImpact });
  }

  return patterns
    .sort((a, b) => b.frequency - a.frequency || b.streak - a.streak)
    .slice(0, 10);
}
