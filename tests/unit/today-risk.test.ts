import { describe, expect, it } from "vitest";
import { todayRisk, type TodayRiskInput } from "@/lib/calculations/today-risk";
import { perfTrade } from "./support/performance-trades";

/** Oct 4, 2026 at 10:00 UTC: 13:30 in Tehran, still the 4th in UTC. */
const now = new Date("2026-10-04T10:00:00.000Z");
const base: TodayRiskInput = { timeZone: "UTC", now, maxDailyLossPct: 3, riskPerTradePct: 1, startingBalance: null };

const lossOf = (r: number, overrides: Parameters<typeof perfTrade>[0] = {}) =>
  perfTrade({ closedAt: "2026-10-04T08:00:00.000Z", openedAt: "2026-10-04T07:00:00.000Z", rMultiple: r, realizedPnl: r * 10, ...overrides });

describe("todayRisk: which trades count", () => {
  it("counts a trade opened yesterday and closed today at a loss", () => {
    const trade = perfTrade({ openedAt: "2026-10-03T14:00:00.000Z", closedAt: "2026-10-04T06:00:00.000Z", rMultiple: -1, realizedPnl: -10 });
    const risk = todayRisk([trade], base);
    expect(risk).toMatchObject({ day: "2026-10-04", closedToday: 1, netPnl: -10, netR: -1 });
  });

  it("leaves out a trade opened today and still open: it has no result yet", () => {
    const open = perfTrade({ status: "open", closedAt: null, openedAt: "2026-10-04T07:00:00.000Z", realizedPnl: null, rMultiple: null });
    expect(todayRisk([open], base)).toMatchObject({ closedToday: 0, netPnl: 0, netR: 0, openTrades: 1 });
  });

  it("leaves out a trade closed yesterday", () => {
    const old = lossOf(-2, { closedAt: "2026-10-03T22:00:00.000Z" });
    expect(todayRisk([old], base).closedToday).toBe(0);
  });

  it("dates a trade without a close time by its open time", () => {
    const trade = perfTrade({ closedAt: null, openedAt: "2026-10-04T05:00:00.000Z", rMultiple: -1, realizedPnl: -5 });
    expect(todayRisk([trade], base)).toMatchObject({ closedToday: 1, netPnl: -5 });
  });

  it("puts a loss closed at 2026-10-03T21:00Z on Oct 4 in Asia/Tehran and on Oct 3 in UTC", () => {
    const loss = perfTrade({ openedAt: "2026-10-03T19:00:00.000Z", closedAt: "2026-10-03T21:00:00.000Z", rMultiple: -1, realizedPnl: -10 });

    const tehran = todayRisk([loss], { ...base, timeZone: "Asia/Tehran" });
    expect(tehran).toMatchObject({ day: "2026-10-04", closedToday: 1, netR: -1 });

    const utcEvening = todayRisk([loss], { ...base, now: new Date("2026-10-03T23:00:00.000Z") });
    expect(utcEvening).toMatchObject({ day: "2026-10-03", closedToday: 1, netR: -1 });
    expect(todayRisk([loss], base).closedToday).toBe(0);
  });
});

describe("todayRisk: against the daily limit", () => {
  it("calls a winning day clear, with no loss", () => {
    const risk = todayRisk([lossOf(2)], base);
    expect(risk).toMatchObject({ lossPct: 0, usedShare: 0, state: "clear", netR: 2 });
  });

  it("without a starting balance reads R times the risk per trade: -2R is clear, -2.1R near, -3R reached (1% risk, 3% limit)", () => {
    const state = (r: number) => todayRisk([lossOf(r)], base);
    expect(state(-2)).toMatchObject({ basis: "r", lossPct: 2, state: "clear" });
    expect(state(-2.1)).toMatchObject({ basis: "r", lossPct: 2.1, state: "near" });
    expect(state(-3)).toMatchObject({ basis: "r", lossPct: 3, state: "reached" });
    expect(state(-2.1).usedShare).toBeCloseTo(0.7, 6);
  });

  it("nets the day: a win offsets a loss", () => {
    const risk = todayRisk([lossOf(-2.5), lossOf(1.5)], base);
    expect(risk).toMatchObject({ netR: -1, lossPct: 1, state: "clear" });
  });

  it("with a starting balance, takes the loss over that balance", () => {
    const balance = { ...base, startingBalance: 10_000 };
    const risk = todayRisk([lossOf(-1, { realizedPnl: -200 })], balance);
    expect(risk).toMatchObject({ basis: "balance", lossPct: 2, limitPct: 3, state: "clear" });
    expect(risk.usedShare).toBeCloseTo(2 / 3, 6);
    expect(todayRisk([lossOf(-1, { realizedPnl: -250 })], balance)).toMatchObject({ lossPct: 2.5, state: "near" });
    expect(todayRisk([lossOf(-1, { realizedPnl: -300 })], balance)).toMatchObject({ lossPct: 3, state: "reached" });
  });

  it("is unknown with neither a balance nor a risk per trade, and says what it could not use", () => {
    const risk = todayRisk([lossOf(-2)], { ...base, riskPerTradePct: 0 });
    expect(risk).toMatchObject({ basis: "none", state: "unknown", lossPct: 0 });
  });

  it("is unknown when no daily limit is set", () => {
    expect(todayRisk([lossOf(-2)], { ...base, maxDailyLossPct: 0 }).state).toBe("unknown");
  });

  it("counts how many of today's trades the basis could not use", () => {
    const noStop = lossOf(-1, { rMultiple: null, realizedPnl: -10 });
    expect(todayRisk([noStop, lossOf(-1)], base)).toMatchObject({ closedToday: 2, netR: -1, leftOut: 1 });
    const unpriced = lossOf(-1, { realizedPnl: null });
    expect(todayRisk([unpriced], { ...base, startingBalance: 1000 })).toMatchObject({ basis: "balance", leftOut: 1, lossPct: 0 });
  });
});

describe("todayRisk: open trades", () => {
  it("adds up the risk the open trades state and counts those that state none", () => {
    const open = (over: Parameters<typeof perfTrade>[0]) => perfTrade({ status: "open", closedAt: null, realizedPnl: null, rMultiple: null, ...over });
    const risk = todayRisk([open({ riskPercent: 1 }), open({ riskPercent: 0.5 }), open({}), open({ openedAt: "2026-09-20T10:00:00.000Z", riskPercent: 1 })], base);
    expect(risk).toMatchObject({ openTrades: 4, openRisk: 2.5, openWithoutRisk: 1 });
  });

  it("turns a stated amount into a share of the starting balance", () => {
    const trade = perfTrade({ status: "open", closedAt: null, riskAmount: 100, realizedPnl: null, rMultiple: null });
    expect(todayRisk([trade], { ...base, startingBalance: 10_000 })).toMatchObject({ openRisk: 1, openWithoutRisk: 0 });
  });

  it("has no open risk when nothing is open", () => {
    expect(todayRisk([lossOf(-1)], base)).toMatchObject({ openTrades: 0, openRisk: null, openWithoutRisk: 0 });
  });
});
