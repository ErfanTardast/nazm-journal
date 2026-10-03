import { describe, expect, it } from "vitest";
import {
  buildDisciplineSprint,
  buildOnboardingPlan,
  resolveDisciplineIssue,
  resolveExperience,
  resolveLanguage,
  resolveMarket
} from "@/lib/onboarding/segmentation";

describe("onboarding segmentation (pure)", () => {
  it("coerces unknown inputs to safe defaults", () => {
    expect(resolveExperience("???")).toBe("beginner");
    expect(resolveMarket(undefined)).toBe("crypto");
    expect(resolveDisciplineIssue(null)).toBe("no_plan");
    expect(resolveLanguage("de")).toBe("en");
    expect(resolveLanguage("fa")).toBe("fa");
  });

  it("builds a discipline-first plan for a beginner", () => {
    // The plan is written in the language asked for; the Persian wording is covered in onboarding-locale.test.ts.
    const plan = buildOnboardingPlan({ experience: "beginner", market: "crypto", disciplineIssue: "moving_stops", language: "en" });
    expect(plan.segment).toBe("beginner-crypto-moving_stops");
    expect(plan.defaultRiskPercent).toBe(0.5); // beginners size down
    expect(plan.language).toBe("en");
    expect(plan.focusAreas[0]).toMatch(/stop/i); // routed by the chosen issue
    expect(plan.recommendedFeatures).toContain("learning");
    expect(plan.startingChecklist).toContain("Trade in Learning Mode first");
  });

  it("gives advanced users a higher default risk and performance focus", () => {
    const plan = buildOnboardingPlan({ experience: "advanced", market: "forex", disciplineIssue: "overtrading", language: "en" });
    expect(plan.defaultRiskPercent).toBe(1);
    expect(plan.recommendedFeatures).toContain("performance");
    expect(plan.startingChecklist.some((c) => /adherence/i.test(c))).toBe(true);
  });

  it("is deterministic and fully defaults from an empty input", () => {
    const a = buildOnboardingPlan({});
    const b = buildOnboardingPlan({});
    expect(a).toEqual(b);
    expect(a.segment).toBe("beginner-crypto-no_plan");
  });

  it("builds a deterministic 7-day discipline sprint inside MVP market scope", () => {
    const plan = buildOnboardingPlan({ experience: "intermediate", market: "stocks", disciplineIssue: "fomo", language: "en" });
    const sprint = buildDisciplineSprint(plan, "2026-06-27");
    expect(sprint.days).toHaveLength(7);
    expect(sprint.startDate).toBe("2026-06-27");
    expect(sprint.endDate).toBe("2026-07-03");
    expect(sprint.targetMistake).toMatch(/written plan/i);
    expect(sprint.riskDefaults.riskPerTradePct).toBe(1);
    expect(sprint.starterPlaybook.allowedMarkets).toEqual(["stocks"]);
    expect(sprint.starterPlaybook.tags).toContain("onboarding-sprint");
  });
});
