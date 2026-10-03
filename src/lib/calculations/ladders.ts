/**
 * Legs of one entry: an EA (or trader) splits an entry into N positions along a take-profit ladder. Each leg
 * stores what the legs of an entry share (its ladderKey: source account, symbol, direction, the EA's "k/N"
 * comment family and the initial stop) and its leg number. Which legs form one entry is
 * decided here, from open times, whenever metrics run, so legs stored by separate or overlapping imports
 * group the same way whatever arrived first.
 */

/** Legs of one entry are opened together; the window allows for an EA sending them one by one. */
export const LADDER_WINDOW_MS = 10_000;
/** Entries of one key looked at per leg; real EAs have a handful open at once, so a longer scan is noise. */
const MAX_ENTRIES_SCANNED = 32;

export type LadderLegInput = {
  ladderKey?: string | null;
  ladderLeg?: number | null;
  openedAt?: Date | string | number | null;
};

/**
 * An entry number per input, or -1 for a trade without a key or open time. Within a key, legs are taken in
 * open order; a leg joins the newest entry whose first leg opened within the window, unless that entry
 * already has its leg number, in which case it starts a new entry. Two entries under one key whose legs
 * interleave within the window cannot be told apart (the key carries the initial stop, so this needs the
 * same stop too); such legs join the newest entry missing their number.
 */
export function clusterLadders(legs: LadderLegInput[]): number[] {
  const clusters = legs.map(() => -1);
  const timed = legs
    .map((leg, index) => ({ index, key: leg.ladderKey, number: leg.ladderLeg ?? undefined, opened: toMs(leg.openedAt) }))
    .filter((leg): leg is { index: number; key: string; number: number | undefined; opened: number } => Boolean(leg.key) && Number.isFinite(leg.opened))
    .sort((a, b) => a.opened - b.opened || a.index - b.index);

  type Entry = { id: number; firstOpened: number; numbers: Set<number> };
  const entriesByKey = new Map<string, Entry[]>();
  let nextId = 0;
  for (const leg of timed) {
    const entries = entriesByKey.get(leg.key) ?? [];
    let entry: Entry | undefined;
    // Newest first (a leg after a new "1/N" belongs to it); older entries opened before the window end the scan.
    const oldest = Math.max(0, entries.length - MAX_ENTRIES_SCANNED);
    for (let i = entries.length - 1; i >= oldest && leg.opened - entries[i].firstOpened <= LADDER_WINDOW_MS; i--) {
      if (leg.number === undefined || !entries[i].numbers.has(leg.number)) {
        entry = entries[i];
        break;
      }
    }
    if (!entry) {
      entry = { id: nextId++, firstOpened: leg.opened, numbers: new Set() };
      entries.push(entry);
      entriesByKey.set(leg.key, entries);
    }
    if (leg.number !== undefined) entry.numbers.add(leg.number);
    clusters[leg.index] = entry.id;
  }
  return clusters;
}

/** For each trade, the ids of every leg of its entry (itself included); a trade outside a ladder is alone. */
export function entryLegIds<T extends LadderLegInput & { id: string }>(trades: T[]): Map<string, string[]> {
  const clusters = clusterLadders(trades);
  const byEntry = new Map<number, string[]>();
  trades.forEach((trade, index) => {
    if (clusters[index] !== -1) byEntry.set(clusters[index], [...(byEntry.get(clusters[index]) ?? []), trade.id]);
  });
  return new Map(trades.map((trade, index) => [trade.id, clusters[index] === -1 ? [trade.id] : (byEntry.get(clusters[index]) ?? [trade.id])]));
}

function toMs(value: LadderLegInput["openedAt"]) {
  if (value === null || value === undefined) return NaN;
  return value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
}
