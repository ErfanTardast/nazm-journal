import { describe, expect, it } from "vitest";
import { calculateJournalMetrics, closedEntries } from "@/lib/calculations/journal";
import { toEntries } from "@/lib/calculations/performance/entries";
import { perfTrade, sampleTrades } from "./support/performance-trades";

/** Three legs of one ladder: 1R, 2R and -1R on one stop, opened a second apart. */
function ladder(overrides: Parameters<typeof perfTrade>[0] = {}) {
  const leg = (id: string, ladderLeg: number, exitPrice: number, openSeconds: number, closedAt: string, mistakes: string[]) =>
    perfTrade({
      id,
      ladderKey: "K",
      ladderLeg,
      exitPrice,
      mistakes,
      openedAt: `2026-10-01T10:00:0${openSeconds}.000Z`,
      closedAt,
      ...overrides
    });
  return [
    leg("leg-3", 3, 99, 2, "2026-10-01T14:00:00.000Z", ["Late entry", "FOMO"]),
    leg("leg-1", 1, 101, 0, "2026-10-01T11:00:00.000Z", [" late entry ", ""]),
    leg("leg-2", 2, 102, 1, "2026-10-01T12:00:00.000Z", ["Late Entry"])
  ];
}

describe("closedEntries (journal.ts)", () => {
  it("hands calculateSetupMetrics the same entries it always counted", () => {
    const trades = [...ladder(), perfTrade({ exitPrice: 98 }), perfTrade({ ladderKey: "Z", ladderSize: 2, ladderLeg: 1 })];
    const { entries, combined, pendingLegs } = closedEntries(trades);
    const setups = calculateJournalMetrics(trades).setups;
    expect(entries).toHaveLength(setups.count);
    expect(combined).toBe(setups.combined);
    expect(pendingLegs).toBe(setups.pendingLegs);
    expect(entries.filter((entry) => entry.outcome.sign > 0)).toHaveLength(setups.wins);
  });

  it("keeps the legs of each entry", () => {
    const { entries } = closedEntries([...ladder(), perfTrade()]);
    expect(entries.map((entry) => entry.legs.length).sort()).toEqual([1, 3]);
  });
});

describe("toEntries", () => {
  it("makes one entry of a single trade", () => {
    const trade = perfTrade({ id: "solo", exitPrice: 102, takeProfit: 103, ruleFollowed: "followed", mistakes: [" Late "], emotionalState: "calm" });
    const { entries, combined, pendingLegs } = toEntries([trade]);
    expect({ combined, pendingLegs }).toEqual({ combined: 0, pendingLegs: 0 });
    expect(entries).toEqual([
      {
        id: "solo",
        legIds: ["solo"],
        first: trade,
        openedAt: trade.openedAt,
        closedAt: trade.closedAt,
        pnl: 2,
        r: 2,
        risk: 1,
        sign: 1,
        ruleFollowed: "followed",
        mistakes: ["Late"],
        emotionalState: "calm",
        plannedR: 3
      }
    ]);
  });

  it("counts the legs of one ladder once, with its tags once", () => {
    const { entries, combined, pendingLegs } = toEntries(ladder());
    expect({ count: entries.length, combined, pendingLegs }).toEqual({ count: 1, combined: 1, pendingLegs: 0 });
    const [entry] = entries;
    // The first leg is the earliest opened, whatever order the rows came in.
    expect(entry.id).toBe("leg-1");
    expect(entry.legIds).toEqual(["leg-1", "leg-2", "leg-3"]);
    expect(entry.first.id).toBe("leg-1");
    expect(entry.openedAt).toBe("2026-10-01T10:00:00.000Z");
    expect(entry.closedAt).toBe("2026-10-01T14:00:00.000Z");
    // +1, +2 and -1 money on 3 risk.
    expect(entry.pnl).toBeCloseTo(2, 10);
    expect(entry.risk).toBeCloseTo(3, 10);
    expect(entry.r).toBeCloseTo(2 / 3, 10);
    expect(entry.sign).toBe(1);
    // Leg 1 opened first and spelled it " late entry ", so that spelling is the one kept.
    expect(entry.mistakes).toEqual(["late entry", "FOMO"]);
  });

  it("leaves a ladder out while a leg is missing, closed late or still open", () => {
    const [leg3, leg1, leg2] = ladder({ ladderSize: 3 });
    // Two of three recorded: the entry is incomplete.
    expect(toEntries([leg1, leg2])).toMatchObject({ entries: [], pendingLegs: 2 });
    // Size unknown: two closed legs look complete, unless the third is known to be open (or closed out of the period).
    const unsized = ladder().filter((leg) => leg.id !== "leg-3");
    expect(toEntries(unsized)).toMatchObject({ combined: 1, pendingLegs: 0 });
    const stillOpen = { ...leg3, ladderSize: null, status: "open" as const, exitPrice: null, closedAt: null };
    const twoLegs = unsized.map((leg) => ({ ...leg, ladderSize: null }));
    expect(toEntries(twoLegs, [stillOpen])).toMatchObject({ entries: [], combined: 0, pendingLegs: 2 });
    // A leg closed outside the window holds the entry back the same way; a trade of another entry does not.
    const elsewhere = perfTrade({ status: "open", exitPrice: null, closedAt: null });
    expect(toEntries(twoLegs, [elsewhere]).entries).toHaveLength(1);
    expect(toEntries(twoLegs, [{ ...leg3, ladderSize: null }]).entries).toHaveLength(0);
  });

  it("takes the worst known rule verdict, and unknown only when every leg is unknown", () => {
    const verdicts = (...list: ("followed" | "mixed" | "broken" | "unknown")[]) =>
      toEntries(list.map((ruleFollowed, index) => perfTrade({ ladderKey: "V", ladderLeg: index + 1, ruleFollowed }))).entries[0].ruleFollowed;
    expect(verdicts("followed", "mixed")).toBe("mixed");
    expect(verdicts("followed", "broken", "mixed")).toBe("broken");
    expect(verdicts("unknown", "followed")).toBe("followed");
    expect(verdicts("unknown", "unknown")).toBe("unknown");
  });

  it("reads the planned R from the first leg's target and stop", () => {
    expect(toEntries([perfTrade({ takeProfit: 103 })]).entries[0].plannedR).toBe(3);
    expect(toEntries([perfTrade({ side: "short", entryPrice: 100, stopLoss: 102, takeProfit: 94, exitPrice: 98 })]).entries[0].plannedR).toBe(3);
    expect(toEntries([perfTrade({ takeProfit: null })]).entries[0].plannedR).toBeNull();
    expect(toEntries([perfTrade({ stopLoss: null, takeProfit: 103 })]).entries[0].plannedR).toBeNull();
    expect(toEntries([perfTrade({ stopLoss: 100, takeProfit: 103 })]).entries[0].plannedR).toBeNull();
  });

  it("gives an entry with no money result a null pnl and R, and still a win or loss from the price move", () => {
    // A lot-based forex trade with no stop and no stored money: nothing to price it with.
    const unpriced = perfTrade({ market: "forex", symbol: "EURUSD", quantity: 0.1, stopLoss: null, entryPrice: 1.1, exitPrice: 1.09 });
    const [entry] = toEntries([unpriced]).entries;
    expect(entry).toMatchObject({ pnl: null, r: null, risk: null, sign: -1 });
  });

  it("lists entries in close order", () => {
    const late = perfTrade({ id: "late", closedAt: "2026-10-02T11:00:00.000Z" });
    const early = perfTrade({ id: "early", closedAt: "2026-10-01T09:00:00.000Z" });
    expect(toEntries([late, early]).entries.map((entry) => entry.id)).toEqual(["early", "late"]);
  });

  it("uses the open time for a trade with no close time", () => {
    const [entry] = toEntries([perfTrade({ closedAt: null, openedAt: "2026-10-03T08:00:00.000Z" })]).entries;
    expect(entry.closedAt).toBe("2026-10-03T08:00:00.000Z");
  });

  it("counts every sample trade as its own entry", () => {
    const trades = sampleTrades(new Date("2026-10-04T10:00:00Z"));
    expect(toEntries(trades).entries).toHaveLength(30);
  });
});
