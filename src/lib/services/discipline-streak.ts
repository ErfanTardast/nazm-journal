import { prisma } from "@/lib/db/prisma";
import { calculateDisciplineStreak, type DisciplineDay, type DisciplineStreak } from "@/lib/calculations/discipline-streak";

export type DisciplineStreakSummary = DisciplineStreak & {
  /** Trading days left out of the streak because a trade that day has no rule verdict yet. */
  unreviewedDays: number;
};

/**
 * Read-only: derive the user's discipline streak from their trades. A day with a rule-broken or mixed trade
 * breaks the streak; a day whose trades all have a "followed" verdict extends it; a day with an unreviewed
 * ("unknown") trade and nothing broken is evidence of neither, so it is left out and counted separately.
 * Days are keyed by UTC date (deterministic). No writes.
 */
export async function getDisciplineStreak(userId: string, windowDays = 365): Promise<DisciplineStreakSummary> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const trades = await prisma.trade.findMany({
    where: { userId, openedAt: { gte: since } },
    select: { openedAt: true, ruleFollowed: true },
    orderBy: { openedAt: "asc" },
  });

  const byDay = new Map<string, { broke: boolean; unreviewed: boolean }>();
  for (const t of trades) {
    const date = t.openedAt.toISOString().slice(0, 10);
    const day = byDay.get(date) ?? { broke: false, unreviewed: false };
    day.broke ||= t.ruleFollowed === "broken" || t.ruleFollowed === "mixed";
    day.unreviewed ||= t.ruleFollowed === "unknown";
    byDay.set(date, day);
  }

  const reviewed = [...byDay.entries()].filter(([, day]) => day.broke || !day.unreviewed);
  const days: DisciplineDay[] = reviewed.map(([date, day]) => ({ date, disciplined: !day.broke }));
  return { ...calculateDisciplineStreak(days), unreviewedDays: byDay.size - reviewed.length };
}
