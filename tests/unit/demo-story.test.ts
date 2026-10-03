import { describe, expect, it } from "vitest";
import { buildDemoStory } from "@/lib/demo/story";

describe("buildDemoStory (pure, deterministic)", () => {
  it("produces a deterministic 14-day story with consecutive dates", () => {
    const a = buildDemoStory("2026-06-01");
    const b = buildDemoStory("2026-06-01");
    expect(a).toEqual(b); // deterministic
    expect(a.days).toHaveLength(14);
    expect(a.days[0].date).toBe("2026-06-01");
    expect(a.days[13].date).toBe("2026-06-14"); // 14 consecutive UTC days
    expect(a.days.map((d) => d.index)).toEqual([...Array(14).keys()]);
  });

  it("shows the repeated mistake early and discipline improving", () => {
    const story = buildDemoStory();
    const earlyMistakeDays = story.days.slice(0, 7).filter((d) => d.mistakes.includes(story.repeatedMistake));
    const lateMistakeDays = story.days.slice(7).filter((d) => d.mistakes.includes(story.repeatedMistake));
    expect(earlyMistakeDays.length).toBeGreaterThan(0); // recurs in week 1
    expect(lateMistakeDays.length).toBe(0); // fades in week 2
    expect(story.disciplineImproved).toBe(true);
    expect(story.summary.firstGrade).toBe("C");
    expect(story.summary.finalGrade).toBe("A");
  });

  it("includes AI-refusal and risk-guard evidence", () => {
    const story = buildDemoStory();
    expect(story.aiRefusalExample.refused).toBe(true);
    expect(story.riskGuardExample.blocked).toBe(true);
    expect(story.summary.followedRate).toBeGreaterThanOrEqual(0);
    expect(story.summary.followedRate).toBeLessThanOrEqual(1);
    expect(story.summary.totalTrades).toBe(7 * 3 + 7 * 2); // 35
  });
});
