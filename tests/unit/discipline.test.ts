import { describe, expect, it } from "vitest";
import { calculateDisciplineScore, hasDisciplineData } from "@/lib/calculations/discipline";
import type { DisciplineInput } from "@/lib/calculations/discipline";

const ZERO_INPUT: DisciplineInput = {
  totalPlansThisWeek: 0,
  completePlansThisWeek: 0,
  totalTradesThisWeek: 0,
  followedRulesCount: 0,
  brokenRulesCount: 0,
  mixedRulesCount: 0,
  unreviewedRulesCount: 0,
  closedTradesTotal: 0,
  closedTradesWithJournal: 0,
  repeatedMistakeCount: 0,
  overdueReviews: 0
};

/** Something to grade: one trade opened this week, nothing else recorded. */
const ONE_TRADE: DisciplineInput = { ...ZERO_INPUT, totalTradesThisWeek: 1 };

function scored(input: DisciplineInput) {
  const result = calculateDisciplineScore(input);
  if (!result) throw new Error("expected a discipline score");
  return result;
}

describe("calculateDisciplineScore", () => {
  // A brand-new account used to be graded B / 75: every check without data defaulted to 100 except plan
  // adherence. With nothing to grade there is no grade and no score, not a comfortable default.
  it("returns no grade and no score when there is nothing to grade", () => {
    expect(calculateDisciplineScore(ZERO_INPUT)).toBeNull();
    expect(hasDisciplineData(ZERO_INPUT)).toBe(false);
  });

  it("does not grade a week that only has plans, with no trade to judge", () => {
    expect(calculateDisciplineScore({ ...ZERO_INPUT, totalPlansThisWeek: 2, completePlansThisWeek: 1 })).toBeNull();
  });

  it("grades once a trade was opened this week", () => {
    expect(hasDisciplineData(ONE_TRADE)).toBe(true);
    expect(calculateDisciplineScore(ONE_TRADE)).not.toBeNull();
  });

  it("grades once earlier closed trades exist, even in a quiet week", () => {
    const result = calculateDisciplineScore({ ...ZERO_INPUT, closedTradesTotal: 3, closedTradesWithJournal: 3 });
    expect(result).not.toBeNull();
  });

  it("scores a first trade with no plan and no verdict from the checks, not from a default grade", () => {
    // plan_adherence 0 (no plans), rule_discipline 100 (nothing broken), journal 100, mistakes 100, reviews 100.
    const result = scored(ONE_TRADE);
    expect(result.score).toBe(75);
    expect(result.checks.find((c) => c.key === "plan_adherence")?.score).toBe(0);
  });

  it("returns grade A when all checks score 100", () => {
    const result = scored({
      ...ZERO_INPUT,
      totalPlansThisWeek: 3,
      completePlansThisWeek: 3,
      totalTradesThisWeek: 5,
      followedRulesCount: 5,
      brokenRulesCount: 0,
      closedTradesTotal: 5,
      closedTradesWithJournal: 5
    });
    expect(result.grade).toBe("A");
    expect(result.score).toBe(100);
  });

  it("penalizes each repeated mistake by 20 points in mistake_control check", () => {
    const r1 = scored({ ...ONE_TRADE, repeatedMistakeCount: 1 });
    const r3 = scored({ ...ONE_TRADE, repeatedMistakeCount: 3 });
    const mistakeCheck1 = r1.checks.find((c) => c.key === "mistake_control")!;
    const mistakeCheck3 = r3.checks.find((c) => c.key === "mistake_control")!;
    expect(mistakeCheck1.score).toBe(80);
    expect(mistakeCheck3.score).toBe(40);
    expect(mistakeCheck3.score).toBeLessThan(mistakeCheck1.score);
  });

  it("clamps mistake_control score to 0 when repeatedMistakeCount >= 5", () => {
    const result = scored({ ...ONE_TRADE, repeatedMistakeCount: 6 });
    const check = result.checks.find((c) => c.key === "mistake_control")!;
    expect(check.score).toBe(0);
  });

  it("plan_adherence passes when >= 60% of plans are complete", () => {
    const result = scored({ ...ONE_TRADE, totalPlansThisWeek: 5, completePlansThisWeek: 3 });
    const check = result.checks.find((c) => c.key === "plan_adherence")!;
    expect(check.score).toBe(60);
    expect(check.passed).toBe(true);
  });

  it("rule_discipline fails when broken exceeds 25% of trades", () => {
    const result = scored({ ...ONE_TRADE, totalTradesThisWeek: 4, followedRulesCount: 2, brokenRulesCount: 2 });
    const check = result.checks.find((c) => c.key === "rule_discipline")!;
    expect(check.score).toBe(50);
    expect(check.passed).toBe(false);
  });

  it("counts trades without a rule verdict against rule discipline", () => {
    // Imported or unreviewed trades are not evidence of following the rules.
    const result = scored({ ...ONE_TRADE, totalTradesThisWeek: 10, followedRulesCount: 2, unreviewedRulesCount: 8 });
    const check = result.checks.find((c) => c.key === "rule_discipline")!;

    expect(check.score).toBe(20);
    expect(check.passed).toBe(false);
    expect(check.detail).toMatch(/8 not reviewed/);
  });

  it("counts trades with a mixed verdict as not fully following the rules", () => {
    const result = scored({ ...ONE_TRADE, totalTradesThisWeek: 10, mixedRulesCount: 10 });
    const check = result.checks.find((c) => c.key === "rule_discipline")!;

    expect(check.score).toBe(0);
    expect(check.detail).toMatch(/10 mixed/);
  });

  it("review_consistency deducts 25 points per overdue review", () => {
    const result = scored({ ...ONE_TRADE, overdueReviews: 2 });
    const check = result.checks.find((c) => c.key === "review_consistency")!;
    expect(check.score).toBe(50);
  });

  it("returns grade F when multiple checks fail badly", () => {
    const result = scored({
      totalPlansThisWeek: 5,
      completePlansThisWeek: 0,
      totalTradesThisWeek: 5,
      followedRulesCount: 0,
      brokenRulesCount: 5,
      mixedRulesCount: 0,
      unreviewedRulesCount: 0,
      closedTradesTotal: 5,
      closedTradesWithJournal: 0,
      repeatedMistakeCount: 5,
      overdueReviews: 4
    });
    expect(result.grade).toBe("F");
    expect(result.score).toBeLessThan(45);
  });

  it("returns all 5 check keys", () => {
    const result = scored(ONE_TRADE);
    const keys = result.checks.map((c) => c.key);
    expect(keys).toContain("plan_adherence");
    expect(keys).toContain("rule_discipline");
    expect(keys).toContain("journal_completeness");
    expect(keys).toContain("mistake_control");
    expect(keys).toContain("review_consistency");
  });
});
