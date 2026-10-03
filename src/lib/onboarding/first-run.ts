/**
 * The first run, as the screens see it. Pure and free of the server and of zod, so the guided flow, the dashboard card
 * and the API share one definition: the two answers a person gives, the steps, and where a returning person resumes.
 */

/** How the person trades; the first question. */
export const TRADING_PLATFORMS = ["mt5", "other", "manual"] as const;
export type TradingPlatform = (typeof TRADING_PLATFORMS)[number];

/** What the person wants first; the second question. */
export const PRIMARY_GOALS = ["discipline", "risk", "performance", "strategy"] as const;
export type PrimaryGoal = (typeof PRIMARY_GOALS)[number];

/** Where a person stands in the first run. The `has...` flags count only the person's own rows, never sample data. */
export type FirstRunState = {
  tradingPlatform: TradingPlatform | null;
  primaryGoal: PrimaryGoal | null;
  /** When the steps were finished or skipped (ISO date-time); null = not seen yet. */
  onboardedAt: string | null;
  hasTrades: boolean;
  hasStrategy: boolean;
  hasPlan: boolean;
  /** Sample data is loaded in the account (it is not the person's own, so it changes none of the flags above). */
  hasSample: boolean;
};

/** The five steps of the guided flow: how you trade, your goal, your history, your first strategy, the dashboard. */
export const FLOW_STEP_COUNT = 5;
export type FlowStep = 1 | 2 | 3 | 4 | 5;

export const emptyFirstRunState: FirstRunState = {
  tradingPlatform: null,
  primaryGoal: null,
  onboardedAt: null,
  hasTrades: false,
  hasStrategy: false,
  hasPlan: false,
  hasSample: false
};

/** Reads a response of `GET /api/onboarding/state` (or anything else) into a state; a missing or odd field reads as "not yet". */
export function normalizeFirstRunState(raw: unknown): FirstRunState {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const nested = source.state && typeof source.state === "object" ? (source.state as Record<string, unknown>) : source;
  return {
    tradingPlatform: TRADING_PLATFORMS.find((value) => value === nested.tradingPlatform) ?? null,
    primaryGoal: PRIMARY_GOALS.find((value) => value === nested.primaryGoal) ?? null,
    onboardedAt: typeof nested.onboardedAt === "string" && nested.onboardedAt ? nested.onboardedAt : null,
    hasTrades: nested.hasTrades === true,
    hasStrategy: nested.hasStrategy === true,
    hasPlan: nested.hasPlan === true,
    hasSample: nested.hasSample === true
  };
}

/**
 * The step a returning person resumes at: the first one that still needs an answer. Both questions come first; the
 * history step is done once they have trades of their own, the strategy step once they have a strategy; the last step
 * (the dashboard) is always open.
 */
export function firstOpenStep(state: FirstRunState): FlowStep {
  if (!state.tradingPlatform) return 1;
  if (!state.primaryGoal) return 2;
  if (!state.hasTrades) return 3;
  if (!state.hasStrategy) return 4;
  return 5;
}
