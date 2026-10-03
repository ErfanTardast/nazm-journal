import { describe, expect, it, vi } from "vitest";
import { buildReviewContext, coachContextLines } from "@/lib/services/ai/coach-context";

vi.mock("@/lib/services/discipline", () => ({ getDisciplineOverview: vi.fn() }));
vi.mock("@/lib/services/sessions", () => ({ getActiveSession: vi.fn() }));
vi.mock("@/lib/services/trade-plans", () => ({ listTradePlans: vi.fn() }));
vi.mock("@/lib/services/reviews", () => ({ getReviewFocus: vi.fn() }));
vi.mock("@/lib/services/discipline-streak", () => ({ getDisciplineStreak: vi.fn() }));
import { getDisciplineOverview } from "@/lib/services/discipline";
import { getActiveSession } from "@/lib/services/sessions";
import { listTradePlans } from "@/lib/services/trade-plans";
import { getReviewFocus } from "@/lib/services/reviews";
import { getDisciplineStreak } from "@/lib/services/discipline-streak";

describe("coachContextLines (pure)", () => {
  it("builds grade + mistake + session lines from full context", () => {
    const { observations, nextActions } = coachContextLines({
      disciplineGrade: "B", disciplineScore: 78,
      topMistake: { mistake: "moved stop after entry", frequency: 3, streak: 2 },
      sessionMistakeToAvoid: "revenge trading"
    });
    expect(observations.join(" ")).toContain("discipline grade is B (78/100)");
    expect(observations.join(" ")).toContain("moved stop after entry");
    expect(observations.join(" ")).toContain("revenge trading");
    expect(nextActions.length).toBe(2);
  });

  it("fabricates nothing from empty context", () => {
    const r = coachContextLines({});
    expect(r.observations).toEqual([]);
    expect(r.nextActions).toEqual([]);
  });

  it("includes only the parts present", () => {
    const r = coachContextLines({ topMistake: { mistake: "no stop loss", frequency: 5, streak: 1 } });
    expect(r.observations).toHaveLength(1);
    expect(r.observations[0]).toContain("no stop loss");
    expect(r.nextActions).toHaveLength(1);
  });
});

describe("buildReviewContext (read-only, best-effort)", () => {
  it("reduces saved discipline + mistake + session into coach lines", async () => {
    vi.mocked(getDisciplineOverview).mockResolvedValue({
      disciplineScore: { grade: "B", score: 78, checks: [] },
      propGuard: {}, weekSummary: {},
      mistakePatterns: [{ mistake: "moved stop", frequency: 3, streak: 2, lastSeen: new Date(), avgRImpact: -0.5 }]
    } as never);
    vi.mocked(getActiveSession).mockResolvedValue({ mistakeToAvoid: "revenge trade" } as never);

    const r = await buildReviewContext("u1");
    const blob = r.observations.join(" ");
    expect(blob).toContain("grade is B");
    expect(blob).toContain("moved stop");
    expect(blob).toContain("revenge trade");
  });

  it("returns no lines (never throws) when a service fails", async () => {
    vi.mocked(getDisciplineOverview).mockRejectedValue(new Error("db down"));
    vi.mocked(getActiveSession).mockResolvedValue(null as never);
    const r = await buildReviewContext("u1");
    expect(r.observations).toEqual([]);
    expect(r.nextActions).toEqual([]);
  });

  it("grounds the review in the written plan for the reviewed symbol", async () => {
    vi.mocked(getDisciplineOverview).mockResolvedValue({ mistakePatterns: [] } as never);
    vi.mocked(getActiveSession).mockResolvedValue(null as never);
    vi.mocked(listTradePlans).mockResolvedValue([
      { symbol: "BTCUSDT", bias: "long", status: "ready", riskPercent: 1, invalidationRule: "close below 60k" }
    ] as never);
    const r = await buildReviewContext("u1", "btcusdt");
    const blob = r.observations.join(" ");
    expect(blob).toContain("written plan for BTCUSDT");
    expect(blob).toContain("close below 60k");
    expect(r.nextActions.join(" ")).toContain("against the written plan");
  });

  it("flags a missing plan for the reviewed symbol without fabricating one", async () => {
    vi.mocked(getDisciplineOverview).mockResolvedValue({ mistakePatterns: [] } as never);
    vi.mocked(getActiveSession).mockResolvedValue(null as never);
    vi.mocked(listTradePlans).mockResolvedValue([
      { symbol: "EURUSD", bias: "short", status: "ready", riskPercent: 1, invalidationRule: null }
    ] as never);
    const r = await buildReviewContext("u1", "BTCUSDT");
    expect(r.observations.join(" ")).toContain("No written plan covers BTCUSDT");
    expect(r.nextActions.join(" ")).toContain("before the next BTCUSDT trade");
  });

  it("adds overdue-review and streak lines", async () => {
    vi.mocked(getDisciplineOverview).mockResolvedValue({ mistakePatterns: [] } as never);
    vi.mocked(getActiveSession).mockResolvedValue(null as never);
    vi.mocked(getReviewFocus).mockResolvedValue({ review: null, overdueCount: 2, suggestedType: "daily" } as never);
    vi.mocked(getDisciplineStreak).mockResolvedValue({
      currentStreak: 5, bestStreak: 9, totalActiveDays: 20, totalDisciplinedDays: 15,
      lastActiveDate: "2026-07-03", brokeStreakOnLastDay: false
    } as never);
    const r = await buildReviewContext("u1");
    const blob = r.observations.join(" ");
    expect(blob).toContain("2 overdue review");
    expect(blob).toContain("5-day disciplined streak");
    expect(r.nextActions.join(" ")).toContain("Protect the streak");
  });

  it("treats a broken streak as the restart point", async () => {
    vi.mocked(getDisciplineOverview).mockResolvedValue({ mistakePatterns: [] } as never);
    vi.mocked(getActiveSession).mockResolvedValue(null as never);
    vi.mocked(getDisciplineStreak).mockResolvedValue({
      currentStreak: 0, bestStreak: 9, totalActiveDays: 20, totalDisciplinedDays: 15,
      lastActiveDate: "2026-07-03", brokeStreakOnLastDay: true
    } as never);
    const r = await buildReviewContext("u1");
    expect(r.observations.join(" ")).toContain("broke your discipline streak");
    expect(r.nextActions.join(" ")).toContain("restart");
  });

  it("keeps the original context when the NEW sources fail", async () => {
    vi.mocked(getDisciplineOverview).mockResolvedValue({
      disciplineScore: { grade: "A", score: 92, checks: [] }, mistakePatterns: []
    } as never);
    vi.mocked(getActiveSession).mockResolvedValue(null as never);
    vi.mocked(listTradePlans).mockRejectedValue(new Error("db down"));
    vi.mocked(getReviewFocus).mockRejectedValue(new Error("db down"));
    vi.mocked(getDisciplineStreak).mockRejectedValue(new Error("db down"));
    const r = await buildReviewContext("u1", "BTCUSDT");
    expect(r.observations.join(" ")).toContain("grade is A");  // old context survives new-source failure
  });
});
