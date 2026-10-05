import { closedEntries, type ClosedEntry } from "../journal";
import type { PerformanceEntry, PerformanceTrade, RuleVerdict } from "./types";

/** The worse verdict wins when the legs of one entry disagree; unknown loses to any known one. */
const VERDICT_RANK: Record<RuleVerdict, number> = { unknown: 0, followed: 1, mixed: 2, broken: 3 };

const time = (iso: string) => Date.parse(iso);
const closeTime = (trade: PerformanceTrade) => time(trade.closedAt ?? trade.openedAt);

/** Earliest open first, then the leg number the EA gave it; the rows' own order settles the rest. */
function byOpening(a: PerformanceTrade, b: PerformanceTrade) {
  return time(a.openedAt) - time(b.openedAt) || (a.ladderLeg ?? Number.MAX_SAFE_INTEGER) - (b.ladderLeg ?? Number.MAX_SAFE_INTEGER);
}

/** The trader's tags for the entry: trimmed, empty ones dropped, one per spelling ignoring case (the first is kept). */
function tagsOf(legs: PerformanceTrade[]) {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const leg of legs) {
    for (const raw of leg.mistakes) {
      const tag = raw.trim();
      if (tag && !seen.has(tag.toLowerCase())) {
        seen.add(tag.toLowerCase());
        tags.push(tag);
      }
    }
  }
  return tags;
}

function plannedRFor(trade: PerformanceTrade) {
  if (trade.takeProfit === null || trade.stopLoss === null) return null;
  const stopDistance = Math.abs(trade.entryPrice - trade.stopLoss);
  return stopDistance > 0 ? Math.abs(trade.takeProfit - trade.entryPrice) / stopDistance : null;
}

function toEntry({ legs: unordered, outcome }: ClosedEntry<PerformanceTrade>): PerformanceEntry {
  const legs = [...unordered].sort(byOpening);
  const first = legs[0];
  const lastClose = legs.reduce((latest, leg) => (closeTime(leg) > closeTime(latest) ? leg : latest));
  return {
    id: first.id,
    legIds: legs.map((leg) => leg.id),
    first,
    openedAt: first.openedAt,
    closedAt: lastClose.closedAt ?? lastClose.openedAt,
    pnl: outcome.pnl ?? null,
    r: outcome.r ?? null,
    risk: outcome.risk ?? null,
    sign: outcome.sign > 0 ? 1 : outcome.sign < 0 ? -1 : 0,
    ruleFollowed: legs.reduce<RuleVerdict>((worst, leg) => (VERDICT_RANK[leg.ruleFollowed] > VERDICT_RANK[worst] ? leg.ruleFollowed : worst), "unknown"),
    mistakes: tagsOf(legs),
    emotionalState: first.emotionalState,
    plannedR: plannedRFor(first)
  };
}

/**
 * The closed trades as entries, in close order. The legs of one ladder entry count once (clusterLadders, through
 * journal.ts closedEntries, so the rules are the headline's), and only when every leg is closed: `outside` is
 * every other trade that can hold an entry back, the ones still open and the ones closed outside the period.
 * Without it an entry whose other legs fall outside the window would look complete.
 */
export function toEntries(closed: PerformanceTrade[], outside: PerformanceTrade[] = []) {
  const holding = outside.filter((trade) => trade.status === "open" || trade.status === "closed").map((trade) => ({ ...trade, status: "open" as const }));
  const { entries, combined, pendingLegs } = closedEntries<PerformanceTrade>([...closed, ...holding]);
  return {
    entries: entries.map(toEntry).sort((a, b) => time(a.closedAt) - time(b.closedAt) || time(a.openedAt) - time(b.openedAt)),
    pendingLegs,
    combined
  };
}
