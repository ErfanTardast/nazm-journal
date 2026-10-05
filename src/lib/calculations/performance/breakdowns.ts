import { sessionOf } from "./sessions";
import { resultGroup } from "./summary";
import { dayKey, weekdayOf } from "./time";
import { LOW_SAMPLE_ROW, type BreakdownLabel, type BreakdownRow, type Dimension, type LabelKey, type PerformanceEntry } from "./types";

/**
 * One group an entry falls into: a key the client translates, or the trader's own words. Free text is trimmed and
 * grouped ignoring case, so its id is the folded text and the spellings are counted to show the most used one.
 */
type Value = { id: string; label: BreakdownLabel; derived?: boolean } | { id: string; text: string };

const keyValue = (key: LabelKey, derived = false): Value => ({ id: `key:${key}`, label: { kind: "key", key }, derived });

/** The trader's words; blank or missing is the key "none". */
export function textValue(raw: string | null | undefined): Value {
  const text = raw?.trim() ?? "";
  return text ? { id: `text:${text.toLowerCase()}`, text } : keyValue("none");
}

const labelText = (label: BreakdownLabel) => (label.kind === "key" ? label.key : label.text);
const before = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0); // code units: the same on every machine

type Bucket = { value: Value; entries: PerformanceEntry[]; spellings: Map<string, number>; derived: boolean };

/** The spelling used most, the smaller one (by code units) when two are used equally often. */
function mostUsed(spellings: Map<string, number>) {
  let best = "";
  let bestCount = 0;
  for (const [spelling, count] of spellings) {
    if (count > bestCount || (count === bestCount && before(spelling, best) < 0)) {
      best = spelling;
      bestCount = count;
    }
  }
  return best;
}

/**
 * One row per group of entries. An entry can sit in more than one group (it does for mistakes: one row for each
 * tag) but never twice in the same one. Every row is returned, sorted by net P&L, then entries, then label.
 */
export function rowsBy(entries: PerformanceEntry[], valuesOf: (entry: PerformanceEntry) => Value[]): BreakdownRow[] {
  const buckets = new Map<string, Bucket>();
  for (const entry of entries) {
    const seen = new Set<string>();
    for (const value of valuesOf(entry)) {
      if (seen.has(value.id)) continue;
      seen.add(value.id);
      const bucket = buckets.get(value.id) ?? { value, entries: [], spellings: new Map<string, number>(), derived: false };
      bucket.entries.push(entry);
      if ("text" in value) bucket.spellings.set(value.text, (bucket.spellings.get(value.text) ?? 0) + 1);
      // A row that holds any entry whose value was worked out (a session from the open time) says so.
      else if (value.derived) bucket.derived = true;
      buckets.set(value.id, bucket);
    }
  }
  return [...buckets.entries()]
    .map(([id, { value, entries: grouped, spellings, derived }]): BreakdownRow => {
      const label: BreakdownLabel = "text" in value ? { kind: "text", text: mostUsed(spellings) } : value.label;
      return {
        ...resultGroup(grouped),
        id,
        label,
        derived,
        unpriced: grouped.filter((entry) => entry.pnl === null).length,
        lowSample: grouped.length < LOW_SAMPLE_ROW
      };
    })
    .sort((a, b) => b.netPnl - a.netPnl || b.entries - a.entries || before(labelText(a.label), labelText(b.label)) || before(a.id, b.id));
}

const PLAN_CONVERSION = "planned-trade-conversion";

function setupValue(entry: PerformanceEntry): Value {
  const value = textValue(entry.first.setupType);
  return "text" in value && value.text.toLowerCase() === PLAN_CONVERSION ? keyValue("setup.from_plan") : value;
}

/** The session the trader wrote (as a key when it is a known one) or, with none written, the one of the open time. */
function sessionValue(entry: PerformanceEntry): Value[] {
  const { label, derived } = sessionOf(entry);
  return [label.kind === "key" ? keyValue(label.key, derived) : textValue(label.text)];
}

const GROUPINGS: Record<Dimension, (ctx: { timeZone: string }) => (entry: PerformanceEntry) => Value[]> = {
  strategy: () => (entry) => [textValue(entry.first.strategyName)],
  symbol: () => (entry) => [textValue(entry.first.symbol)],
  market: () => (entry) => [keyValue(`market.${entry.first.market}`)],
  side: () => (entry) => [keyValue(`side.${entry.first.side}`)],
  session: () => sessionValue,
  weekday: (ctx) => (entry) => [keyValue(`weekday.${weekdayOf(dayKey(entry.openedAt, ctx.timeZone))}`)],
  setup: () => (entry) => [setupValue(entry)],
  mistake: () => (entry) => entry.mistakes.map(textValue),
  emotion: () => (entry) => [textValue(entry.emotionalState)]
};

/**
 * Every row of every dimension, one row per group of entries, none hidden. The rows of strategy, symbol, market,
 * side and setup each hold every entry once, so they add up to the headline's entries and net P&L; a mistake row
 * counts an entry once for each tag it has, and the entries with no tag are in none of them. The session is the
 * trader's own word, or the open time's session when there is none (a row says so with `derived`), and the
 * weekday is the entry's open day in the trader's time zone, so a trade just after midnight there is a new day.
 */
export function allBreakdowns(entries: PerformanceEntry[], ctx: { timeZone: string }): Record<Dimension, BreakdownRow[]> {
  const rows = (dimension: Dimension) => rowsBy(entries, GROUPINGS[dimension](ctx));
  return {
    strategy: rows("strategy"),
    symbol: rows("symbol"),
    market: rows("market"),
    side: rows("side"),
    session: rows("session"),
    weekday: rows("weekday"),
    setup: rows("setup"),
    mistake: rows("mistake"),
    emotion: rows("emotion")
  };
}

/**
 * The ids of the trades behind one row: every leg of every entry the row holds, in the order of the entries. It
 * groups with the same function as `allBreakdowns`, so a row's ids always match its entry count. A row id that
 * names no row gives an empty list.
 */
export function rowTradeIds(entries: PerformanceEntry[], dimension: Dimension, rowId: string, ctx: { timeZone: string }): string[] {
  const valuesOf = GROUPINGS[dimension](ctx);
  return entries.filter((entry) => valuesOf(entry).some((value) => value.id === rowId)).flatMap((entry) => entry.legIds);
}
