import { checkPlanRisk, resolveRiskLimits, type PlanRiskViolation, type RiskLimits } from "@/lib/calculations/plan-risk-check";
import { readEntryZone } from "@/lib/calculations/plan-entry";
import { SYMBOL_PRESETS, type Direction, type planPosition } from "@/lib/calculations/position-plan";
import { explicitPlanSide, tradePlanSide } from "@/lib/calculations/trade-plan-side";
import type { PlanSizing } from "@/lib/validation/trading";

/** What the risk desk knows about a plan: the row `GET /api/trade-plans` sends (Prisma decimals arrive as text). */
type NumberLike = number | string | null | undefined;
export type DeskStrategy = { id?: string; name: string; riskPerTradePct?: NumberLike; maxDailyLossPct?: NumberLike; maxOpenPositions?: NumberLike };
export type DeskPlan = {
  id: string;
  symbol: string;
  bias: string;
  entryZone: string;
  status: string;
  stopLoss?: NumberLike;
  takeProfit?: NumberLike;
  riskAmount?: NumberLike;
  riskPercent?: NumberLike;
  checklist?: Record<string, unknown> | null;
  /** The last saved sizing (JSON): trusted only after it is checked. */
  sizing?: unknown;
  strategy?: DeskStrategy | null;
};
/** The account defaults from `GET /api/users/me/settings`. */
export type DeskSettings = { riskPerTradePct?: NumberLike; maxDailyLossPct?: NumberLike; startingBalance?: NumberLike };

/** The contract-spec fields of the planner, which a symbol without a preset has to be given by the trader. */
export const SPEC_FIELDS = ["digits", "tickSize", "tickValue", "volumeMin", "volumeMax", "volumeStep"] as const;

/** The planner's form fields, as text (what is typed into them). */
export type PlannerPrefill = Partial<Record<"balance" | "risk" | "entry" | "stopLoss" | "finalTp" | "positions" | (typeof SPEC_FIELDS)[number], string>> & {
  /** A preset key of `SYMBOL_PRESETS`, or "custom". */
  symbol?: string;
  direction?: Direction;
};

/** Where each prefilled value came from, so the screen can say so in its own language. */
export type PrefillSources = {
  symbol: "preset" | "custom";
  direction: "chosen" | "guessed";
  balance: "sizing" | "account" | "none";
  risk: "plan" | "strategy" | "account" | "default";
  /** "outside": the zone gave a price, but not one that fits the plan's own stop loss and take profit. */
  entry: "single" | "midpoint" | "sizing" | "outside" | "none";
  /** The plan's own entry-zone text, for a hint about where the entry came from or why it is empty. */
  entryZone: string;
};

/** What the planner has worked out right now (the numbers as typed, and the planner's own result). */
export type PlannerSnapshot = {
  symbol: string;
  direction: Direction;
  balance: number;
  riskPercent: number;
  /** The prices as typed (before the symbol's tick moves them). */
  entry: number;
  stopLoss: number;
  finalTp: number;
  positions: number;
  /** How many decimals the planner prints for lots (from the symbol's lot step). */
  lotDigits: number;
  result: ReturnType<typeof planPosition>;
};

export type PlanUpdate = {
  id: string;
  /** The status the desk loaded the plan with: the server saves only while the plan still has it. */
  expectedStatus: "planned" | "active";
  stopLoss: number;
  takeProfit: number;
  riskPercent: number;
  riskAmount: number;
  sizing: PlanSizing;
  checklist: Record<string, unknown>;
};

/** `?plan=<id>` opens the planner on that plan; anything else (empty, repeated, very long) is no plan at all. */
export function planIdFromQuery(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  const id = typeof first === "string" ? first.trim() : "";
  return id.length > 0 && id.length <= 128 ? id : null;
}

/** A plan that is not closed or canceled can still be sized (a converted plan is closed). */
export function isOpenPlan(plan: { status: string }): plan is { status: "planned" | "active" } {
  return plan.status === "planned" || plan.status === "active";
}

export function openPlans<T extends { status: string }>(plans: T[]): T[] {
  return plans.filter(isOpenPlan);
}

/** The desk's preset for a symbol as traders write it ("EURUSD", "eur/usd", "XAU-USD"), or null. */
export function symbolPresetFor(symbol: string): string | null {
  const key = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return Object.prototype.hasOwnProperty.call(SYMBOL_PRESETS, key) ? key : null;
}

function positiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

const asText = (value: number) => String(value);

/** The last saved sizing, only when it holds the numbers the planner needs. */
function savedSizing(value: unknown): { balance: number; entry: number; positions: number } | null {
  if (typeof value !== "object" || value === null) return null;
  const sizing = value as Record<string, unknown>;
  const balance = typeof sizing.balance === "number" ? positiveNumber(sizing.balance) : null;
  const entry = typeof sizing.entry === "number" ? positiveNumber(sizing.entry) : null;
  const legs = Array.isArray(sizing.legs) ? sizing.legs.length : 0;
  if (balance === null || entry === null || legs < 1 || legs > 20) return null;
  return { balance, entry, positions: legs };
}

/**
 * Whether a price read out of the entry zone can be this plan's entry. With both a stop loss and a take profit it has
 * to lie strictly between them. With only one of them it has to be a different price of the same size (no more than
 * half again as far as that level, either way): "London 8" or "week 2" on a plan with a stop at 1.08 is a time or a
 * count, not an entry. With neither there is nothing to compare it with.
 */
const MAX_ENTRY_TO_LEVEL_RATIO = 1.5;
function between(price: number, stopLoss: number | null, takeProfit: number | null) {
  if (stopLoss !== null && takeProfit !== null) return price > Math.min(stopLoss, takeProfit) && price < Math.max(stopLoss, takeProfit);
  const level = stopLoss ?? takeProfit;
  if (level === null) return true;
  return price !== level && price / level <= MAX_ENTRY_TO_LEVEL_RATIO && level / price <= MAX_ENTRY_TO_LEVEL_RATIO;
}

/** A symbol with no preset has no known contract spec: the trader types the broker's, nothing is filled in. */
const EMPTY_SPEC = Object.fromEntries(SPEC_FIELDS.map((field) => [field, ""])) as Record<(typeof SPEC_FIELDS)[number], string>;

/**
 * The planner's starting values for a plan. Nothing is made up: a price the plan does not have (and the entry zone
 * cannot give) stays empty for the trader, and so does a balance the account has not set, and so does the contract spec
 * of a symbol that has no preset.
 */
export function plannerPrefill(plan: DeskPlan, settings: DeskSettings | null | undefined): { prefill: PlannerPrefill; sources: PrefillSources } {
  const preset = symbolPresetFor(plan.symbol);
  const side = tradePlanSide({ bias: plan.bias, checklist: plan.checklist ?? null });
  const sized = savedSizing(plan.sizing);
  const zone = readEntryZone(plan.entryZone);

  const planRisk = positiveNumber(plan.riskPercent);
  const limit = resolveRiskLimits(plan.strategy, settings).riskPerTradePct;
  const riskSource: PrefillSources["risk"] = planRisk !== null ? "plan" : limit ? limit.source : "default";
  const risk = planRisk ?? limit?.value ?? 1;

  const startingBalance = positiveNumber(settings?.startingBalance);
  const balanceSource: PrefillSources["balance"] = sized ? "sizing" : startingBalance !== null ? "account" : "none";
  const balance = sized?.balance ?? startingBalance;

  const stopLoss = positiveNumber(plan.stopLoss);
  const takeProfit = positiveNumber(plan.takeProfit);

  // A price read out of the entry zone is used only if it can be the entry of this plan: a zone like "8 am" or a
  // price on the wrong side of the stop is left for the trader. The entry of an earlier sizing was the trader's own.
  const zoneUsable = zone !== null && between(zone.price, stopLoss, takeProfit);
  const entry = sized?.entry ?? (zone && zoneUsable ? zone.price : null);
  const entrySource: PrefillSources["entry"] = sized ? "sizing" : zone && zoneUsable ? zone.kind : zone ? "outside" : "none";

  return {
    prefill: {
      symbol: preset ?? "custom",
      direction: side === "long" ? "buy" : "sell",
      balance: balance === null ? "" : asText(balance),
      risk: asText(risk),
      entry: entry === null ? "" : asText(entry),
      stopLoss: stopLoss === null ? "" : asText(stopLoss),
      finalTp: takeProfit === null ? "" : asText(takeProfit),
      positions: asText(sized?.positions ?? 3),
      ...(preset ? {} : EMPTY_SPEC)
    },
    sources: {
      symbol: preset ? "preset" : "custom",
      direction: explicitPlanSide(plan.checklist) ? "chosen" : "guessed",
      balance: balanceSource,
      risk: riskSource,
      entry: entrySource,
      entryZone: plan.entryZone
    }
  };
}

/**
 * Money to cents exactly the way the planner prints it (`formatMoney` rounds with Intl, which can differ by a cent from
 * `toFixed` on a half cent), and R to two places the way the planner prints R (`toFixed`): what is stored is what was on
 * screen.
 */
const MONEY_ROUNDING = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, useGrouping: false });
const cents = (value: number) => Number(MONEY_ROUNDING.format(value));
const twoPlaces = (value: number) => Number(value.toFixed(2));

/**
 * The sizing to store inside the plan, from the planner's current result; null when there is no valid result (or the
 * plan would have more legs than the API stores). Prices are the ones the legs are built on, already snapped to the
 * symbol's tick, so the plan's levels and the leg table never disagree.
 */
export function buildPlanSizing(snapshot: PlannerSnapshot, now: Date): PlanSizing | null {
  if (!snapshot.result.ok) return null;
  const { plan } = snapshot.result;
  if (plan.legs.length < 1 || plan.legs.length > 20) return null;
  return {
    symbol: snapshot.symbol,
    direction: snapshot.direction,
    balance: snapshot.balance,
    riskPercent: snapshot.riskPercent,
    entry: plan.entry,
    stopLoss: plan.stopLoss,
    finalTp: plan.finalTp,
    totalVolume: plan.totalVolume,
    riskMoney: cents(plan.riskMoney),
    lossAtStop: cents(plan.allocatedSlLoss),
    finalRr: twoPlaces(plan.finalRr),
    legs: plan.legs.map((leg) => ({ volume: leg.volume, takeProfit: leg.takeProfit, rr: twoPlaces(leg.rr) })),
    sizedAt: now.toISOString()
  };
}

/**
 * The prices as saved, when the symbol's tick moved one of the typed ones (a stop of 2640.125 on a 0.01 tick is saved
 * as 2640.13); null when every typed price was already on the tick, or there is no valid result.
 */
export function tickAdjustedPrices(snapshot: PlannerSnapshot): { entry: number; stopLoss: number; finalTp: number } | null {
  if (!snapshot.result.ok) return null;
  const { plan } = snapshot.result;
  const typed = [snapshot.entry, snapshot.stopLoss, snapshot.finalTp];
  const saved = [plan.entry, plan.stopLoss, plan.finalTp];
  if (!typed.every(Number.isFinite)) return null;
  const moved = typed.some((value, index) => Math.abs(value - saved[index]) > 1e-9 * Math.max(1, Math.abs(saved[index])));
  return moved ? { entry: plan.entry, stopLoss: plan.stopLoss, finalTp: plan.finalTp } : null;
}

/**
 * The side the plan was given ("long" or "short") when the planner is sizing the other one; null when they agree, or
 * when the plan has no saved direction (older plans: nothing to contradict).
 */
export function sizedAgainstPlan(plan: Pick<DeskPlan, "checklist">, direction: Direction): "long" | "short" | null {
  const planSide = explicitPlanSide(plan.checklist ?? null);
  const sizedSide = direction === "buy" ? "long" : "short";
  return planSide !== null && planSide !== sizedSide ? planSide : null;
}

/**
 * The one `PATCH /api/trade-plans` body that saves a sizing into its plan. It names the status the plan was loaded
 * with (`expectedStatus`), so a plan that was converted, closed, canceled or activated in another tab is refused (409)
 * instead of being changed, and it never writes a status itself. Only the fields the desk worked out are sent. A sizing of the other side than the direction the plan was given
 * would leave the plan contradicting itself (a long with its stop above its target), so it is not built.
 */
export function buildPlanUpdate(plan: DeskPlan, snapshot: PlannerSnapshot, now: Date): PlanUpdate | null {
  if (!isOpenPlan(plan)) return null;
  if (sizedAgainstPlan(plan, snapshot.direction)) return null;
  const sizing = buildPlanSizing(snapshot, now);
  if (!sizing) return null;
  return {
    id: plan.id,
    expectedStatus: plan.status,
    stopLoss: sizing.stopLoss,
    takeProfit: sizing.finalTp,
    riskPercent: snapshot.riskPercent,
    riskAmount: sizing.lossAtStop,
    sizing,
    checklist: { ...(plan.checklist ?? {}), riskCalculated: true }
  };
}

/** The limits that apply to a plan: each one the strategy sets, else the account's default. */
export function planLimits(plan: DeskPlan, settings: DeskSettings | null | undefined): RiskLimits {
  return resolveRiskLimits(plan.strategy, settings);
}

/**
 * Where the numbers on the planner step over the limits. The plan's own positions (legs) count against the
 * open-positions limit: positions the account already has elsewhere are not known here.
 */
export function sizingViolations(limits: RiskLimits, riskPercent: number, positions: number): PlanRiskViolation[] {
  return checkPlanRisk(
    {
      riskPercent: Number.isFinite(riskPercent) ? riskPercent : null,
      openPositions: Number.isInteger(positions) && positions >= 1 ? positions - 1 : undefined
    },
    limits
  );
}
