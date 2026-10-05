import { behaviour } from "./performance/behaviour";
import { rowsBy, textValue } from "./performance/breakdowns";
import type { PerformanceEntry } from "./performance/types";

/**
 * The one finding the dashboard puts in front of the trader for the last seven days: the repeated pattern that cost
 * the most R. It is deterministic, built from the trades alone (no AI call), and it only describes what happened.
 * A pattern is named by what was measured, or by the trader's own tag; the app does not judge it.
 */

export const MIN_MISTAKE_COUNT = 2;
export const MIN_RULE_BREAKS = 1;
export const MIN_REENTRIES = 2;

export type FocusKind = "mistake" | "rule_breaks" | "reentry";

type Tally = { count: number; totalR: number; withoutR?: number };

export type WeekFocusInput = {
  /** One row per tag the trader wrote, grouped ignoring case, in the trader's words. */
  mistakes: (Tally & { label: string })[];
  /** Entries whose rule verdict is "broken". */
  ruleBreaks: Tally;
  /** Entries opened within 30 minutes after an entry closed at a loss. */
  reentries: Tally;
};

export type WeekFocus = {
  kind: FocusKind;
  /** The trader's own tag, for a mistake. */
  label?: string;
  count: number;
  /** Sum of R over the entries that have one. */
  totalR: number;
  /** Entries of the finding with no R (no stop), left out of totalR. */
  withoutR: number;
};

/** The order kinds win a complete tie in. */
const KIND_RANK: Record<FocusKind, number> = { rule_breaks: 0, mistake: 1, reentry: 2 };

/** Away from float noise, so two totals that are the same on screen tie. */
const clean = (value: number) => Math.round(value * 1e6) / 1e6;
const before = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The pattern with the most negative total R; the higher count, then the kind, then the tag's text settle a tie. Null when none qualifies. */
export function weekFocus(input: WeekFocusInput): WeekFocus | null {
  const found: WeekFocus[] = [
    ...input.mistakes.filter((tag) => tag.count >= MIN_MISTAKE_COUNT).map((tag): WeekFocus => ({ kind: "mistake", label: tag.label, count: tag.count, totalR: clean(tag.totalR), withoutR: tag.withoutR ?? 0 })),
    ...(input.ruleBreaks.count >= MIN_RULE_BREAKS ? [{ kind: "rule_breaks" as const, count: input.ruleBreaks.count, totalR: clean(input.ruleBreaks.totalR), withoutR: input.ruleBreaks.withoutR ?? 0 }] : []),
    ...(input.reentries.count >= MIN_REENTRIES ? [{ kind: "reentry" as const, count: input.reentries.count, totalR: clean(input.reentries.totalR), withoutR: input.reentries.withoutR ?? 0 }] : [])
  ];
  found.sort((a, b) => a.totalR - b.totalR || b.count - a.count || KIND_RANK[a.kind] - KIND_RANK[b.kind] || before(a.label ?? "", b.label ?? ""));
  return found[0] ?? null;
}

function tally(entries: PerformanceEntry[]): Required<Tally> {
  const withR = entries.flatMap((entry) => (entry.r === null ? [] : [entry.r]));
  return { count: entries.length, totalR: clean(withR.reduce((total, r) => total + r, 0)), withoutR: entries.length - withR.length };
}

/**
 * What `weekFocus` reads, from the closed entries of the last seven days (the caller passes the window's entries).
 * Tags are grouped as the Performance page groups them (ignoring case, the spelling used most is shown); the
 * re-entries are the behaviour report's, so both screens count the same ones.
 */
export function weekFocusInput(entries: PerformanceEntry[], ctx: { timeZone: string }): WeekFocusInput {
  const byTag = new Map(rowsBy(entries, (entry) => entry.mistakes.map(textValue)).map((row) => [row.id, row]));
  const grouped = new Map<string, PerformanceEntry[]>();
  for (const entry of entries) {
    for (const id of new Set(entry.mistakes.map((tag) => textValue(tag).id))) grouped.set(id, [...(grouped.get(id) ?? []), entry]);
  }
  const mistakes = [...grouped.entries()].flatMap(([id, tagged]) => {
    const label = byTag.get(id)?.label;
    return label?.kind === "text" ? [{ label: label.text, ...tally(tagged) }] : [];
  });
  const reentryIds = new Set(behaviour(entries, ctx).reentry.entryIds);
  return {
    mistakes,
    ruleBreaks: tally(entries.filter((entry) => entry.ruleFollowed === "broken")),
    reentries: tally(entries.filter((entry) => reentryIds.has(entry.id)))
  };
}
