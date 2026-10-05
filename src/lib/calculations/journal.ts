import { clusterLadders } from "./ladders";
import { lossPerLot, SYMBOL_PRESETS, specFromPreset } from "./position-plan";

export type JournalTrade = {
  side: "long" | "short";
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  quantity: number;
  fees: number;
  status: "open" | "closed" | "planned" | "canceled";
  symbol?: string;
  openedAt?: Date | string;
};

export function calculateTradePnl(trade: JournalTrade) {
  if (trade.exitPrice === null || trade.status !== "closed") {
    return 0;
  }

  const direction = trade.side === "long" ? 1 : -1;
  return (trade.exitPrice - trade.entryPrice) * direction * trade.quantity - trade.fees;
}

export function calculateTradeRisk(trade: JournalTrade) {
  if (trade.stopLoss === null) {
    return 0;
  }
  return Math.abs(trade.entryPrice - trade.stopLoss) * trade.quantity;
}

export type TradeOutcomeInput = JournalTrade & {
  market: "crypto" | "forex" | "stocks";
  /** Money at risk to the stop, when the trader or an import already knows it. */
  riskAmount?: number | null;
  /** Money result net of fees, when the trader or an import already knows it. */
  realizedPnl?: number | null;
};

export type TradeOutcome = { realizedPnl?: number; riskAmount?: number; rMultiple?: number };

/** 0.01 lot = 1,000 units is the smallest standard forex size, so a smaller forex quantity is lots. */
const FOREX_MIN_UNITS = 1000;

function isLotQuantity(trade: Pick<TradeOutcomeInput, "market" | "quantity">) {
  return trade.market === "forex" && trade.quantity < FOREX_MIN_UNITS;
}

/** The preset for a broker symbol, ignoring suffixes: "XAUUSD.m" and "EURUSDm" match XAUUSD and EURUSD. */
function presetKey(symbol: string | undefined) {
  const key = (symbol ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
  return Object.prototype.hasOwnProperty.call(SYMBOL_PRESETS, key) ? key : undefined;
}

/** Money to the stop from the symbol preset (typical specs for a USD account), when there is one. */
function presetRiskAmount(trade: TradeOutcomeInput, stopDistance: number) {
  const key = presetKey(trade.symbol);
  if (!key || trade.stopLoss === null || stopDistance === 0) return undefined;
  return lossPerLot(trade.entryPrice, trade.stopLoss, specFromPreset(key, trade.entryPrice)) * trade.quantity;
}

/**
 * P&L, money risk and R for one trade. Crypto and stocks quantities (and forex entered as units) are units,
 * so price x quantity is money. Forex lots are not money without a contract size: R comes from price
 * geometry (move / stop distance), and money follows from a known risk or P&L, else from the symbol preset.
 */
export function deriveTradeOutcome(trade: TradeOutcomeInput): TradeOutcome {
  if (!isLotQuantity(trade)) {
    const realizedPnl = trade.status === "closed" && trade.exitPrice !== null ? calculateTradePnl(trade) : undefined;
    const riskAmount = trade.stopLoss !== null ? calculateTradeRisk(trade) : undefined;
    const rMultiple = riskAmount && realizedPnl !== undefined ? realizedPnl / riskAmount : undefined;
    return { realizedPnl, riskAmount, rMultiple };
  }

  const knownRisk = trade.riskAmount && trade.riskAmount > 0 ? trade.riskAmount : undefined;
  const knownPnl = trade.realizedPnl ?? undefined;
  const stopDistance = trade.stopLoss === null ? 0 : Math.abs(trade.entryPrice - trade.stopLoss);
  const presetRisk = presetRiskAmount(trade, stopDistance);
  if (trade.status !== "closed" || trade.exitPrice === null || stopDistance === 0) {
    return { realizedPnl: knownPnl, riskAmount: knownRisk ?? presetRisk, rMultiple: undefined };
  }

  const direction = trade.side === "long" ? 1 : -1;
  const priceR = ((trade.exitPrice - trade.entryPrice) * direction) / stopDistance;
  // Gross P&L is priceR x risk, so a known net P&L (fees added back) gives the risk.
  const riskFromPnl = knownPnl !== undefined && priceR !== 0 ? Math.abs((knownPnl + trade.fees) / priceR) : 0;
  const riskAmount = knownRisk ?? (riskFromPnl > 0 ? riskFromPnl : presetRisk);
  if (riskAmount === undefined) {
    return { realizedPnl: knownPnl, riskAmount, rMultiple: priceR };
  }
  const realizedPnl = knownPnl ?? priceR * riskAmount - trade.fees;
  return { realizedPnl, riskAmount, rMultiple: realizedPnl / riskAmount };
}

export type StoredTrade = TradeOutcomeInput & { rMultiple?: number | null };

export type RepairedOutcome = { riskAmount: number | null; realizedPnl: number | null; rMultiple: number | null };

/**
 * New money and R for a lot-based row saved while every market was treated as units (P&L, risk and R were
 * price x lots), or null when the row needs nothing. A value the old formula would not have produced was
 * typed or imported, so it is kept and the others are derived from it.
 */
export function repairLegacyLotOutcome(trade: StoredTrade): RepairedOutcome | null {
  if (!isLotQuantity(trade)) return null;
  const legacyPnl = trade.status === "closed" && trade.exitPrice !== null ? calculateTradePnl(trade) : undefined;
  const legacyRisk = trade.stopLoss !== null ? calculateTradeRisk(trade) : undefined;
  const legacyR = legacyRisk && legacyPnl !== undefined ? legacyPnl / legacyRisk : undefined;
  // Tolerances cover the column rounding: money is Decimal(18,6), R is Decimal(12,4).
  const fromOldFormula = (stored: number | null | undefined, legacy: number | undefined, tolerance: number) =>
    stored !== null && stored !== undefined && legacy !== undefined && Math.abs(stored - legacy) <= tolerance;
  // At exit == entry the old formula gives -fees, which is also the real result: nothing to repair.
  const oldPnl = trade.exitPrice !== trade.entryPrice && fromOldFormula(trade.realizedPnl, legacyPnl, 1e-6);
  const oldRisk = fromOldFormula(trade.riskAmount, legacyRisk, 1e-6);
  const oldR = fromOldFormula(trade.rMultiple, legacyR, 1e-4);
  if (!oldPnl && !oldRisk && !oldR) return null;

  const outcome = deriveTradeOutcome({
    ...trade,
    riskAmount: oldRisk ? null : trade.riskAmount,
    realizedPnl: oldPnl ? null : trade.realizedPnl
  });
  return {
    riskAmount: oldRisk ? (outcome.riskAmount ?? null) : (trade.riskAmount ?? null),
    realizedPnl: oldPnl ? (outcome.realizedPnl ?? null) : (trade.realizedPnl ?? null),
    rMultiple: oldR ? (outcome.rMultiple ?? null) : (trade.rMultiple ?? null)
  };
}

/**
 * Deepest fall of a running total from its best point so far, the start (0) included, in the curve's own
 * units. For journal P&L and R curves, which start at 0 rather than at an account balance.
 */
export function calculateDrawdownFromZero(curve: number[]) {
  let peak = 0;
  let drawdown = 0;
  for (const value of curve) {
    peak = Math.max(peak, value);
    drawdown = Math.max(drawdown, peak - value);
  }
  return drawdown;
}

/** Fractional drawdown of a balance curve (e.g. a backtest that starts from its starting balance). */
export function calculateMaxDrawdown(values: number[]) {
  let peak = values[0] ?? 0;
  let maxDrawdown = 0;

  for (const value of values) {
    peak = Math.max(peak, value);
    const drawdown = peak === 0 ? 0 : (peak - value) / peak;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }

  return maxDrawdown;
}

/** A journal row for metrics: stored values from imports or the trader win over anything derived. */
export type MetricsTrade = JournalTrade & {
  market?: TradeOutcomeInput["market"];
  riskAmount?: number | null;
  realizedPnl?: number | null;
  rMultiple?: number | null;
  /** What the legs of one entry share (see clusterLadders); the entry itself is found from open times. */
  ladderKey?: string | null;
  /** The leg's number within its entry ("k" of an EA's "k/N" comment). */
  ladderLeg?: number | null;
  /** Legs the entry was split into, when known; fewer recorded legs means the entry is incomplete. */
  ladderSize?: number | null;
};

const finiteOrUndefined = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export type Outcome = { pnl?: number; r?: number; risk?: number; sign: number };

const runningTotal = (values: number[]) => values.reduce<number[]>((curve, value) => [...curve, (curve[curve.length - 1] ?? 0) + value], []);

export const isClosed = (trade: MetricsTrade) => trade.status === "closed" && trade.exitPrice !== null;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** Money, R, risk and the win/loss sign of one closed trade; stored values win over derived ones. */
export function closedOutcome(trade: MetricsTrade): Outcome {
  const derived: TradeOutcome = trade.market
    ? deriveTradeOutcome({ ...trade, market: trade.market })
    : (() => {
        const realizedPnl = calculateTradePnl(trade);
        const risk = calculateTradeRisk(trade);
        return { realizedPnl, riskAmount: risk > 0 ? risk : undefined, rMultiple: risk > 0 ? realizedPnl / risk : undefined };
      })();
  const pnl = finiteOrUndefined(trade.realizedPnl) ?? derived.realizedPnl;
  const r = finiteOrUndefined(trade.rMultiple) ?? derived.rMultiple;
  const risk = finiteOrUndefined(trade.riskAmount) ?? derived.riskAmount;
  // Win or loss by money, else by R, else by the price move (a lot-based trade without a stop or money).
  const move = ((trade.exitPrice ?? trade.entryPrice) - trade.entryPrice) * (trade.side === "long" ? 1 : -1);
  return { pnl, r, risk, sign: Math.sign(pnl ?? r ?? move) };
}

/** One entry split into legs (a TP ladder): P&L is the legs' sum and R is that sum over their summed risk. */
function setupOutcome(legs: { outcome: Outcome; quantity: number }[]): Outcome {
  if (legs.length === 1) return legs[0].outcome;
  const outcomes = legs.map((leg) => leg.outcome);
  const pnl = outcomes.every((o) => o.pnl !== undefined) ? sum(outcomes.map((o) => o.pnl ?? 0)) : undefined;
  // Legs share one entry and stop, so risk is proportional to size: legs whose risk is unknown (a leg
  // closed at the entry after the stop moved to break-even, say) take their siblings' risk per unit.
  const size = sum(legs.map((leg) => leg.quantity));
  const priced = legs.filter((leg) => leg.outcome.risk !== undefined && leg.outcome.risk > 0);
  const pricedSize = sum(priced.map((leg) => leg.quantity));
  const risk = priced.length && pricedSize > 0 ? (sum(priced.map((leg) => leg.outcome.risk ?? 0)) / pricedSize) * size : undefined;
  const r =
    pnl !== undefined && risk !== undefined
      ? pnl / risk
      : outcomes.every((o) => o.r !== undefined) && size > 0
        ? sum(legs.map((leg) => (leg.outcome.r ?? 0) * leg.quantity)) / size
        : undefined;
  return { pnl, r, risk, sign: Math.sign(pnl ?? r ?? sum(legs.map((leg) => leg.outcome.sign * leg.quantity))) };
}

/** One entry as the journal counts it: its legs (in the order given) and the result they add up to. */
export type ClosedEntry<T extends MetricsTrade = MetricsTrade> = { legs: T[]; outcome: Outcome };

/**
 * The entries behind metrics per entry rather than per position: legs of one entry (clusterLadders) count once,
 * and only when every leg is closed and, when the entry's size is known, all of its legs are recorded. Trades
 * without a ladder key are their own entry (single trades first, then ladders). combined counts entries of two
 * or more legs; pendingLegs counts closed legs left out because the rest of their entry is still open or not
 * imported yet.
 */
export function closedEntries<T extends MetricsTrade>(trades: T[]) {
  const active = trades.filter((trade) => trade.status !== "planned" && trade.status !== "canceled");
  const clusters = clusterLadders(active);
  const ladders = new Map<number, T[]>();
  const entries: ClosedEntry<T>[] = [];
  active.forEach((trade, index) => {
    if (clusters[index] !== -1) ladders.set(clusters[index], [...(ladders.get(clusters[index]) ?? []), trade]);
    else if (isClosed(trade)) entries.push({ legs: [trade], outcome: closedOutcome(trade) });
  });

  let combined = 0;
  let pendingLegs = 0;
  for (const legs of ladders.values()) {
    const size = Math.max(0, ...legs.map((leg) => leg.ladderSize ?? 0));
    if (legs.length < size || !legs.every(isClosed)) {
      pendingLegs += legs.filter(isClosed).length;
      continue;
    }
    if (legs.length > 1) combined += 1;
    entries.push({ legs, outcome: setupOutcome(legs.map((leg) => ({ outcome: closedOutcome(leg), quantity: leg.quantity }))) });
  }
  return { entries, combined, pendingLegs };
}

/** Metrics per entry rather than per position (see closedEntries). */
function calculateSetupMetrics(trades: MetricsTrade[]) {
  const { entries, combined, pendingLegs } = closedEntries(trades);
  const setups = entries.map((entry) => entry.outcome);
  const wins = setups.filter((setup) => setup.sign > 0).length;
  const rs = setups.flatMap((setup) => (setup.r === undefined ? [] : [setup.r]));
  const pnls = setups.flatMap((setup) => (setup.pnl === undefined ? [] : [setup.pnl]));
  return {
    count: setups.length,
    combined,
    pendingLegs,
    wins,
    losses: setups.filter((setup) => setup.sign < 0).length,
    winRate: setups.length ? wins / setups.length : 0,
    averageR: rs.length ? sum(rs) / rs.length : 0,
    expectancy: pnls.length ? sum(pnls) / pnls.length : 0
  };
}

/**
 * Journal metrics over closed trades. Money totals, expectancy and the equity curve cover the trades whose
 * money result is known; win rate covers every closed trade; average R covers the trades that have an R.
 * Drawdown is in money and in R: trades carry no account balance, so a percentage would be relative to
 * nothing (dividing by the P&L curve's own peak showed 0% for a journal that never went above 0). With the
 * account's starting balance it is also given as a share of the highest balance reached (maxDrawdownPct).
 */
export function calculateJournalMetrics(trades: MetricsTrade[], options: { startingBalance?: number | null } = {}) {
  const startingBalance = options.startingBalance ?? 0;
  const closed = trades.filter(isClosed).map(closedOutcome);
  const pnls = closed.flatMap((outcome) => (outcome.pnl === undefined ? [] : [outcome.pnl]));
  const riskMultiples = closed.flatMap((outcome) => (outcome.r === undefined ? [] : [outcome.r]));
  const wins = closed.filter((outcome) => outcome.sign > 0).length;
  const losses = closed.filter((outcome) => outcome.sign < 0).length;
  const grossProfit = pnls.filter((pnl) => pnl > 0).reduce((sum, pnl) => sum + pnl, 0);
  const grossLoss = pnls.filter((pnl) => pnl < 0).reduce((sum, pnl) => sum + Math.abs(pnl), 0);
  const equityCurve = pnls.reduce<number[]>((curve, pnl) => {
    const previous = curve[curve.length - 1] ?? 0;
    curve.push(previous + pnl);
    return curve;
  }, []);

  return {
    totalTrades: closed.length,
    wins,
    losses,
    winRate: closed.length ? wins / closed.length : 0,
    grossProfit,
    grossLoss,
    netPnl: grossProfit - grossLoss,
    averageR: riskMultiples.length
      ? riskMultiples.reduce((sum, value) => sum + value, 0) / riskMultiples.length
      : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Number.POSITIVE_INFINITY : 0,
    expectancy: pnls.length ? pnls.reduce((sum, pnl) => sum + pnl, 0) / pnls.length : 0,
    maxDrawdownAmount: calculateDrawdownFromZero(equityCurve),
    maxDrawdownR: calculateDrawdownFromZero(runningTotal(riskMultiples)),
    maxDrawdownPct: startingBalance > 0 ? calculateMaxDrawdown([startingBalance, ...equityCurve.map((pnl) => startingBalance + pnl)]) : null,
    equityCurve,
    setups: calculateSetupMetrics(trades)
  };
}
