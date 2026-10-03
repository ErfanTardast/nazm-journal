export type ReadinessAction = "review" | "risk" | "plan" | "journal" | "ready";

export type ReadinessInput = {
  hasCompletePlan: boolean;
  riskDefaultsValid: boolean;
  overdueReviews: number;
  ruleViolations: number;
  journalFollowUps: number;
};

export type ReadinessCheck = {
  key: "plan" | "risk" | "review" | "rules" | "journal";
  passed: boolean;
  count: number;
};

export type ReadinessSummary = {
  status: "ready" | "caution" | "not_ready";
  score: number;
  primaryAction: ReadinessAction;
  checks: ReadinessCheck[];
};

export function calculateReadiness(input: ReadinessInput): ReadinessSummary {
  const checks: ReadinessCheck[] = [
    { key: "plan", passed: input.hasCompletePlan, count: input.hasCompletePlan ? 0 : 1 },
    { key: "risk", passed: input.riskDefaultsValid, count: input.riskDefaultsValid ? 0 : 1 },
    { key: "review", passed: input.overdueReviews === 0, count: input.overdueReviews },
    { key: "rules", passed: input.ruleViolations === 0, count: input.ruleViolations },
    { key: "journal", passed: input.journalFollowUps === 0, count: input.journalFollowUps }
  ];
  const passed = checks.filter((check) => check.passed).length;
  const score = Math.round((passed / checks.length) * 100);
  const failedCount = checks.length - passed;

  return {
    status: failedCount === 0 ? "ready" : failedCount <= 2 ? "caution" : "not_ready",
    score,
    primaryAction: choosePrimaryAction(input),
    checks
  };
}

function choosePrimaryAction(input: ReadinessInput): ReadinessAction {
  if (input.overdueReviews > 0 || input.ruleViolations > 0) return "review";
  if (!input.riskDefaultsValid) return "risk";
  if (!input.hasCompletePlan) return "plan";
  if (input.journalFollowUps > 0) return "journal";
  return "ready";
}
