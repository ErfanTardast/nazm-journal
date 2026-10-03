import type { LimitValue } from "./limit-format";

/** A strategy as `GET /api/strategies` sends it, as far as the plan screen reads it. Lists may be missing on old rows. */
export type PlanStrategy = {
  id: string;
  name: string;
  isActive?: boolean;
  isSample?: boolean;
  allowedMarkets?: string[];
  entryRules?: string[];
  exitRules?: string[];
  invalidationRules?: string[];
  riskRules?: string[];
  checklist?: string[];
  riskPerTradePct?: LimitValue;
  maxDailyLossPct?: LimitValue;
  maxOpenPositions?: LimitValue;
};

/**
 * The plan's `checklist` JSON holds booleans, and every value has to be true for the plan to count as complete (the plans
 * page and the dashboard both read it that way). The strategy's items are stored next to the three built-in ones and
 * `direction` under their own prefix, so none of those keys can be taken by a strategy item.
 */
export const STRATEGY_ITEM_PREFIX = "strategy:";

export type StrategyChecklistItem = { key: string; label: string };

const sameLabel = (label: string) => label.trim().toLowerCase();

/**
 * The strategy's checklist as tick boxes: trimmed, blank lines dropped, a repeated line kept once. An item that says what
 * one of the form's own tick boxes already says (`builtInLabels`, compared trimmed and without regard to case) is left
 * out, so the plan never asks the same question twice and cannot be held incomplete by a duplicate.
 */
export function strategyChecklistItems(strategy: PlanStrategy | null | undefined, builtInLabels: readonly string[] = []): StrategyChecklistItem[] {
  const asked = new Set(builtInLabels.map(sameLabel));
  const seen = new Set<string>();
  const items: StrategyChecklistItem[] = [];
  for (const raw of strategy?.checklist ?? []) {
    const label = String(raw ?? "").trim();
    if (!label || seen.has(label) || asked.has(sameLabel(label))) continue;
    seen.add(label);
    items.push({ key: `${STRATEGY_ITEM_PREFIX}${label}`, label });
  }
  return items;
}

/** The market to preselect: only when the strategy allows exactly one. */
export function onlyMarket(strategy: PlanStrategy | null | undefined): string | null {
  const markets = strategy?.allowedMarkets ?? [];
  return markets.length === 1 ? markets[0] : null;
}
