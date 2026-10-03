import type { SampleMistakeKey } from "./types";

/**
 * The numbers of the sample month, in one table with no words in it. Each row is one closed trade: where it was
 * entered, how far the stop was, and the result in R. The exit price, the target, the lot size, the money and R that
 * end up on the trade are all worked out from these prices (see build.ts), so they cannot disagree with each other.
 *
 * The results in R are the ones the landing page tells its sample month with (src/features/landing/sample-month.ts),
 * in the same order, so the page that promises a month and the month that is loaded are the same month. The mistakes
 * cluster early and fade: a late entry three times in the first week, a moved stop, one revenge trade, one more late
 * entry in the middle of the month, and none in the last twelve trades.
 *
 * The price levels are approximate and were not checked against a quote (gold near 4,170, EURUSD near 1.13, GBPUSD
 * near 1.33, USDJPY near 158). They were moved by one fixed amount per symbol from the first version of this table, so
 * every stop distance and every result in R is unchanged. They only need to look believable: everything else is
 * derived from them. Move the four amounts again when they look stale.
 */
export type SampleStrategyKey = "strategy-range" | "strategy-gold";

export type TradeRow = {
  /** The result in R. */
  r: number;
  strategy: SampleStrategyKey;
  symbol: "EURUSD" | "GBPUSD" | "USDJPY" | "XAUUSD";
  side: "long" | "short";
  /** Entry price as quoted. */
  entry: number;
  /** Distance to the stop in ticks of the symbol (EURUSD 200 ticks = 20 pips, XAUUSD 800 ticks = 8.00). */
  stopTicks: number;
  /** Trading day, 0 = the oldest of the twenty. */
  day: number;
  /** Time the trade was opened, UTC, as "HH:MM", and how long it lasted. */
  time: string;
  holdMinutes: number;
  mistake?: SampleMistakeKey;
};

export const TRADE_ROWS: readonly TradeRow[] = [
  { r: 1.0, strategy: "strategy-range", symbol: "EURUSD", side: "long", entry: 1.1262, stopTicks: 200, day: 0, time: "07:45", holdMinutes: 95 },
  { r: -1.0, strategy: "strategy-range", symbol: "GBPUSD", side: "short", entry: 1.3235, stopTicks: 250, day: 1, time: "08:05", holdMinutes: 40, mistake: "late" },
  { r: 1.6, strategy: "strategy-gold", symbol: "XAUUSD", side: "long", entry: 4151.4, stopTicks: 800, day: 1, time: "13:35", holdMinutes: 150 },
  { r: -1.0, strategy: "strategy-range", symbol: "EURUSD", side: "long", entry: 1.1291, stopTicks: 200, day: 2, time: "08:25", holdMinutes: 35, mistake: "late" },
  { r: 0.8, strategy: "strategy-range", symbol: "USDJPY", side: "short", entry: 158.62, stopTicks: 300, day: 3, time: "07:50", holdMinutes: 110 },
  { r: 2.1, strategy: "strategy-gold", symbol: "XAUUSD", side: "long", entry: 4158.15, stopTicks: 800, day: 3, time: "13:30", holdMinutes: 190 },
  { r: -1.0, strategy: "strategy-range", symbol: "GBPUSD", side: "long", entry: 1.3269, stopTicks: 250, day: 4, time: "08:15", holdMinutes: 30, mistake: "late" },
  { r: -1.0, strategy: "strategy-gold", symbol: "XAUUSD", side: "long", entry: 4169.6, stopTicks: 800, day: 5, time: "07:20", holdMinutes: 55 },
  { r: 1.2, strategy: "strategy-range", symbol: "EURUSD", side: "short", entry: 1.1332, stopTicks: 200, day: 5, time: "08:40", holdMinutes: 120 },
  { r: -1.6, strategy: "strategy-range", symbol: "GBPUSD", side: "long", entry: 1.33, stopTicks: 250, day: 6, time: "07:55", holdMinutes: 100, mistake: "stop" },
  { r: -1.0, strategy: "strategy-range", symbol: "EURUSD", side: "long", entry: 1.1323, stopTicks: 200, day: 7, time: "07:50", holdMinutes: 45 },
  { r: -1.2, strategy: "strategy-range", symbol: "EURUSD", side: "long", entry: 1.1316, stopTicks: 200, day: 7, time: "08:50", holdMinutes: 35, mistake: "revenge" },
  { r: 0.6, strategy: "strategy-gold", symbol: "XAUUSD", side: "long", entry: 4164.8, stopTicks: 800, day: 8, time: "13:40", holdMinutes: 80 },
  { r: 2.4, strategy: "strategy-range", symbol: "USDJPY", side: "long", entry: 158.18, stopTicks: 300, day: 9, time: "08:00", holdMinutes: 170 },
  { r: -1.0, strategy: "strategy-range", symbol: "EURUSD", side: "short", entry: 1.1341, stopTicks: 200, day: 10, time: "07:40", holdMinutes: 50 },
  { r: 1.1, strategy: "strategy-gold", symbol: "XAUUSD", side: "long", entry: 4172.3, stopTicks: 800, day: 10, time: "13:50", holdMinutes: 100 },
  { r: 1.8, strategy: "strategy-range", symbol: "GBPUSD", side: "short", entry: 1.3282, stopTicks: 250, day: 11, time: "08:20", holdMinutes: 140 },
  { r: -1.0, strategy: "strategy-range", symbol: "EURUSD", side: "long", entry: 1.1304, stopTicks: 200, day: 12, time: "08:10", holdMinutes: 25, mistake: "late" },
  { r: 0.9, strategy: "strategy-gold", symbol: "XAUUSD", side: "long", entry: 4178.1, stopTicks: 800, day: 13, time: "07:15", holdMinutes: 90 },
  { r: -1.0, strategy: "strategy-range", symbol: "USDJPY", side: "short", entry: 157.71, stopTicks: 300, day: 13, time: "08:55", holdMinutes: 60 },
  { r: 2.2, strategy: "strategy-range", symbol: "GBPUSD", side: "long", entry: 1.3258, stopTicks: 250, day: 14, time: "07:50", holdMinutes: 180 },
  { r: 0.7, strategy: "strategy-gold", symbol: "XAUUSD", side: "long", entry: 4181.75, stopTicks: 800, day: 15, time: "13:45", holdMinutes: 70 },
  { r: -1.0, strategy: "strategy-range", symbol: "EURUSD", side: "short", entry: 1.1327, stopTicks: 200, day: 16, time: "07:55", holdMinutes: 45 },
  { r: 1.5, strategy: "strategy-range", symbol: "GBPUSD", side: "long", entry: 1.3291, stopTicks: 250, day: 16, time: "09:40", holdMinutes: 130 },
  { r: -1.0, strategy: "strategy-gold", symbol: "XAUUSD", side: "long", entry: 4186.4, stopTicks: 800, day: 17, time: "13:30", holdMinutes: 60 },
  { r: 1.9, strategy: "strategy-range", symbol: "EURUSD", side: "long", entry: 1.1296, stopTicks: 200, day: 18, time: "07:30", holdMinutes: 160 },
  { r: 0.4, strategy: "strategy-gold", symbol: "XAUUSD", side: "long", entry: 4179.3, stopTicks: 800, day: 18, time: "13:35", holdMinutes: 75 },
  { r: -1.0, strategy: "strategy-range", symbol: "USDJPY", side: "long", entry: 157.45, stopTicks: 300, day: 19, time: "07:40", holdMinutes: 45 },
  { r: 1.3, strategy: "strategy-range", symbol: "EURUSD", side: "short", entry: 1.1323, stopTicks: 200, day: 19, time: "09:10", holdMinutes: 115 },
  { r: 1.0, strategy: "strategy-gold", symbol: "XAUUSD", side: "long", entry: 4175.9, stopTicks: 800, day: 19, time: "13:40", holdMinutes: 85 }
];

/** The balance of the sample account: risk in percent is money over this. */
export const SAMPLE_BALANCE = 10_000;

/** The sample's risk limits, as a percent of the balance. The two strategies and every trade are built from them. */
export const SAMPLE_LIMITS = {
  "strategy-range": { riskPerTradePct: 1, maxDailyLossPct: 3, maxOpenPositions: 2 },
  "strategy-gold": { riskPerTradePct: 0.75, maxDailyLossPct: 2, maxOpenPositions: 1 }
} as const satisfies Record<SampleStrategyKey, { riskPerTradePct: number; maxDailyLossPct: number; maxOpenPositions: number }>;

/** Trading days in the sample month: four weeks, Monday to Friday. */
export const SAMPLE_TRADING_DAYS = 20;
