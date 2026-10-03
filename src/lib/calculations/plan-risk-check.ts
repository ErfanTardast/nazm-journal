/**
 * Which risk limits apply to a plan, and where a plan steps over them. Pure: no database, no wording. The screens
 * (the plan form and the risk desk) turn a violation into a sentence in the page language. A violation is a
 * warning for the trader to read before saving; nothing here blocks a save.
 */
export type LimitSource = "strategy" | "account";
export type RiskLimit = { value: number; source: LimitSource };

export type RiskLimits = {
  /** Largest risk of one trade, as a percent of the account. */
  riskPerTradePct: RiskLimit | null;
  /** Largest loss in one day, as a percent of the account. */
  maxDailyLossPct: RiskLimit | null;
  /** How many positions may be open at once; only a strategy sets it. */
  maxOpenPositions: RiskLimit | null;
};

/** The limit fields as the API sends them: numbers, or Prisma decimals serialized as text. */
type NumberLike = number | string | null | undefined;
export type StrategyLimitFields = { riskPerTradePct?: NumberLike; maxDailyLossPct?: NumberLike; maxOpenPositions?: NumberLike };
export type AccountLimitFields = { riskPerTradePct?: NumberLike; maxDailyLossPct?: NumberLike };

export type PlanRiskViolation = {
  code: "risk_per_trade" | "daily_loss" | "open_positions";
  limit: number;
  actual: number;
  source: LimitSource;
};

/** Room for floating-point noise, so 0.1 + 0.2 is not "above" 0.3. */
const EPSILON = 1e-9;

function positive(value: NumberLike): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function pick(strategyValue: NumberLike, accountValue: NumberLike): RiskLimit | null {
  const fromStrategy = positive(strategyValue);
  if (fromStrategy !== null) return { value: fromStrategy, source: "strategy" };
  const fromAccount = positive(accountValue);
  return fromAccount !== null ? { value: fromAccount, source: "account" } : null;
}

/** Each limit the strategy sets wins over the account default; a missing, zero or broken number is no limit. */
export function resolveRiskLimits(strategy: StrategyLimitFields | null | undefined, account: AccountLimitFields | null | undefined): RiskLimits {
  return {
    riskPerTradePct: pick(strategy?.riskPerTradePct, account?.riskPerTradePct),
    maxDailyLossPct: pick(strategy?.maxDailyLossPct, account?.maxDailyLossPct),
    maxOpenPositions: pick(strategy?.maxOpenPositions, null)
  };
}

/**
 * `riskPercent` is the plan's risk as a percent of the account. `openPositions` counts the positions already open
 * (or planned) besides this plan; leave it out when it is not known.
 */
export function checkPlanRisk(plan: { riskPercent: number | null | undefined; openPositions?: number }, limits: RiskLimits): PlanRiskViolation[] {
  const violations: PlanRiskViolation[] = [];
  const risk = positive(plan.riskPercent);

  if (risk !== null && limits.riskPerTradePct && risk > limits.riskPerTradePct.value + EPSILON) {
    violations.push({ code: "risk_per_trade", limit: limits.riskPerTradePct.value, actual: risk, source: limits.riskPerTradePct.source });
  }
  if (risk !== null && limits.maxDailyLossPct && risk > limits.maxDailyLossPct.value + EPSILON) {
    violations.push({ code: "daily_loss", limit: limits.maxDailyLossPct.value, actual: risk, source: limits.maxDailyLossPct.source });
  }
  if (limits.maxOpenPositions && typeof plan.openPositions === "number" && Number.isFinite(plan.openPositions)) {
    const withThisPlan = plan.openPositions + 1;
    if (withThisPlan > limits.maxOpenPositions.value) {
      violations.push({ code: "open_positions", limit: limits.maxOpenPositions.value, actual: withThisPlan, source: limits.maxOpenPositions.source });
    }
  }
  return violations;
}
