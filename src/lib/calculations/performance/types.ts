/**
 * The shapes and constants of the performance report: one module every screen reads, so the headline, the
 * breakdowns and the dashboard say the same thing. Pure data, no locale: the report holds keys and numbers, and
 * the client writes every word.
 */

export type PeriodKey = "7d" | "30d" | "90d" | "all";
export const PERIODS = ["7d", "30d", "90d", "all"] as const satisfies readonly PeriodKey[];
export const LOW_SAMPLE_ENTRIES = 20; // headline note below this many closed entries
export const LOW_SAMPLE_ROW = 5; // a breakdown row is marked "few trades" below this
export const REENTRY_WINDOW_MINUTES = 30; // re-entry after a loss
export const SIZE_UP_FACTOR = 1.2; // "with more risk": above 1.2x the median risk of the period's entries
export const R_TOLERANCE = 0.1; // "at stop" / "at target" within 0.1R

export type RuleVerdict = "followed" | "mixed" | "broken" | "unknown";
export type DataSource = "own" | "sample" | "none";

/** One trade as analytics read it: plain numbers, ISO times, no notes, no screenshots. */
export type PerformanceTrade = {
  id: string;
  symbol: string;
  market: "crypto" | "forex" | "stocks";
  side: "long" | "short";
  status: "open" | "closed" | "planned" | "canceled";
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  quantity: number;
  fees: number;
  riskAmount: number | null;
  riskPercent: number | null;
  rMultiple: number | null;
  realizedPnl: number | null;
  openedAt: string;
  closedAt: string | null;
  ladderKey: string | null;
  ladderLeg: number | null;
  ladderSize: number | null;
  strategyId: string | null;
  strategyName: string | null;
  session: string | null;
  setupType: string | null;
  /** Trade.ruleFollowed: the ONE source for adherence (the journal entry's copy can differ). */
  ruleFollowed: RuleVerdict;
  /** From the journal entry, the trader's own words. */
  mistakes: string[];
  emotionalState: string | null;
  isSample: boolean;
};

/** One decision: a single trade, or the legs of one ladder entry (all closed). */
export type PerformanceEntry = {
  /** The first leg's id. */
  id: string;
  legIds: string[];
  /** Symbol, side, market, strategy, session and setup come from the first leg. */
  first: PerformanceTrade;
  /** Earliest leg open. */
  openedAt: string;
  /** Latest leg close (the open time when a leg has none). */
  closedAt: string;
  /** Money, as calculateJournalMetrics counts it; null when unknown. */
  pnl: number | null;
  r: number | null;
  risk: number | null;
  /** Win / breakeven / loss, the same rule as the headline. */
  sign: -1 | 0 | 1;
  /** The worst known verdict of the legs (broken > mixed > followed); unknown only if all are. */
  ruleFollowed: RuleVerdict;
  /** The legs' tags together: trimmed, de-duplicated ignoring case (the first spelling is kept). */
  mistakes: string[];
  /** The first leg's. */
  emotionalState: string | null;
  /** |takeProfit - entry| / |entry - stop| of the first leg, when both exist. */
  plannedR: number | null;
};

export type ResultGroup = {
  entries: number;
  wins: number;
  losses: number;
  /** Wins over entries; null when entries = 0. */
  winRate: number | null;
  /** Over the entries with a money result. */
  netPnl: number;
  /** Over the entries with an R. */
  averageR: number | null;
};

export type PerformanceContext = {
  period: PeriodKey;
  /** ISO start of the window's first day in timeZone; null for "all". */
  from: string | null;
  /** ISO now. */
  to: string;
  /** User.timezone. */
  timeZone: string;
  source: DataSource;
};

export type PerformanceSummary = {
  /** Positions (legs) closed in the period. */
  closedTrades: number;
  /** Open now (not windowed). */
  openTrades: number;
  /** Closed, no money result: left out of every money figure. */
  unpricedClosed: number;
  /** Closed, no R (no stop): left out of every R figure. */
  withoutR: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  /** Null unless profitFactorState is "value". */
  profitFactor: number | null;
  profitFactorState: "value" | "no_losses" | "no_results";
  /** Money per closed trade with a money result. */
  expectancy: number | null;
  averageR: number | null;
  maxDrawdownAmount: number;
  maxDrawdownR: number;
  /** Only for "all" with a starting balance. */
  maxDrawdownPct: number | null;
  entries: { count: number; combined: number; pendingLegs: number } & Omit<ResultGroup, "entries"> & { expectancy: number | null };
  /** Over entries; rate = followed / (followed + mixed + broken). */
  adherence: { followed: number; mixed: number; broken: number; unknown: number; rate: number | null };
  /** entries.count < LOW_SAMPLE_ENTRIES. */
  lowSample: boolean;
};

/** n: the trade's number among the period's closed trades in close order (an unpriced trade keeps its number, has no point). */
export type EquityPoint = { n: number; tradeId: string; at: string; pnl: number; equity: number; drawdown: number };

export type RBucketKey = "lt_-2" | "-2_-1" | "-1_0" | "0_1" | "1_2" | "2_3" | "ge_3";
export type RHistogram = { buckets: { key: RBucketKey; from: number | null; to: number | null; count: number }[]; withoutR: number };

export type Dimension = "strategy" | "symbol" | "market" | "side" | "session" | "weekday" | "setup" | "mistake" | "emotion";
export const DIMENSIONS = ["strategy", "symbol", "market", "side", "session", "weekday", "setup", "mistake", "emotion"] as const satisfies readonly Dimension[];
export type SessionKey = "asia" | "london" | "new_york" | "london_new_york" | "off_hours";
export type LabelKey =
  | "none"
  | `market.${"crypto" | "forex" | "stocks"}`
  | `side.${"long" | "short"}`
  | `session.${SessionKey}`
  | `weekday.${0 | 1 | 2 | 3 | 4 | 5 | 6}`
  | "setup.from_plan";
/** The client translates keys; text is the trader's own. */
export type BreakdownLabel = { kind: "key"; key: LabelKey } | { kind: "text"; text: string };
export type BreakdownRow = ResultGroup & { id: string; label: BreakdownLabel; derived: boolean; unpriced: number; lowSample: boolean };

export type BehaviourReport = {
  adherence: Record<RuleVerdict, ResultGroup>;
  reentry: { windowMinutes: number; count: number; sizedUp: number; result: ResultGroup; entryIds: string[] };
  orderInDay: { first: ResultGroup; second: ResultGroup; thirdPlus: ResultGroup; busiestDay: { day: string; entries: number } | null };
  /** The two averages are over winners closed before target. */
  exits: {
    atTarget: number;
    beforeTarget: number;
    atStop: number;
    beyondStop: number;
    beforeStop: number;
    breakeven: number;
    noPlan: number;
    averagePlannedR: number | null;
    averageReachedR: number | null;
  };
};

export type PerformanceReport = {
  context: PerformanceContext;
  summary: PerformanceSummary;
  equity: EquityPoint[];
  rHistogram: RHistogram;
  breakdowns: Record<Dimension, BreakdownRow[]>;
  behaviour: BehaviourReport;
};

export type PerformanceSnapshot = { context: PerformanceContext; summary: PerformanceSummary; equity: EquityPoint[] };
