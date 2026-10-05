import { isSupportedTimeZone } from "@/lib/time/zones";
import { dayKey } from "./performance/time";
import type { PerformanceTrade } from "./performance/types";

/**
 * Today's result against the daily loss limit, in one place: the dashboard's meter and the trading guard's alert
 * both read it, so they always show the same number.
 *
 * Today is the trader's calendar day (the zone saved in Settings). What counts is the net result of the trades that
 * CLOSED today, wherever they were opened: a trade opened yesterday and closed this morning belongs to this morning.
 * A trade with no close time is placed by its open time, as the Performance page places it.
 */

/** The guard's own threshold: "near" from this share of the limit. */
export const NEAR_LIMIT_SHARE = 0.7;

export type TodayRiskTrade = Pick<PerformanceTrade, "status" | "openedAt" | "closedAt" | "realizedPnl" | "rMultiple" | "riskPercent" | "riskAmount">;

export type TodayRiskInput = {
  timeZone: string;
  now: Date;
  maxDailyLossPct: number;
  riskPerTradePct: number;
  startingBalance: number | null;
};

/** What the loss is measured on: the starting balance, or R times the risk per trade, or nothing the app can use. */
export type TodayRiskBasis = "balance" | "r" | "none";
export type TodayRiskState = "clear" | "near" | "reached" | "unknown";

export type TodayRisk = {
  /** "YYYY-MM-DD" of today in the trader's zone. */
  day: string;
  /** Positions that closed today. */
  closedToday: number;
  /** Their money result and R, over the ones that have one. */
  netPnl: number;
  netR: number;
  basis: TodayRiskBasis;
  /** The net loss as a percent (0 on a day that is flat or up). */
  lossPct: number;
  /** The daily limit, as a percent. */
  limitPct: number;
  /** lossPct / limitPct; null without a limit. It is not capped, so 1.2 means 20% past the limit. */
  usedShare: number | null;
  state: TodayRiskState;
  /** Closed today but with no figure the basis can use (no money result, or no R). */
  leftOut: number;
  openTrades: number;
  /** Percent of the account the open trades state they risk; null when none states one. */
  openRisk: number | null;
  openWithoutRisk: number;
};

/** The zone the trader's days are read in: the one saved in Settings, or UTC when it is missing or unknown here. */
export function traderZone(zone: string | null | undefined): string {
  return zone && isSupportedTimeZone(zone) ? zone : "UTC";
}

/** Away from float noise (2.0999999999999996) so a displayed value and a comparison never disagree. */
const clean = (value: number) => Math.round(value * 1e6) / 1e6;
const positive = (value: number | null): value is number => value !== null && Number.isFinite(value) && value > 0;

export function todayRisk(trades: TodayRiskTrade[], input: TodayRiskInput): TodayRisk {
  const day = dayKey(input.now, input.timeZone);
  const closedToday = trades.filter((trade) => trade.status === "closed" && dayKey(trade.closedAt ?? trade.openedAt, input.timeZone) === day);
  const withMoney = closedToday.flatMap((trade) => (trade.realizedPnl === null ? [] : [trade.realizedPnl]));
  const withR = closedToday.flatMap((trade) => (trade.rMultiple === null ? [] : [trade.rMultiple]));
  const netPnl = clean(withMoney.reduce((sum, value) => sum + value, 0));
  const netR = clean(withR.reduce((sum, value) => sum + value, 0));

  const balance = positive(input.startingBalance) ? input.startingBalance : null;
  const basis: TodayRiskBasis = balance !== null ? "balance" : input.riskPerTradePct > 0 ? "r" : "none";
  const lossPct = clean(basis === "balance" ? (Math.max(0, -netPnl) / balance!) * 100 : basis === "r" ? Math.max(0, -netR) * input.riskPerTradePct : 0);
  const leftOut = basis === "balance" ? closedToday.length - withMoney.length : basis === "r" ? closedToday.length - withR.length : closedToday.length;

  const limit = input.maxDailyLossPct;
  const state: TodayRiskState =
    basis === "none" || !(limit > 0) ? "unknown" : lossPct >= limit ? "reached" : lossPct >= limit * NEAR_LIMIT_SHARE ? "near" : "clear";

  const open = trades.filter((trade) => trade.status === "open");
  const stated = open.flatMap((trade) => {
    if (positive(trade.riskPercent)) return [trade.riskPercent];
    return positive(trade.riskAmount) && balance !== null ? [(trade.riskAmount / balance) * 100] : [];
  });

  return {
    day,
    closedToday: closedToday.length,
    netPnl,
    netR,
    basis,
    lossPct,
    limitPct: limit,
    usedShare: limit > 0 ? clean(lossPct / limit) : null,
    state,
    leftOut,
    openTrades: open.length,
    openRisk: stated.length ? clean(stated.reduce((sum, value) => sum + value, 0)) : null,
    openWithoutRisk: open.length - stated.length
  };
}
