import { describe, expect, it } from "vitest";
import { calculateReadiness } from "@/lib/calculations/readiness";

describe("trading readiness", () => {
  it("reports ready only when every discipline check passes", () => {
    expect(
      calculateReadiness({
        hasCompletePlan: true,
        riskDefaultsValid: true,
        overdueReviews: 0,
        ruleViolations: 0,
        journalFollowUps: 0
      })
    ).toMatchObject({ status: "ready", score: 100, primaryAction: "ready" });
  });

  it("prioritizes overdue reviews and rule violations", () => {
    const result = calculateReadiness({
      hasCompletePlan: false,
      riskDefaultsValid: false,
      overdueReviews: 2,
      ruleViolations: 1,
      journalFollowUps: 3
    });

    expect(result.status).toBe("not_ready");
    expect(result.primaryAction).toBe("review");
    expect(result.checks.find((check) => check.key === "review")?.count).toBe(2);
  });

  it("prioritizes risk before plan and journal setup", () => {
    expect(
      calculateReadiness({
        hasCompletePlan: false,
        riskDefaultsValid: false,
        overdueReviews: 0,
        ruleViolations: 0,
        journalFollowUps: 1
      }).primaryAction
    ).toBe("risk");
  });
});
