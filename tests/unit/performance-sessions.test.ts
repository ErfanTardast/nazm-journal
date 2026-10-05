import { describe, expect, it } from "vitest";
import { allBreakdowns } from "@/lib/calculations/performance/breakdowns";
import { toEntries } from "@/lib/calculations/performance/entries";
import { sessionOf } from "@/lib/calculations/performance/sessions";
import type { BreakdownRow, PerformanceTrade, SessionKey } from "@/lib/calculations/performance/types";
import { perfTrade, sampleTrades } from "./support/performance-trades";

const NOW = new Date("2026-10-04T10:00:00Z");

/** One entry opened at the given instant, with the trader's session text as written. */
function entryAt(openedAt: string, session: string | null = null, overrides: Partial<PerformanceTrade> = {}) {
  const closedAt = new Date(Date.parse(openedAt) + 30 * 60_000).toISOString();
  return toEntries([perfTrade({ openedAt, closedAt, session, realizedPnl: 10, rMultiple: 0.1, riskAmount: 100, ...overrides })]).entries[0];
}

const keyOf = (label: ReturnType<typeof sessionOf>["label"]) => (label.kind === "key" ? label.key : `text:${label.text}`);
const sessionRow = (row: BreakdownRow) => (row.label.kind === "key" ? row.label.key : row.label.text);

describe("a session the trader wrote", () => {
  it.each<[string, SessionKey]>([
    ["London", "london"],
    ["london", "london"],
    ["  LONDON  ", "london"],
    ["London session", "london"],
    ["لندن", "london"],
    ["سشن لندن", "london"],
    ["New York", "new_york"],
    ["new york", "new_york"],
    ["NewYork", "new_york"],
    ["New-York", "new_york"],
    ["NY", "new_york"],
    ["N.Y.", "new_york"],
    ["NY session", "new_york"],
    ["نیویورک", "new_york"],
    ["نیو یورک", "new_york"],
    ["نيويورک", "new_york"],
    ["Asia", "asia"],
    ["Asian session", "asia"],
    ["Tokyo", "asia"],
    ["Sydney", "asia"],
    ["Tokyo / Sydney", "asia"],
    ["آسیا", "asia"],
    ["توکیو", "asia"],
    ["سیدنی", "asia"],
    ["London-New York overlap", "london_new_york"],
    ["London / NY", "london_new_york"],
    ["london ny overlap", "london_new_york"],
    ["Overlap", "london_new_york"],
    ["همپوشانی لندن و نیویورک", "london_new_york"],
    ["همپوشانی", "london_new_york"]
  ])("%s is %s, as the trader wrote it", (text, key) => {
    expect(sessionOf(entryAt("2026-07-01T03:00:00.000Z", text))).toEqual({ label: { kind: "key", key: `session.${key}` }, derived: false });
  });

  it("is not changed by the open time", () => {
    // 03:00 UTC in July is off hours for the derived rule, but the trader said London.
    expect(keyOf(sessionOf(entryAt("2026-07-01T03:00:00.000Z", "London")).label)).toBe("session.london");
  });

  it("stays the trader's own text when it is not a known spelling, trimmed", () => {
    expect(sessionOf(entryAt("2026-07-01T13:30:00.000Z", "  Lunch break "))).toEqual({ label: { kind: "text", text: "Lunch break" }, derived: false });
    // Words next to a known one do not make it that session.
    expect(keyOf(sessionOf(entryAt("2026-07-01T13:30:00.000Z", "Not London")).label)).toBe("text:Not London");
    expect(keyOf(sessionOf(entryAt("2026-07-01T13:30:00.000Z", "London then Asia")).label)).toBe("text:London then Asia");
    expect(keyOf(sessionOf(entryAt("2026-07-01T13:30:00.000Z", "Asia overlap")).label)).toBe("text:Asia overlap");
  });
});

describe("a session from the open time", () => {
  const derived = (iso: string, session: string | null = null) => {
    const result = sessionOf(entryAt(iso, session));
    return { key: keyOf(result.label), derived: result.derived };
  };

  it("is used for a missing or blank session text, and says so", () => {
    expect(derived("2026-07-01T13:30:00.000Z", null)).toEqual({ key: "session.london_new_york", derived: true });
    expect(derived("2026-07-01T13:30:00.000Z", "")).toEqual({ key: "session.london_new_york", derived: true });
    expect(derived("2026-07-01T13:30:00.000Z", "   ")).toEqual({ key: "session.london_new_york", derived: true });
  });

  it("puts 13:30 UTC in both London and New York, in July and in January", () => {
    // July: 14:30 in London, 09:30 in New York. January: 13:30 and 08:30.
    expect(derived("2026-07-15T13:30:00.000Z").key).toBe("session.london_new_york");
    expect(derived("2026-01-14T13:30:00.000Z").key).toBe("session.london_new_york");
  });

  it("puts 02:00 UTC in Asia and 22:30 UTC outside the main sessions", () => {
    expect(derived("2026-07-15T02:00:00.000Z").key).toBe("session.asia");
    expect(derived("2026-01-14T02:00:00.000Z").key).toBe("session.asia");
    expect(derived("2026-07-15T22:30:00.000Z").key).toBe("session.off_hours");
    expect(derived("2026-01-14T22:30:00.000Z").key).toBe("session.off_hours");
  });

  it("follows summer time at the edges of the London and New York windows", () => {
    const summer = (time: string) => derived(`2026-07-15T${time}:00.000Z`).key;
    expect(summer("06:59")).toBe("session.asia"); // 07:59 in London, 15:59 in Tokyo
    expect(summer("07:00")).toBe("session.london"); // 08:00 in London
    expect(summer("11:59")).toBe("session.london"); // 07:59 in New York is still out
    expect(summer("12:00")).toBe("session.london_new_york"); // 08:00 in New York
    expect(summer("15:59")).toBe("session.london_new_york"); // 16:59 in London
    expect(summer("16:00")).toBe("session.new_york"); // 17:00 in London is out
    expect(summer("20:59")).toBe("session.new_york"); // 16:59 in New York
    expect(summer("21:00")).toBe("session.off_hours"); // 17:00 in New York
  });

  it("follows winter time at the edges of the same windows", () => {
    const winter = (time: string) => derived(`2026-01-14T${time}:00.000Z`).key;
    expect(winter("07:59")).toBe("session.asia"); // 07:59 in London, 16:59 in Tokyo
    expect(winter("08:00")).toBe("session.london"); // 08:00 in London
    expect(winter("12:59")).toBe("session.london"); // 07:59 in New York
    expect(winter("13:00")).toBe("session.london_new_york"); // 08:00 in New York
    expect(winter("16:59")).toBe("session.london_new_york");
    expect(winter("17:00")).toBe("session.new_york"); // 17:00 in London is out
    expect(winter("21:59")).toBe("session.new_york"); // 16:59 in New York
    expect(winter("22:00")).toBe("session.off_hours"); // 17:00 in New York
  });

  it("covers Tokyo from 09:00 to 17:59, and gives London the hour it shares with it", () => {
    expect(derived("2026-01-14T00:00:00.000Z").key).toBe("session.asia"); // 09:00 in Tokyo
    expect(derived("2026-01-14T07:59:00.000Z").key).toBe("session.asia");
    expect(derived("2026-01-14T08:59:00.000Z").key).toBe("session.london"); // also 17:59 in Tokyo
    expect(derived("2026-01-13T23:59:00.000Z").key).toBe("session.off_hours"); // 08:59 in Tokyo
  });
});

describe("the session and weekday rows", () => {
  const keys = (rows: BreakdownRow[]) => Object.fromEntries(rows.map((row) => [sessionRow(row), row.entries]));

  it("are london 22 and new york 8 on the sample, in English and in Persian alike", () => {
    for (const locale of ["en", "fa"] as const) {
      const { entries } = toEntries(sampleTrades(NOW, locale));
      const { session } = allBreakdowns(entries, { timeZone: "UTC" });
      expect(keys(session)).toEqual({ "session.london": 22, "session.new_york": 8 });
      expect(session.every((row) => !row.derived)).toBe(true);
    }
  });

  it("merge spellings of one session into one row, in both languages", () => {
    const { entries } = toEntries([perfTrade({ session: "London" }), perfTrade({ session: "لندن" }), perfTrade({ session: "london session" })]);
    const { session } = allBreakdowns(entries, { timeZone: "UTC" });
    expect(session).toHaveLength(1);
    expect(session[0]).toMatchObject({ label: { kind: "key", key: "session.london" }, entries: 3, derived: false });
  });

  it("keep the trader's own words as one case-insensitive text row", () => {
    const { entries } = toEntries([perfTrade({ session: "Lunch" }), perfTrade({ session: "lunch " }), perfTrade({ session: "Lunch" })]);
    const { session } = allBreakdowns(entries, { timeZone: "UTC" });
    expect(session).toHaveLength(1);
    expect(session[0]).toMatchObject({ label: { kind: "text", text: "Lunch" }, entries: 3 });
  });

  it("mark a row derived when it holds an entry worked out from the open time", () => {
    const { entries } = toEntries([
      perfTrade({ session: "", openedAt: "2026-07-15T13:30:00.000Z", closedAt: "2026-07-15T14:00:00.000Z" }),
      perfTrade({ session: "NY", openedAt: "2026-07-15T13:40:00.000Z", closedAt: "2026-07-15T14:10:00.000Z" }),
      perfTrade({ session: "London", openedAt: "2026-07-15T08:00:00.000Z", closedAt: "2026-07-15T09:00:00.000Z" })
    ]);
    const { session } = allBreakdowns(entries, { timeZone: "UTC" });
    const byKey = Object.fromEntries(session.map((row) => [sessionRow(row), row]));
    expect(byKey["session.london_new_york"]).toMatchObject({ entries: 1, derived: true });
    expect(byKey["session.new_york"]).toMatchObject({ entries: 1, derived: false });
    expect(byKey["session.london"]).toMatchObject({ entries: 1, derived: false });
  });

  it("add up to the entries, like every other row set", () => {
    const { entries } = toEntries(sampleTrades(NOW));
    const { session, weekday } = allBreakdowns(entries, { timeZone: "UTC" });
    expect(session.reduce((total, row) => total + row.entries, 0)).toBe(30);
    expect(weekday.reduce((total, row) => total + row.entries, 0)).toBe(30);
  });
});

describe("the weekday", () => {
  const weekdayKeys = (opened: string, timeZone: string) => {
    const { entries } = toEntries([perfTrade({ openedAt: opened, closedAt: new Date(Date.parse(opened) + 3_600_000).toISOString() })]);
    return allBreakdowns(entries, { timeZone }).weekday.map(sessionRow);
  };

  it("is the day the entry opened, as the trader's clock shows it: Sunday in Tehran, Saturday in UTC", () => {
    // 2026-10-03T21:00Z is 00:30 on Sunday 4 October in Tehran.
    expect(weekdayKeys("2026-10-03T21:00:00.000Z", "Asia/Tehran")).toEqual(["weekday.0"]);
    expect(weekdayKeys("2026-10-03T21:00:00.000Z", "UTC")).toEqual(["weekday.6"]);
  });

  it("goes by the open time of the first leg, not the close", () => {
    const { entries } = toEntries([perfTrade({ openedAt: "2026-10-02T23:30:00.000Z", closedAt: "2026-10-03T01:00:00.000Z" })]);
    expect(allBreakdowns(entries, { timeZone: "UTC" }).weekday.map(sessionRow)).toEqual(["weekday.5"]);
  });

  it("has a row for each day with entries, with the sample's counts", () => {
    const { entries } = toEntries(sampleTrades(NOW));
    const rows = allBreakdowns(entries, { timeZone: "UTC" }).weekday;
    expect(rows.every((row) => row.label.kind === "key" && /^weekday\.[0-6]$/.test(row.label.key))).toBe(true);
    expect(rows.map(sessionRow).sort()).toEqual(["weekday.1", "weekday.2", "weekday.3", "weekday.4", "weekday.5"]);
    expect(rows.reduce((total, row) => total + row.entries, 0)).toBe(30);
  });
});
