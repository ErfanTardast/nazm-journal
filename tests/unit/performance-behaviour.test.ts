import { describe, expect, it } from "vitest";
import { behaviour } from "@/lib/calculations/performance/behaviour";
import { toEntries } from "@/lib/calculations/performance/entries";
import { REENTRY_WINDOW_MINUTES, SIZE_UP_FACTOR, type PerformanceTrade, type RuleVerdict } from "@/lib/calculations/performance/types";
import { perfTrade, sampleTrades } from "./support/performance-trades";

const NOW = new Date("2026-10-04T10:00:00Z");
const UTC = { timeZone: "UTC" };

const at = (time: string, day = "2026-10-01") => `${day}T${time}:00.000Z`;

/** One entry that opens and closes at the given times, with the money it ends on (R = pnl / risk, risk 100 unless told). */
function entryOf(open: string, close: string, pnl: number, overrides: Partial<PerformanceTrade> = {}) {
  return toEntries([
    perfTrade({ openedAt: open, closedAt: close, realizedPnl: pnl, rMultiple: pnl / 100, riskAmount: 100, ...overrides })
  ]).entries[0];
}

describe("rule adherence against results", () => {
  const { entries } = toEntries(sampleTrades(NOW));
  const { adherence } = behaviour(entries, UTC);
  const totalR = (verdict: RuleVerdict) => (adherence[verdict].averageR ?? 0) * adherence[verdict].entries;

  it("gives followed 24 entries at +15.5R, mixed 4 at -4.0R and broken 2 at -2.8R on the sample", () => {
    expect(adherence.followed.entries).toBe(24);
    expect(totalR("followed")).toBeCloseTo(15.5, 9);
    expect(adherence.mixed.entries).toBe(4);
    expect(totalR("mixed")).toBeCloseTo(-4, 9);
    expect(adherence.broken.entries).toBe(2);
    expect(totalR("broken")).toBeCloseTo(-2.8, 9);
  });

  it("has an empty group, not a missing one, for a verdict nobody got", () => {
    expect(adherence.unknown).toEqual({ entries: 0, wins: 0, losses: 0, winRate: null, netPnl: 0, averageR: null });
  });

  it("splits money and wins by verdict and puts up the four groups to every entry", () => {
    const total = Object.values(adherence).reduce((sum, group) => sum + group.entries, 0);
    expect(total).toBe(entries.length);
    expect(adherence.followed).toMatchObject({ wins: 17, losses: 7 });
    expect(adherence.broken).toMatchObject({ wins: 0, losses: 2 });
    expect(adherence.broken.netPnl).toBeCloseTo(-328, 9);
  });

  it("reads the worst verdict of a ladder's legs, and an unreviewed trade as unknown", () => {
    const legs = (verdicts: RuleVerdict[]) => verdicts.map((ruleFollowed, index) => perfTrade({ ruleFollowed, ladderKey: "k", ladderLeg: index + 1, ladderSize: verdicts.length, openedAt: `2026-10-01T08:00:0${index + 1}.000Z`, closedAt: at("09:00") }));
    const report = behaviour(toEntries([...legs(["followed", "broken", "mixed"]), perfTrade({ ruleFollowed: "unknown" })]).entries, UTC);
    expect(report.adherence.broken.entries).toBe(1);
    expect(report.adherence.unknown.entries).toBe(1);
    expect(report.adherence.followed.entries).toBe(0);
  });
});

describe("re-entry after a loss", () => {
  it("reports the window it measures", () => {
    expect(behaviour([], UTC).reentry).toMatchObject({ windowMinutes: REENTRY_WINDOW_MINUTES, count: 0, sizedUp: 0, entryIds: [] });
    expect(REENTRY_WINDOW_MINUTES).toBe(30);
  });

  it("finds 2 on the sample, 25 and 15 minutes after a loss, and 1 of them sized up", () => {
    const { entries } = toEntries(sampleTrades(NOW));
    const { reentry } = behaviour(entries, UTC);
    expect(reentry).toMatchObject({ count: 2, sizedUp: 1, entryIds: ["trade-09", "trade-12"] });
    expect(reentry.result).toMatchObject({ entries: 2, wins: 1, losses: 1 });
    expect(reentry.result.netPnl).toBeCloseTo(120 - 168, 9);
  });

  it("counts a re-entry exactly 30 minutes after the loss closed, and not 31", () => {
    const loss = entryOf(at("08:00"), at("09:00"), -100);
    expect(behaviour([loss, entryOf(at("09:30"), at("10:00"), 50)], UTC).reentry.count).toBe(1);
    expect(behaviour([loss, entryOf(at("09:31"), at("10:00"), 50)], UTC).reentry.count).toBe(0);
  });

  it("counts an entry opened the moment the loss closed", () => {
    expect(behaviour([entryOf(at("08:00"), at("09:00"), -100), entryOf(at("09:00"), at("09:20"), 10)], UTC).reentry.count).toBe(1);
  });

  it("does not count an entry opened while the loss was still open", () => {
    const loss = entryOf(at("08:00"), at("09:00"), -100);
    const overlapping = entryOf(at("08:50"), at("09:40"), 10);
    expect(behaviour([loss, overlapping], UTC).reentry.count).toBe(0);
  });

  it("counts only a loss: a win or a breakeven before it does not make a re-entry", () => {
    const win = entryOf(at("08:00"), at("09:00"), 100);
    const flat = entryOf(at("09:00"), at("09:10"), 0, { exitPrice: 100, realizedPnl: 0, rMultiple: 0 });
    const next = entryOf(at("09:20"), at("09:50"), -10);
    expect(behaviour([win, flat, next], UTC).reentry.count).toBe(0);
  });

  it("counts a chain of losses one by one", () => {
    const [a, b, c] = [entryOf(at("08:00"), at("08:10"), -100), entryOf(at("08:20"), at("08:30"), -100), entryOf(at("08:40"), at("08:50"), -100)];
    const { reentry } = behaviour([a, b, c], UTC);
    expect(reentry.count).toBe(2);
    expect(reentry.entryIds).toEqual([b.id, c.id]);
  });

  it("measures a ladder from its last leg's close", () => {
    const legs = [1, 2].map((leg) => perfTrade({ ladderKey: "k", ladderLeg: leg, ladderSize: 2, openedAt: `2026-10-01T08:00:0${leg}.000Z`, closedAt: at(leg === 1 ? "08:20" : "09:00"), realizedPnl: -50, rMultiple: -0.5, riskAmount: 100 }));
    const next = entryOf(at("09:25"), at("09:50"), 20);
    const { entries } = toEntries([...legs, next.first]);
    expect(entries).toHaveLength(2);
    expect(behaviour(entries, UTC).reentry.count).toBe(1);
  });

  it("gives the same answer for any input order, without changing the input", () => {
    const { entries } = toEntries(sampleTrades(NOW));
    const reversed = [...entries].reverse();
    const before = JSON.stringify(reversed);
    expect(behaviour(reversed, UTC).reentry).toEqual(behaviour(entries, UTC).reentry);
    expect(JSON.stringify(reversed)).toBe(before);
  });

  describe("sized up", () => {
    const loss = () => entryOf(at("08:00"), at("08:10"), -100);
    const withRisk = (risk: number | null) =>
      risk === null
        ? entryOf(at("08:20"), at("08:30"), 10, { stopLoss: null, riskAmount: null, rMultiple: null })
        : entryOf(at("08:20"), at("08:30"), 10, { riskAmount: risk, rMultiple: 0.1 });
    const steady = [at("07:00", "2026-09-30"), at("07:00", "2026-09-29")].map((open) => entryOf(open, at("07:30", open.slice(0, 10)), 5));

    it("counts a re-entry whose risk is above 1.2 times the median risk of the entries", () => {
      expect(SIZE_UP_FACTOR).toBe(1.2);
      expect(behaviour([...steady, loss(), withRisk(120.5)], UTC).reentry).toMatchObject({ count: 1, sizedUp: 1 });
    });

    it("does not count a risk at exactly 1.2 times, or below it", () => {
      expect(behaviour([...steady, loss(), withRisk(120)], UTC).reentry.sizedUp).toBe(0);
      expect(behaviour([...steady, loss(), withRisk(100)], UTC).reentry.sizedUp).toBe(0);
    });

    it("never counts a re-entry without a known risk, and leaves it out of the median", () => {
      expect(behaviour([...steady, loss(), withRisk(null)], UTC).reentry).toMatchObject({ count: 1, sizedUp: 0 });
    });

    it("takes the median over every entry of the input, not only the re-entries", () => {
      // Risks 100, 100, 100 (the loss), 130: the median is 100, so 130 is above 120.
      expect(behaviour([...steady, loss(), withRisk(130)], UTC).reentry.sizedUp).toBe(1);
      // Risks 200, 200, 100 (the loss), 130: the median is 165, and 130 is below 198.
      const big = [at("07:00", "2026-09-30"), at("07:00", "2026-09-29")].map((open) => entryOf(open, at("07:30", open.slice(0, 10)), 5, { riskAmount: 200 }));
      expect(behaviour([...big, loss(), withRisk(130)], UTC).reentry.sizedUp).toBe(0);
    });

    it("averages the two middle risks when there is an even number", () => {
      // Risks 100, 150 (steady), 100 (the loss) and the re-entry's own. With 139 the sorted risks 100, 100, 139, 150
      // have the median 119.5 (limit 143.4), and with 160 the median is 125 (limit 150).
      const mixed = [entryOf(at("07:00", "2026-09-30"), at("07:30", "2026-09-30"), 5), entryOf(at("07:00", "2026-09-29"), at("07:30", "2026-09-29"), 5, { riskAmount: 150 })];
      expect(behaviour([...mixed, loss(), withRisk(139)], UTC).reentry.sizedUp).toBe(0);
      expect(behaviour([...mixed, loss(), withRisk(160)], UTC).reentry.sizedUp).toBe(1);
    });
  });
});

describe("results by order in the day", () => {
  const day = (date: string, openTimes: string[], pnls: number[] = []) =>
    openTimes.map((open, index) => entryOf(`${date}T${open}:00.000Z`, `${date}T${open.slice(0, 2)}:59:00.000Z`, pnls[index] ?? 10));

  it("finds the busiest day of the sample, 2 October with 3 entries", () => {
    const { entries } = toEntries(sampleTrades(NOW));
    expect(behaviour(entries, UTC).orderInDay.busiestDay).toEqual({ day: "2026-10-02", entries: 3 });
  });

  it("groups the sample's entries by their place in their day: 20 first, 9 second, 1 third", () => {
    const { entries } = toEntries(sampleTrades(NOW));
    const { first, second, thirdPlus } = behaviour(entries, UTC).orderInDay;
    expect([first.entries, second.entries, thirdPlus.entries]).toEqual([20, 9, 1]);
    expect(first.entries + second.entries + thirdPlus.entries).toBe(entries.length);
    expect(first.netPnl + second.netPnl + thirdPlus.netPnl).toBeCloseTo(entries.reduce((total, entry) => total + (entry.pnl ?? 0), 0), 9);
  });

  it("puts the first, the second, and the third and every later entry of a day in their own group", () => {
    const entries = day("2026-10-01", ["08:00", "09:00", "10:00", "11:00", "12:00"], [10, -20, 30, -40, 50]);
    const { first, second, thirdPlus } = behaviour(entries, UTC).orderInDay;
    expect(first).toMatchObject({ entries: 1, wins: 1, netPnl: 10 });
    expect(second).toMatchObject({ entries: 1, losses: 1, netPnl: -20 });
    expect(thirdPlus).toMatchObject({ entries: 3, wins: 2, losses: 1, netPnl: 40 });
  });

  it("goes by the time an entry opened, not by when it closed or the order given", () => {
    const slow = entryOf(at("08:00"), at("15:00"), -50);
    const quick = entryOf(at("09:00"), at("09:30"), 70);
    for (const input of [[slow, quick], [quick, slow]]) {
      const { first, second } = behaviour(input, UTC).orderInDay;
      expect(first.netPnl).toBe(-50);
      expect(second.netPnl).toBe(70);
    }
  });

  it("counts days in the trader's time zone", () => {
    // 20:00 and 21:00 UTC on 3 October: one day in UTC, but 23:30 on the 3rd and 00:30 on the 4th in Tehran.
    const entries = [entryOf("2026-10-03T20:00:00.000Z", "2026-10-03T20:30:00.000Z", 10), entryOf("2026-10-03T21:00:00.000Z", "2026-10-03T21:30:00.000Z", 10)];
    const utc = behaviour(entries, UTC).orderInDay;
    expect([utc.first.entries, utc.second.entries]).toEqual([1, 1]);
    expect(utc.busiestDay).toEqual({ day: "2026-10-03", entries: 2 });
    const tehran = behaviour(entries, { timeZone: "Asia/Tehran" }).orderInDay;
    expect([tehran.first.entries, tehran.second.entries]).toEqual([2, 0]);
    expect(tehran.busiestDay).toEqual({ day: "2026-10-03", entries: 1 });
  });

  it("takes the earlier day when two days are equally busy, and none when there are no entries", () => {
    const entries = [...day("2026-10-02", ["08:00", "09:00"]), ...day("2026-10-01", ["08:00", "09:00"]), ...day("2026-10-03", ["08:00"])];
    expect(behaviour(entries, UTC).orderInDay.busiestDay).toEqual({ day: "2026-10-01", entries: 2 });
    const empty = behaviour([], UTC).orderInDay;
    expect(empty.busiestDay).toBeNull();
    expect(empty.first).toEqual({ entries: 0, wins: 0, losses: 0, winRate: null, netPnl: 0, averageR: null });
  });

  it("counts a ladder as one entry in its day", () => {
    const legs = [1, 2, 3].map((leg) => perfTrade({ ladderKey: "k", ladderLeg: leg, ladderSize: 3, openedAt: `2026-10-01T08:00:0${leg}.000Z`, closedAt: at("09:00") }));
    expect(behaviour(toEntries(legs).entries, UTC).orderInDay.busiestDay).toEqual({ day: "2026-10-01", entries: 1 });
  });
});

describe("how trades ended against stop and target", () => {
  /** A long from 100 with the stop at 99 (risk 1 per unit) and the target at 103 (planned 3R), ending at R. */
  const ending = (r: number | null, overrides: Partial<PerformanceTrade> = {}) =>
    toEntries([
      perfTrade({
        stopLoss: 99,
        takeProfit: 103,
        quantity: 1,
        riskAmount: r === null ? null : 1,
        realizedPnl: r,
        rMultiple: r,
        exitPrice: r === null ? 101 : 100 + r,
        ...overrides
      })
    ]).entries[0];
  const exitsOf = (rs: (number | null)[]) => behaviour(rs.map((r) => ending(r)), UTC).exits;
  const counts = (exits: ReturnType<typeof exitsOf>) => [exits.atTarget, exits.beforeTarget, exits.atStop, exits.beyondStop, exits.beforeStop, exits.breakeven, exits.noPlan];

  it("gives the sample's exits: 0 at target, 17 before target, 11 at stop, 2 beyond stop, 0 of the rest", () => {
    const { entries } = toEntries(sampleTrades(NOW));
    const { exits } = behaviour(entries, UTC);
    expect(counts(exits)).toEqual([0, 17, 11, 2, 0, 0, 0]);
    expect(counts(exits).reduce((total, count) => total + count, 0)).toBe(entries.length);
    expect(exits.averagePlannedR).toBeCloseTo(3, 9);
    expect(exits.averageReachedR).toBeCloseTo(22.5 / 17, 9);
  });

  it("calls a win at or above the target less 0.1R at target, and a smaller one before target", () => {
    expect(counts(exitsOf([2.95]))).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(counts(exitsOf([2.9]))).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(counts(exitsOf([3]))).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(counts(exitsOf([4.2]))).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(counts(exitsOf([2.89]))).toEqual([0, 1, 0, 0, 0, 0, 0]);
    expect(counts(exitsOf([0.05]))).toEqual([0, 1, 0, 0, 0, 0, 0]);
  });

  it("calls a loss within 0.1R of -1R at stop, a bigger one beyond stop and a smaller one before stop", () => {
    expect(counts(exitsOf([-1]))).toEqual([0, 0, 1, 0, 0, 0, 0]);
    expect(counts(exitsOf([-0.9]))).toEqual([0, 0, 1, 0, 0, 0, 0]);
    expect(counts(exitsOf([-1.1]))).toEqual([0, 0, 1, 0, 0, 0, 0]);
    expect(counts(exitsOf([-1.11]))).toEqual([0, 0, 0, 1, 0, 0, 0]);
    expect(counts(exitsOf([-2.5]))).toEqual([0, 0, 0, 1, 0, 0, 0]);
    expect(counts(exitsOf([-0.89]))).toEqual([0, 0, 0, 0, 1, 0, 0]);
    expect(counts(exitsOf([-0.2]))).toEqual([0, 0, 0, 0, 1, 0, 0]);
  });

  it("calls an R of 0 breakeven", () => {
    expect(counts(exitsOf([0]))).toEqual([0, 0, 0, 0, 0, 1, 0]);
  });

  it("leaves no plan for a trade with no stop, no target or no R", () => {
    const noStop = ending(1, { stopLoss: null });
    const noTarget = ending(1, { takeProfit: null });
    const noR = { ...ending(1), r: null };
    const stopAtEntry = ending(null, { stopLoss: 100 }); // no distance to the stop: no R, no planned R
    const exits = behaviour([noStop, noTarget, noR, stopAtEntry], UTC).exits;
    expect(counts(exits)).toEqual([0, 0, 0, 0, 0, 0, 4]);
    expect(exits.averagePlannedR).toBeNull();
    expect(exits.averageReachedR).toBeNull();
  });

  it("averages the planned and the reached R over the winners that closed before target only", () => {
    const exits = exitsOf([1, 2, 3, -1, 0.5]);
    // Before target: 1, 2 and 0.5 (the 3 is at target, the -1 at stop); all planned 3R.
    expect(counts(exits)).toEqual([1, 3, 1, 0, 0, 0, 0]);
    expect(exits.averagePlannedR).toBeCloseTo(3, 9);
    expect(exits.averageReachedR).toBeCloseTo((1 + 2 + 0.5) / 3, 9);
  });

  it("reads the first leg's stop and target with the whole entry's R", () => {
    // Three legs on one stop at 99, a target at 103 for the first leg and 106 for the others; together they end at 2.95R (8.85 over a risk of 3).
    const legs = [1, 2, 3].map((leg) =>
      perfTrade({
        ladderKey: "k",
        ladderLeg: leg,
        ladderSize: 3,
        openedAt: `2026-10-01T08:00:0${leg}.000Z`,
        entryPrice: 100,
        stopLoss: 99,
        takeProfit: leg === 1 ? 103 : 106,
        quantity: 1,
        riskAmount: 1,
        realizedPnl: [3.5, 3, 2.35][leg - 1],
        rMultiple: 1
      })
    );
    const { entries } = toEntries(legs);
    expect(entries).toHaveLength(1);
    expect(entries[0].r).toBeCloseTo(2.95, 9);
    expect(entries[0].plannedR).toBeCloseTo(3, 9);
    expect(behaviour(entries, UTC).exits.atTarget).toBe(1);
  });

  it("does not change the entries it was given", () => {
    const entries = [ending(1), ending(-1), ending(3)];
    const before = JSON.stringify(entries);
    behaviour(entries, UTC);
    expect(JSON.stringify(entries)).toBe(before);
  });
});
