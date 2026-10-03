export type PlanSide = "long" | "short";

/** Words that mean "short" in a free-text bias, in English and Persian. JS \b only knows ASCII, so Persian has none. */
const shortBias = /\b(?:bear(?:s|ish)?|short|sell)\b|نزول|فروش|شورت|کاهشی|ریزش|خرس/i;

/**
 * The direction the trader picked on the plan form. It travels in the plan's checklist JSON (the plan has no
 * column of its own), so anything other than "long" or "short" counts as not chosen.
 */
export function explicitPlanSide(checklist: unknown): PlanSide | null {
  if (typeof checklist !== "object" || checklist === null) return null;
  const direction = (checklist as Record<string, unknown>).direction;
  return direction === "long" || direction === "short" ? direction : null;
}

/** Best guess for older plans that were saved without a direction: read it from the bias wording. */
export function sideFromBiasText(bias: string): PlanSide {
  return shortBias.test(bias) ? "short" : "long";
}

/** The side of the trade a plan turns into: the chosen direction, or the bias wording for older plans. */
export function tradePlanSide(plan: { bias: string; checklist: unknown }): PlanSide {
  return explicitPlanSide(plan.checklist) ?? sideFromBiasText(plan.bias);
}
