import { describe, expect, it } from "vitest";
import { weekFocus, weekFocusInput, type WeekFocusInput } from "@/lib/calculations/week-focus";
import { toEntries } from "@/lib/calculations/performance/entries";
import { perfTrade } from "./support/performance-trades";

const none: WeekFocusInput = { mistakes: [], ruleBreaks: { count: 0, totalR: 0 }, reentries: { count: 0, totalR: 0 } };
const input = (over: Partial<WeekFocusInput>): WeekFocusInput => ({ ...none, ...over });

describe("weekFocus: the one finding of the week", () => {
  it("returns null when nothing reaches its minimum", () => {
    expect(weekFocus(none)).toBeNull();
    // A mistake seen once, and one re-entry, are not yet a pattern; a single rule break is.
    expect(weekFocus(input({ mistakes: [{ label: "FOMO", count: 1, totalR: -3 }], reentries: { count: 1, totalR: -2 } }))).toBeNull();
  });

  it("takes a rule break from the first one", () => {
    expect(weekFocus(input({ ruleBreaks: { count: 1, totalR: -1 } }))).toMatchObject({ kind: "rule_breaks", count: 1, totalR: -1 });
  });

  it("takes a mistake tag seen twice and keeps the trader's own words", () => {
    expect(weekFocus(input({ mistakes: [{ label: "دیرهنگام وارد شدن", count: 2, totalR: -1.5 }] }))).toEqual({
      kind: "mistake",
      label: "دیرهنگام وارد شدن",
      count: 2,
      totalR: -1.5,
      withoutR: 0
    });
  });

  it("takes re-entries after a loss from the second one", () => {
    expect(weekFocus(input({ reentries: { count: 2, totalR: -0.5 } }))).toMatchObject({ kind: "reentry", count: 2, totalR: -0.5 });
  });

  it("picks the most negative total R", () => {
    const found = weekFocus(
      input({
        mistakes: [{ label: "FOMO", count: 5, totalR: -2 }, { label: "Late entry", count: 2, totalR: -3.5 }],
        ruleBreaks: { count: 4, totalR: -1 },
        reentries: { count: 3, totalR: -3 }
      })
    );
    expect(found).toMatchObject({ kind: "mistake", label: "Late entry", totalR: -3.5 });
  });

  it("breaks a tie on R by the higher count", () => {
    const found = weekFocus(input({ ruleBreaks: { count: 2, totalR: -3 }, reentries: { count: 4, totalR: -3 }, mistakes: [{ label: "FOMO", count: 3, totalR: -3 }] }));
    expect(found).toMatchObject({ kind: "reentry", count: 4 });
  });

  it("breaks a tie on count by the kind: rule breaks, then mistake, then re-entry", () => {
    const tie = { count: 3, totalR: -2 };
    expect(weekFocus(input({ ruleBreaks: tie, mistakes: [{ label: "FOMO", ...tie }], reentries: tie }))?.kind).toBe("rule_breaks");
    expect(weekFocus(input({ mistakes: [{ label: "FOMO", ...tie }], reentries: tie }))?.kind).toBe("mistake");
    expect(weekFocus(input({ reentries: tie }))?.kind).toBe("reentry");
  });

  it("settles two equal mistake tags by their label, so the answer never depends on the order given", () => {
    const a = { label: "Alpha", count: 2, totalR: -1 };
    const b = { label: "Beta", count: 2, totalR: -1 };
    expect(weekFocus(input({ mistakes: [b, a] }))?.label).toBe("Alpha");
    expect(weekFocus(input({ mistakes: [a, b] }))?.label).toBe("Alpha");
  });

  it("still names a finding whose total R is not negative (it describes, it does not grade)", () => {
    expect(weekFocus(input({ ruleBreaks: { count: 1, totalR: 0.5 } }))).toMatchObject({ kind: "rule_breaks", totalR: 0.5 });
  });

  it("reports how many of the finding's trades have no R, so the total is not read as complete", () => {
    expect(weekFocus(input({ ruleBreaks: { count: 3, totalR: -1, withoutR: 2 } }))).toMatchObject({ withoutR: 2 });
  });
});

describe("weekFocusInput: what the last seven days hold", () => {
  // Closed entries as analytics reads them. Each opens an hour after the last close and a loss re-enters within 30 minutes.
  const entriesOf = (...trades: ReturnType<typeof perfTrade>[]) => toEntries(trades).entries;
  const at = (hour: number, minute = 0) => `2026-10-02T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;

  it("groups a tag ignoring case, counts the entries and sums their R", () => {
    const entries = entriesOf(
      perfTrade({ mistakes: ["FOMO"], rMultiple: -1, realizedPnl: -10, openedAt: at(1), closedAt: at(2) }),
      perfTrade({ mistakes: [" fomo "], rMultiple: -1.5, realizedPnl: -15, openedAt: at(5), closedAt: at(6) }),
      perfTrade({ mistakes: ["Late"], rMultiple: -2, realizedPnl: -20, openedAt: at(8), closedAt: at(9) })
    );
    const found = weekFocusInput(entries, { timeZone: "UTC" });
    expect(found.mistakes).toEqual(expect.arrayContaining([expect.objectContaining({ label: "FOMO", count: 2, totalR: -2.5 }), expect.objectContaining({ label: "Late", count: 1, totalR: -2 })]));
  });

  it("counts broken rules from each entry's verdict", () => {
    const entries = entriesOf(
      perfTrade({ ruleFollowed: "broken", rMultiple: -1, realizedPnl: -10, openedAt: at(1), closedAt: at(2) }),
      perfTrade({ ruleFollowed: "followed", rMultiple: 2, realizedPnl: 20, openedAt: at(5), closedAt: at(6) }),
      perfTrade({ ruleFollowed: "broken", rMultiple: null, stopLoss: null, realizedPnl: -5, openedAt: at(8), closedAt: at(9) })
    );
    expect(weekFocusInput(entries, { timeZone: "UTC" }).ruleBreaks).toEqual({ count: 2, totalR: -1, withoutR: 1 });
  });

  it("takes re-entries after a loss from the behaviour report", () => {
    const entries = entriesOf(
      perfTrade({ rMultiple: -1, realizedPnl: -10, openedAt: at(1), closedAt: at(2) }),
      perfTrade({ rMultiple: -2, realizedPnl: -20, openedAt: at(2, 10), closedAt: at(2, 40) }),
      perfTrade({ rMultiple: -0.5, realizedPnl: -5, openedAt: at(2, 50), closedAt: at(3, 20) }),
      perfTrade({ rMultiple: 1, realizedPnl: 10, openedAt: at(12), closedAt: at(13) })
    );
    expect(weekFocusInput(entries, { timeZone: "UTC" }).reentries).toEqual({ count: 2, totalR: -2.5, withoutR: 0 });
  });

  it("gives weekFocus() a finding end to end", () => {
    const entries = entriesOf(
      perfTrade({ mistakes: ["Late entry"], rMultiple: -1, realizedPnl: -10, openedAt: at(1), closedAt: at(2) }),
      perfTrade({ mistakes: ["late entry"], rMultiple: -2, realizedPnl: -20, openedAt: at(5), closedAt: at(6) })
    );
    expect(weekFocus(weekFocusInput(entries, { timeZone: "UTC" }))).toMatchObject({ kind: "mistake", label: "Late entry", count: 2, totalR: -3 });
  });
});
