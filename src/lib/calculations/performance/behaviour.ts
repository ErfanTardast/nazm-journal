import { resultGroup } from "./summary";
import { dayKey } from "./time";
import { R_TOLERANCE, REENTRY_WINDOW_MINUTES, SIZE_UP_FACTOR, type BehaviourReport, type PerformanceEntry, type ResultGroup, type RuleVerdict } from "./types";

const time = (iso: string) => Date.parse(iso);
const byId = (a: PerformanceEntry, b: PerformanceEntry) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The entries in the order they were opened (the id settles a tie), so the answers do not depend on the order given. */
const inOpeningOrder = (entries: PerformanceEntry[]) => [...entries].sort((a, b) => time(a.openedAt) - time(b.openedAt) || time(a.closedAt) - time(b.closedAt) || byId(a, b));

const VERDICTS: RuleVerdict[] = ["followed", "mixed", "broken", "unknown"];

/** Every verdict gets its group, an empty one when nobody got it: the four add up to the entries. */
function adherenceGroups(entries: PerformanceEntry[]): Record<RuleVerdict, ResultGroup> {
  const groups = Object.fromEntries(VERDICTS.map((verdict) => [verdict, resultGroup(entries.filter((entry) => entry.ruleFollowed === verdict))]));
  return groups as Record<RuleVerdict, ResultGroup>;
}

/** The middle of the sorted values (the mean of the two middle ones when there is an even number); null when there are none. */
function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Entries opened within REENTRY_WINDOW_MINUTES after an earlier entry closed at a loss. It is the earlier entry's
 * close that counts: a position that was still open when this one opened is not a re-entry, and neither is one
 * that followed a win or a breakeven. A re-entry is "sized up" when its risk is above SIZE_UP_FACTOR times the
 * median risk of the input's entries that have a known risk; one without a risk never is.
 */
function reentries(entries: PerformanceEntry[]): BehaviourReport["reentry"] {
  const window = REENTRY_WINDOW_MINUTES * 60_000;
  const losses = entries
    .filter((entry) => entry.sign < 0)
    .map((entry) => ({ id: entry.id, closed: time(entry.closedAt) }))
    .sort((a, b) => a.closed - b.closed);
  const found = inOpeningOrder(entries).filter((entry) => {
    const opened = time(entry.openedAt);
    // The last loss that closed at or before the open, then back while still inside the window; an entry is not its own predecessor.
    let low = 0;
    let high = losses.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (losses[middle].closed <= opened) low = middle + 1;
      else high = middle;
    }
    for (let index = low - 1; index >= 0 && losses[index].closed >= opened - window; index--) {
      if (losses[index].id !== entry.id) return true;
    }
    return false;
  });
  const usual = median(entries.flatMap((entry) => (entry.risk !== null && entry.risk > 0 ? [entry.risk] : [])));
  // A small allowance, so a risk of exactly 1.2 times the median is not "above" it by float noise.
  const sizedUp = found.filter((entry) => usual !== null && entry.risk !== null && entry.risk - SIZE_UP_FACTOR * usual > 1e-9).length;
  return { windowMinutes: REENTRY_WINDOW_MINUTES, count: found.length, sizedUp, result: resultGroup(found), entryIds: found.map((entry) => entry.id) };
}

/**
 * Results by the entry's place among the entries opened that day (the day on the trader's clock): first, second,
 * third and every later one. `busiestDay` is the day with the most entries, the earlier one when two tie.
 */
function ordersInDay(entries: PerformanceEntry[], timeZone: string): BehaviourReport["orderInDay"] {
  const days = new Map<string, PerformanceEntry[]>();
  for (const entry of inOpeningOrder(entries)) {
    const key = dayKey(entry.openedAt, timeZone);
    const opened = days.get(key);
    if (opened) opened.push(entry);
    else days.set(key, [entry]);
  }
  const places: PerformanceEntry[][] = [[], [], []];
  let busiest: { day: string; entries: number } | null = null;
  for (const [day, opened] of [...days.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    opened.forEach((entry, index) => places[Math.min(index, 2)].push(entry));
    if (!busiest || opened.length > busiest.entries) busiest = { day, entries: opened.length };
  }
  return { first: resultGroup(places[0]), second: resultGroup(places[1]), thirdPlus: resultGroup(places[2]), busiestDay: busiest };
}

type Exit = "atTarget" | "beforeTarget" | "atStop" | "beyondStop" | "beforeStop" | "breakeven" | "noPlan";

/** A small allowance, so an R that is 0.1 from a mark by float noise is still on it. */
const EDGE = 1e-9;

/**
 * How an entry ended against its first leg's stop and target, by the entry's R (to 4 decimals) and R_TOLERANCE:
 * a win at or above the planned R less the tolerance is at target, any other win is before target; a loss within
 * the tolerance of -1R is at stop, a bigger one is beyond stop, a smaller one is before stop; 0 is breakeven.
 * Without a stop, a target or an R there is no plan to measure against.
 */
function exitOf(entry: PerformanceEntry): Exit {
  const { r, plannedR, first } = entry;
  if (r === null || plannedR === null || first.stopLoss === null || first.takeProfit === null) return "noPlan";
  const reached = Math.round(r * 10_000) / 10_000;
  if (reached > 0) return reached >= plannedR - R_TOLERANCE - EDGE ? "atTarget" : "beforeTarget";
  if (reached === 0) return "breakeven";
  if (reached < -1 - R_TOLERANCE - EDGE) return "beyondStop";
  return reached > -1 + R_TOLERANCE + EDGE ? "beforeStop" : "atStop";
}

const mean = (values: number[]) => (values.length ? values.reduce((total, value) => total + value, 0) / values.length : null);

/** How the entries ended, counted; the two averages are over the winners that closed before target. */
function exitsOf(entries: PerformanceEntry[]): BehaviourReport["exits"] {
  const counts: Record<Exit, number> = { atTarget: 0, beforeTarget: 0, atStop: 0, beyondStop: 0, beforeStop: 0, breakeven: 0, noPlan: 0 };
  const early: PerformanceEntry[] = [];
  for (const entry of entries) {
    const exit = exitOf(entry);
    counts[exit] += 1;
    if (exit === "beforeTarget") early.push(entry);
  }
  return {
    ...counts,
    averagePlannedR: mean(early.flatMap((entry) => (entry.plannedR === null ? [] : [entry.plannedR]))),
    averageReachedR: mean(early.flatMap((entry) => (entry.r === null ? [] : [entry.r])))
  };
}

/** Rule adherence against results, re-entry after a loss, results by the entry's order in the day, and how trades ended. */
export function behaviour(entries: PerformanceEntry[], ctx: { timeZone: string }): BehaviourReport {
  return {
    adherence: adherenceGroups(entries),
    reentry: reentries(entries),
    orderInDay: ordersInDay(entries, ctx.timeZone),
    exits: exitsOf(entries)
  };
}
