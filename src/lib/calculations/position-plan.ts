/**
 * Position planner: a TypeScript port of an MQL5 risk library (RiskMath)
 * and the sizing steps of its TradeValidation plan builder. Pure planning math for the journal: it never
 * talks to a terminal or a broker. Differences from the MQL5 source:
 * - LoadSymbolSpec (live SymbolInfo calls) is replaced by SYMBOL_PRESETS or a spec the trader types in.
 * - LossPerLot uses the tick-value formula instead of OrderCalcProfit, so presets are typical MT5 retail
 *   specs for a USD account; the trader should check their own broker's symbol specification.
 * - Execution-only parts (RemainingLegVolume, stops/freeze levels, margin) are not ported.
 */

export type Direction = "buy" | "sell";

export type SymbolSpec = {
  digits: number;
  tickSize: number;
  /** Account-currency value of one tick for one lot. */
  tickValue: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
  /** Price point used for slippage; defaults to tickSize. */
  point?: number;
};

export type PlanError = {
  ok: false;
  code:
    | "invalid_number"
    | "invalid_prices"
    | "buy_geometry"
    | "sell_geometry"
    | "positions"
    | "tp_invalid"
    | "tp_collapse"
    | "spec_invalid"
    | "risk_invalid"
    | "loss_invalid"
    | "slippage_past_stop"
    | "volume_below_min"
    | "leg_below_min"
    | "leg_above_max";
  message: string;
};

const fail = (code: PlanError["code"], message: string): PlanError => ({ ok: false, code, message });
const finite = (value: number) => Number.isFinite(value);
const finitePositive = (value: number) => Number.isFinite(value) && value > 0;
const epsilon = (value: number) => Math.max(1, Math.abs(value)) * 1e-10;

/** MQL5 NormalizeDouble: round to `digits` decimals. */
function normalizeDouble(value: number, digits: number) {
  const factor = 10 ** digits;
  return Number((Math.round(value * factor) / factor).toFixed(digits));
}

export function volumeDigits(step: number) {
  for (let digits = 0; digits <= 8; digits++) {
    const scaled = step * 10 ** digits;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-8) return digits;
  }
  return 8;
}

export function validSpec(spec: SymbolSpec) {
  return (
    Number.isInteger(spec.digits) &&
    spec.digits >= 0 &&
    finitePositive(spec.tickSize) &&
    finitePositive(spec.tickValue) &&
    finitePositive(spec.volumeMin) &&
    finitePositive(spec.volumeStep) &&
    finite(spec.volumeMax) &&
    spec.volumeMax >= spec.volumeMin
  );
}

/** Returns 0 when the price or tick size is invalid; callers reject prices <= 0. */
export function normalizePriceNearest(price: number, spec: SymbolSpec) {
  if (!finite(price) || !finitePositive(spec.tickSize)) return 0;
  const normalized = normalizeDouble(Math.round(price / spec.tickSize) * spec.tickSize, spec.digits);
  return finite(normalized) ? normalized : 0;
}

/**
 * Sizing entry only: rounds to the tick grid on the side adverse to the risk (BUY up, SELL down), so the
 * distance to the stop used for sizing is never shorter than the quote's. Within 1e-6 tick of the grid
 * counts as on the grid.
 */
export function normalizePriceAdverse(price: number, direction: Direction, spec: SymbolSpec) {
  if (!finite(price) || !finitePositive(spec.tickSize)) return 0;
  const gridTolerance = 1e-6;
  const ticks = price / spec.tickSize;
  const adverse = direction === "buy" ? Math.ceil(ticks - gridTolerance) : Math.floor(ticks + gridTolerance);
  const normalized = normalizeDouble(adverse * spec.tickSize, spec.digits);
  return finite(normalized) ? normalized : 0;
}

/** Returns 0 when the volume or step is invalid; callers reject a zero volume. */
export function normalizeVolumeDown(volume: number, spec: SymbolSpec) {
  if (!finitePositive(volume) || !finitePositive(spec.volumeStep)) return 0;
  const steps = Math.floor((volume + epsilon(volume)) / spec.volumeStep);
  const floored = normalizeDouble(steps * spec.volumeStep, volumeDigits(spec.volumeStep));
  return finite(floored) ? floored : 0;
}

export function validateGeometry(direction: Direction, entry: number, stopLoss: number, finalTp: number): { ok: true } | PlanError {
  if (!finite(entry) || !finite(stopLoss) || !finite(finalTp)) {
    return fail("invalid_number", "Entry, Stop Loss, and Final TP must be finite numbers.");
  }
  if (entry <= 0 || stopLoss <= 0 || finalTp <= 0) return fail("invalid_prices", "Entry, Stop Loss, and Final TP must be positive prices.");
  if (direction === "buy" && !(stopLoss < entry && entry < finalTp)) return fail("buy_geometry", "BUY requires Stop Loss < Entry < Final TP.");
  if (direction === "sell" && !(finalTp < entry && entry < stopLoss)) return fail("sell_geometry", "SELL requires Final TP < Entry < Stop Loss.");
  return { ok: true };
}

type Targets = { ok: true; targets: number[]; finalRr: number };

export function calculateTargetsRaw(
  direction: Direction,
  entry: number,
  stopLoss: number,
  finalTp: number,
  positions: number
): Targets | PlanError {
  if (!Number.isInteger(positions) || positions < 1) return fail("positions", "Number of positions must be at least 1.");
  const geometry = validateGeometry(direction, entry, stopLoss, finalTp);
  if (!geometry.ok) return geometry;

  const riskDistance = direction === "buy" ? entry - stopLoss : stopLoss - entry;
  const rewardDistance = direction === "buy" ? finalTp - entry : entry - finalTp;
  const finalRr = rewardDistance / riskDistance;
  if (!finite(finalRr)) return fail("invalid_number", "Final RR is not a finite number.");

  const targets: number[] = [];
  for (let i = 0; i < positions; i++) {
    const rr = (finalRr * (i + 1)) / positions;
    targets.push(i === positions - 1 ? finalTp : direction === "buy" ? entry + riskDistance * rr : entry - riskDistance * rr);
  }
  return { ok: true, targets, finalRr };
}

export function calculateTargets(
  direction: Direction,
  entry: number,
  stopLoss: number,
  finalTp: number,
  positions: number,
  spec: SymbolSpec
): Targets | PlanError {
  const raw = calculateTargetsRaw(direction, entry, stopLoss, finalTp, positions);
  if (!raw.ok) return raw;

  const targets = raw.targets.map((target) => normalizePriceNearest(target, spec));
  targets[positions - 1] = normalizePriceNearest(finalTp, spec);
  const monotonicTolerance = spec.tickSize * 1e-6;
  for (let i = 0; i < positions; i++) {
    if (!(targets[i] > 0)) return fail("tp_invalid", `TP${i + 1} normalizes to an invalid price.`);
    if (direction === "buy" && targets[i] <= entry) {
      return fail("tp_invalid", `TP${i + 1} normalizes at/below Entry; increase Final TP or reduce positions.`);
    }
    if (direction === "sell" && targets[i] >= entry) {
      return fail("tp_invalid", `TP${i + 1} normalizes at/above Entry; increase reward distance or reduce positions.`);
    }
    const step = i > 0 ? (direction === "buy" ? targets[i] - targets[i - 1] : targets[i - 1] - targets[i]) : Infinity;
    if (step <= monotonicTolerance) {
      return fail("tp_collapse", "TP levels collapse to the same broker tick. Increase Final TP distance or reduce Number of Positions.");
    }
  }
  return { ok: true, targets, finalRr: raw.finalRr };
}

/** Account-currency loss of one lot from entry to stop (tick-value formula; the MQL5 original used OrderCalcProfit). */
export function lossPerLot(entry: number, stopLoss: number, spec: SymbolSpec) {
  return (Math.abs(entry - stopLoss) / spec.tickSize) * spec.tickValue;
}

export function allocateVolumes(
  safeTotal: number,
  positions: number,
  spec: SymbolSpec
): { ok: true; volumes: number[]; allocatedTotal: number } | PlanError {
  if (!Number.isInteger(positions) || positions < 1) return fail("positions", "Number of positions must be at least 1.");
  if (!validSpec(spec)) return fail("spec_invalid", "Invalid symbol volume specification.");
  if (!finite(safeTotal)) return fail("invalid_number", "Volume to allocate is not a finite number.");

  const digits = volumeDigits(spec.volumeStep);
  const totalUnits = Math.floor((safeTotal + epsilon(safeTotal)) / spec.volumeStep);
  const minUnits = Math.ceil((spec.volumeMin - epsilon(spec.volumeMin)) / spec.volumeStep);
  if (totalUnits < minUnits * positions) {
    return fail(
      "volume_below_min",
      `Risk-sized volume is too small for ${positions} positions at broker minimum ${spec.volumeMin.toFixed(digits)}.`
    );
  }

  const baseUnits = Math.floor(totalUnits / positions);
  const remainder = totalUnits % positions;
  const volumes: number[] = [];
  for (let i = 0; i < positions; i++) {
    const volume = normalizeDouble((baseUnits + (i < remainder ? 1 : 0)) * spec.volumeStep, digits);
    if (volume + epsilon(volume) < spec.volumeMin) return fail("leg_below_min", `Allocated volume for position ${i + 1} is below broker minimum.`);
    if (volume - spec.volumeMax > epsilon(spec.volumeMax)) {
      return fail("leg_above_max", `Allocated volume for position ${i + 1} exceeds broker maximum.`);
    }
    volumes.push(volume);
  }
  const allocatedTotal = normalizeDouble(volumes.reduce((sum, v) => sum + v, 0), digits);
  return { ok: true, volumes, allocatedTotal };
}

type Preset = { digits: number; tickSize: number; contractSize: number; quote: "usd" | "base_usd" };

const FX_USD_QUOTE: Preset = { digits: 5, tickSize: 0.00001, contractSize: 100_000, quote: "usd" };
const FX_USD_BASE: Preset = { digits: 5, tickSize: 0.00001, contractSize: 100_000, quote: "base_usd" };

/** Typical MT5 retail specs for a USD account. Brokers differ: check Symbol > Specification in MT5. */
export const SYMBOL_PRESETS: Record<string, Preset> = {
  EURUSD: FX_USD_QUOTE,
  GBPUSD: FX_USD_QUOTE,
  AUDUSD: FX_USD_QUOTE,
  NZDUSD: FX_USD_QUOTE,
  USDJPY: { digits: 3, tickSize: 0.001, contractSize: 100_000, quote: "base_usd" },
  USDCHF: FX_USD_BASE,
  USDCAD: FX_USD_BASE,
  XAUUSD: { digits: 2, tickSize: 0.01, contractSize: 100, quote: "usd" },
  XAGUSD: { digits: 3, tickSize: 0.001, contractSize: 5_000, quote: "usd" }
};

/** A spec from a preset; USD-based pairs convert the tick value through the price. */
export function specFromPreset(symbol: keyof typeof SYMBOL_PRESETS | string, price: number): SymbolSpec {
  const preset = SYMBOL_PRESETS[symbol];
  const perTick = preset.contractSize * preset.tickSize;
  return {
    digits: preset.digits,
    tickSize: preset.tickSize,
    tickValue: preset.quote === "usd" ? perTick : perTick / price,
    volumeMin: 0.01,
    volumeMax: 100,
    volumeStep: 0.01
  };
}

export type PlanInput = {
  direction: Direction;
  balance: number;
  riskPercent: number;
  entry: number;
  stopLoss: number;
  finalTp: number;
  positions: number;
  spec: SymbolSpec;
  commissionPerLot?: number;
  slippagePoints?: number;
};

export type PositionPlan = {
  entry: number;
  stopLoss: number;
  finalTp: number;
  sizingEntry: number;
  worstEntry: number;
  riskMoney: number;
  priceLossPerLot: number;
  lossPerLot: number;
  rawVolume: number;
  totalVolume: number;
  allocatedSlLoss: number;
  allocatedRiskPercent: number;
  finalRr: number;
  legs: { volume: number; takeProfit: number; rr: number }[];
};

/** The whole plan: normalized prices, TP ladder, risk-sized volume split across legs. */
export function planPosition(input: PlanInput): { ok: true; plan: PositionPlan } | PlanError {
  const { direction, spec, positions } = input;
  const commission = input.commissionPerLot ?? 0;
  const slippage = input.slippagePoints ?? 0;
  if (!finitePositive(input.balance) || !finitePositive(input.riskPercent) || input.riskPercent > 100) {
    return fail("risk_invalid", "Balance and risk % must be positive (risk at most 100%).");
  }
  if (!Number.isInteger(positions) || positions < 1) return fail("positions", "Number of positions must be at least 1.");
  if (!validSpec(spec)) return fail("spec_invalid", "Invalid symbol specification.");
  if (!(finite(commission) && commission >= 0) || !(finite(slippage) && slippage >= 0)) {
    return fail("invalid_number", "Commission and slippage must be finite and not negative.");
  }

  const entry = normalizePriceNearest(input.entry, spec);
  const stopLoss = normalizePriceNearest(input.stopLoss, spec);
  const finalTp = normalizePriceNearest(input.finalTp, spec);
  const targets = calculateTargets(direction, entry, stopLoss, finalTp, positions, spec);
  if (!targets.ok) return targets;

  const riskMoney = (input.balance * input.riskPercent) / 100;
  const sizingEntry = normalizePriceAdverse(input.entry, direction, spec);
  const move = slippage * (spec.point ?? spec.tickSize);
  const worstEntry = direction === "buy" ? sizingEntry + move : sizingEntry - move;
  if (direction === "buy" ? worstEntry <= stopLoss : worstEntry >= stopLoss) {
    return fail("slippage_past_stop", "Entry after slippage is not beyond the Stop Loss.");
  }

  const priceLossPerLot = lossPerLot(worstEntry, stopLoss, spec);
  const loss = priceLossPerLot + commission;
  if (!finitePositive(loss)) return fail("loss_invalid", "One-lot Stop Loss is zero or invalid.");

  const rawVolume = riskMoney / loss;
  const safeTotal = normalizeVolumeDown(rawVolume, spec);
  if (safeTotal < spec.volumeMin) return fail("volume_below_min", "Risk-sized volume is below the broker minimum volume.");
  const allocation = allocateVolumes(safeTotal, positions, spec);
  if (!allocation.ok) return allocation;

  const allocatedSlLoss = allocation.allocatedTotal * loss;
  return {
    ok: true,
    plan: {
      entry,
      stopLoss,
      finalTp,
      sizingEntry,
      worstEntry,
      riskMoney,
      priceLossPerLot,
      lossPerLot: loss,
      rawVolume,
      totalVolume: allocation.allocatedTotal,
      allocatedSlLoss,
      allocatedRiskPercent: (allocatedSlLoss / input.balance) * 100,
      finalRr: targets.finalRr,
      legs: allocation.volumes.map((volume, i) => ({
        volume,
        takeProfit: targets.targets[i],
        rr: (targets.finalRr * (i + 1)) / positions
      }))
    }
  };
}
