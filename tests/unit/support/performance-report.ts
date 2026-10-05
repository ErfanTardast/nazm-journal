import type { Mock } from "vitest";
import type {
  BehaviourReport,
  BreakdownLabel,
  BreakdownRow,
  Dimension,
  EquityPoint,
  PerformanceReport,
  PeriodKey,
  ResultGroup,
  RHistogram
} from "@/lib/calculations/performance/types";

/*
 * Whole PerformanceReports for the Performance screen's tests: real-looking data, shaped exactly as GET
 * /api/performance answers, so the screen is tested without waiting for the server's maths.
 */

export const group = (overrides: Partial<ResultGroup> = {}): ResultGroup => ({
  entries: 0,
  wins: 0,
  losses: 0,
  winRate: null,
  netPnl: 0,
  averageR: null,
  ...overrides
});

let rowNumber = 0;
export function breakdownRow(label: BreakdownLabel, overrides: Partial<BreakdownRow> = {}): BreakdownRow {
  rowNumber += 1;
  return {
    ...group({ entries: 10, wins: 6, losses: 4, winRate: 0.6, netPnl: 120.5, averageR: 0.35 }),
    id: `row-${rowNumber}`,
    label,
    derived: false,
    unpriced: 0,
    lowSample: false,
    ...overrides
  };
}

const text = (value: string): BreakdownLabel => ({ kind: "text", text: value });
const key = (value: Extract<BreakdownLabel, { kind: "key" }>["key"]): BreakdownLabel => ({ kind: "key", key: value });

/** 24 priced closed trades on consecutive days, with a dip in the middle (deepest fall 120.50 below the high). */
export function equityPoints(count = 24, startDay = "2026-09-10"): EquityPoint[] {
  const start = Date.parse(`${startDay}T12:00:00.000Z`);
  let equity = 0;
  let peak = 0;
  return Array.from({ length: count }, (_, index) => {
    const pnl = index >= 8 && index < 12 ? -30.125 : index % 3 === 0 ? 40.5 : 22.25;
    equity = Math.round((equity + pnl) * 100) / 100;
    peak = Math.max(peak, equity);
    return {
      n: index + 1,
      tradeId: `trade-${index + 1}`,
      at: new Date(start + index * 24 * 3_600_000).toISOString(),
      pnl,
      equity,
      drawdown: Math.round((peak - equity) * 100) / 100
    };
  });
}

export const histogram = (counts: number[] = [0, 2, 11, 5, 9, 3, 0], withoutR = 3): RHistogram => {
  const edges = [
    { key: "lt_-2", from: null, to: -2 },
    { key: "-2_-1", from: -2, to: -1 },
    { key: "-1_0", from: -1, to: 0 },
    { key: "0_1", from: 0, to: 1 },
    { key: "1_2", from: 1, to: 2 },
    { key: "2_3", from: 2, to: 3 },
    { key: "ge_3", from: 3, to: null }
  ] as const;
  return { buckets: edges.map((edge, index) => ({ ...edge, count: counts[index] ?? 0 })), withoutR };
};

export const emptyBreakdowns = (): Record<Dimension, BreakdownRow[]> => ({
  strategy: [], symbol: [], market: [], side: [], session: [], weekday: [], setup: [], mistake: [], emotion: []
});

export function fullBreakdowns(): Record<Dimension, BreakdownRow[]> {
  return {
    strategy: [
      breakdownRow(text("Breakout"), { entries: 14, wins: 9, losses: 5, winRate: 9 / 14, netPnl: 310.25, averageR: 0.62 }),
      breakdownRow(text("Pullback"), { entries: 9, wins: 3, losses: 6, winRate: 1 / 3, netPnl: -34.74, averageR: -0.12 }),
      breakdownRow(key("none"), { entries: 3, wins: 2, losses: 1, winRate: 2 / 3, netPnl: 0, averageR: null, unpriced: 1, lowSample: true })
    ],
    symbol: [
      breakdownRow(text("XAUUSD"), { entries: 15, wins: 10, losses: 5, winRate: 2 / 3, netPnl: 262.5, averageR: 0.5 }),
      breakdownRow(text("EURUSD"), { entries: 8, wins: 3, losses: 5, winRate: 3 / 8, netPnl: -28.4, averageR: -0.1 }),
      breakdownRow(text("US30"), { entries: 3, wins: 1, losses: 2, winRate: 1 / 3, netPnl: -12.9, averageR: -0.3, lowSample: true }),
      breakdownRow(text("GBPUSD"), { entries: 2, wins: 1, losses: 1, winRate: 0.5, netPnl: 4.1, averageR: 0.1, lowSample: true }),
      breakdownRow(text("USDJPY"), { entries: 1, wins: 1, losses: 0, winRate: 1, netPnl: 9.7, averageR: 0.9, lowSample: true }),
      breakdownRow(text("NAS100"), { entries: 1, wins: 0, losses: 1, winRate: 0, netPnl: -15.55, averageR: -1, lowSample: true })
    ],
    market: [
      breakdownRow(key("market.forex"), { entries: 22, wins: 14, losses: 8, winRate: 14 / 22, netPnl: 290.5, averageR: 0.4 }),
      breakdownRow(key("market.crypto"), { entries: 8, wins: 3, losses: 5, winRate: 3 / 8, netPnl: -15, averageR: -0.1 })
    ],
    side: [
      breakdownRow(key("side.long"), { entries: 22, wins: 14, losses: 8, winRate: 14 / 22, netPnl: 250.2, averageR: 0.41 }),
      breakdownRow(key("side.short"), { entries: 8, wins: 3, losses: 5, winRate: 3 / 8, netPnl: 25.31, averageR: 0.05 })
    ],
    session: [
      breakdownRow(key("session.london"), { entries: 18, wins: 12, losses: 6, winRate: 2 / 3, netPnl: 280, averageR: 0.55 }),
      breakdownRow(key("session.new_york"), { entries: 8, wins: 3, losses: 5, winRate: 3 / 8, netPnl: -4.49, averageR: -0.05, derived: true }),
      breakdownRow(key("session.off_hours"), { entries: 4, wins: 2, losses: 2, winRate: 0.5, netPnl: 0, averageR: 0, derived: true, lowSample: true })
    ],
    weekday: [
      breakdownRow(key("weekday.1"), { entries: 6, netPnl: 90.4 }),
      breakdownRow(key("weekday.3"), { entries: 9, netPnl: 120.1 }),
      breakdownRow(key("weekday.5"), { entries: 5, netPnl: -35 })
    ],
    setup: [
      breakdownRow(text("Trend pullback"), { entries: 12, netPnl: 200.8 }),
      breakdownRow(key("setup.from_plan"), { entries: 6, netPnl: 74.71 }),
      breakdownRow(key("none"), { entries: 12, netPnl: 0, unpriced: 0 })
    ],
    mistake: [
      breakdownRow(text("Late entry"), { entries: 7, wins: 2, losses: 5, winRate: 2 / 7, netPnl: -95.2, averageR: -0.4 }),
      breakdownRow(text("Moved stop"), { entries: 3, wins: 0, losses: 3, winRate: 0, netPnl: -60.1, averageR: -1.2, lowSample: true })
    ],
    emotion: [
      breakdownRow(text("Calm"), { entries: 16, netPnl: 211.3 }),
      breakdownRow(text("Rushed"), { entries: 5, netPnl: -48.8 })
    ]
  };
}

export function fullBehaviour(): BehaviourReport {
  return {
    adherence: {
      followed: group({ entries: 17, wins: 12, losses: 5, winRate: 12 / 17, netPnl: 410.4, averageR: 0.62 }),
      mixed: group({ entries: 4, wins: 1, losses: 3, winRate: 0.25, netPnl: -52.15, averageR: -0.31 }),
      broken: group({ entries: 3, wins: 0, losses: 3, winRate: 0, netPnl: -82.74, averageR: -0.9 }),
      unknown: group({ entries: 6, wins: 4, losses: 2, winRate: 4 / 6, netPnl: 0, averageR: 0.1 })
    },
    reentry: {
      windowMinutes: 30,
      count: 5,
      sizedUp: 2,
      result: group({ entries: 5, wins: 1, losses: 4, winRate: 0.2, netPnl: -88.3, averageR: -0.62 }),
      entryIds: ["e1", "e2", "e3", "e4", "e5"]
    },
    orderInDay: {
      first: group({ entries: 14, wins: 9, losses: 5, winRate: 9 / 14, netPnl: 240.6, averageR: 0.51 }),
      second: group({ entries: 9, wins: 4, losses: 5, winRate: 4 / 9, netPnl: 30.2, averageR: 0.08 }),
      thirdPlus: group({ entries: 7, wins: 2, losses: 5, winRate: 2 / 7, netPnl: -45.1, averageR: -0.25 }),
      busiestDay: { day: "2026-09-19", entries: 4 }
    },
    exits: {
      atTarget: 2, beforeTarget: 9, atStop: 8, beyondStop: 2, beforeStop: 3, breakeven: 1, noPlan: 5,
      averagePlannedR: 2.4, averageReachedR: 1.3
    }
  };
}

export function zeroBehaviour(): BehaviourReport {
  return {
    adherence: { followed: group(), mixed: group(), broken: group(), unknown: group() },
    reentry: { windowMinutes: 30, count: 0, sizedUp: 0, result: group(), entryIds: [] },
    orderInDay: { first: group(), second: group(), thirdPlus: group(), busiestDay: null },
    exits: { atTarget: 0, beforeTarget: 0, atStop: 0, beyondStop: 0, beforeStop: 0, breakeven: 0, noPlan: 0, averagePlannedR: null, averageReachedR: null }
  };
}

/** 30 entries over 24 closed trades; one trade has no money value and three have no R. */
export function fullReport(overrides: Partial<PerformanceReport> = {}): PerformanceReport {
  return {
    context: { period: "all", from: null, to: "2026-10-04T12:00:00.000Z", timeZone: "Asia/Tehran", source: "own" },
    summary: {
      closedTrades: 24,
      openTrades: 0,
      unpricedClosed: 0,
      withoutR: 0,
      wins: 14,
      losses: 9,
      breakeven: 1,
      winRate: 14 / 24,
      grossProfit: 612.4,
      grossLoss: 336.89,
      netPnl: 275.51,
      profitFactor: 1.82,
      profitFactorState: "value",
      expectancy: 11.48,
      averageR: 1.25,
      maxDrawdownAmount: 120.5,
      maxDrawdownR: 3.4,
      maxDrawdownPct: null,
      entries: { count: 30, combined: 0, pendingLegs: 0, wins: 17, losses: 11, winRate: 17 / 30, netPnl: 275.51, averageR: 0.41, expectancy: 9.18 },
      adherence: { followed: 17, mixed: 4, broken: 3, unknown: 6, rate: 17 / 24 },
      lowSample: false
    },
    equity: equityPoints(24),
    rHistogram: histogram(),
    breakdowns: fullBreakdowns(),
    behaviour: fullBehaviour(),
    ...overrides
  };
}

/** A period with no closed trade at all. */
export function emptyReport(period: PeriodKey = "all", overrides: { openTrades?: number; source?: "own" | "sample" | "none" } = {}): PerformanceReport {
  const full = fullReport();
  return {
    context: { ...full.context, period, from: period === "all" ? null : "2026-09-28T00:00:00.000Z", source: overrides.source ?? "none" },
    summary: {
      closedTrades: 0,
      openTrades: overrides.openTrades ?? 0,
      unpricedClosed: 0,
      withoutR: 0,
      wins: 0,
      losses: 0,
      breakeven: 0,
      winRate: null,
      grossProfit: 0,
      grossLoss: 0,
      netPnl: 0,
      profitFactor: null,
      profitFactorState: "no_results",
      expectancy: null,
      averageR: null,
      maxDrawdownAmount: 0,
      maxDrawdownR: 0,
      maxDrawdownPct: null,
      entries: { count: 0, combined: 0, pendingLegs: 0, wins: 0, losses: 0, winRate: null, netPnl: 0, averageR: null, expectancy: null },
      adherence: { followed: 0, mixed: 0, broken: 0, unknown: 0, rate: null },
      lowSample: true
    },
    equity: [],
    rHistogram: histogram([0, 0, 0, 0, 0, 0, 0], 0),
    breakdowns: emptyBreakdowns(),
    behaviour: zeroBehaviour()
  };
}

/**
 * Makes the mocked apiFetch answer GET /api/performance?period=... with `reports[period]` (or `fallback`), and any
 * other path from `others` (matched on the path alone, query ignored). An unknown request throws, so a screen that
 * asks for something the test did not expect fails loudly.
 */
export function servePerformance(
  apiFetch: Mock,
  reports: Partial<Record<PeriodKey, PerformanceReport>>,
  others: Record<string, unknown> = {}
) {
  apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    const [route, query = ""] = path.split("?");
    if (route === "/api/performance") {
      const period = (new URLSearchParams(query).get("period") ?? "all") as PeriodKey;
      const report = reports[period];
      if (!report) throw new Error(`No report for period ${period}`);
      return { report };
    }
    const key = `${init?.method ?? "GET"} ${route}`;
    if (key in others) return others[key];
    throw new Error(`Unexpected request ${key}`);
  });
}
