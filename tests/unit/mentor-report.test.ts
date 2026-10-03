import { describe, expect, it, vi } from "vitest";
import { buildMentorReport } from "@/lib/calculations/mentor-report";

const INPUT = {
  period: "last 7 days",
  metrics: { totalTrades: 12, winRate: 0.5, avgRMultiple: 0.3, profitFactor: 1.4, netPnl: 152.5 },
  disciplineGrade: "B",
  topPlaybook: { name: "Breakout", adherenceRate: 0.75, avgRMultiple: 0.4 },
  topMistake: "moved stop after entry"
};

describe("buildMentorReport (pure, share-safe)", () => {
  it("includes P&L when not hidden", () => {
    const rpt = buildMentorReport(INPUT, { hidePnl: false });
    expect(rpt.pnlHidden).toBe(false);
    expect(rpt.pnl).toContain("Net P&L: 152.50");
    expect(rpt.shareSafe).toBe(true);
    expect(rpt.playbookHighlight).toContain("Breakout");
    expect(rpt.disciplineNote).toContain("B");
    expect(rpt.improvement).toContain("moved stop after entry");
  });

  it("redacts P&L when hidden (process metrics remain)", () => {
    const rpt = buildMentorReport(INPUT, { hidePnl: true });
    expect(rpt.pnlHidden).toBe(true);
    expect(rpt.pnl).toBeNull();
    const blob = JSON.stringify(rpt);
    expect(blob).not.toContain("152.5"); // no money figure leaks anywhere
    expect(blob).toContain("Average R"); // process metrics still present
  });

  it("contains no signal/social-trading wording (the disclaimer NEGATES those terms; scan the body)", () => {
    const { disclaimer, ...body } = buildMentorReport(INPUT);
    expect(disclaimer.toLowerCase()).toContain("not a trade signal"); // safety statement present
    const blob = JSON.stringify(body).toLowerCase();
    for (const banned of ["signal", "buy now", "sell now", "copy trading", "follow me", "guaranteed"]) {
      expect(blob).not.toContain(banned);
    }
  });

  it("degrades gracefully with no playbook/mistake", () => {
    const rpt = buildMentorReport({ ...INPUT, topPlaybook: null, topMistake: null });
    expect(rpt.playbookHighlight).toBeNull();
    expect(rpt.improvement).toContain("checklist improvement");
  });
});

describe("getMentorReport (service, mocked)", () => {
  it("assembles a report from metrics + adherence + discipline", async () => {
    vi.resetModules();
    vi.doMock("@/lib/services/trades", () => ({
      getTradeMetrics: vi.fn().mockResolvedValue({ totalTrades: 5, winRate: 0.6, averageR: 0.2, profitFactor: 1.2, netPnl: 40 })
    }));
    vi.doMock("@/lib/services/playbook-adherence", () => ({
      getPlaybookAdherence: vi.fn().mockResolvedValue([{ name: "Pullback", adherenceRate: 0.8, avgRMultiple: 0.5, tradeCount: 3 }])
    }));
    vi.doMock("@/lib/services/discipline", () => ({
      getDisciplineOverview: vi.fn().mockResolvedValue({ disciplineScore: { grade: "A" }, mistakePatterns: [{ mistake: "no stop" }] })
    }));
    const { getMentorReport } = await import("@/lib/services/mentor-report");
    const rpt = await getMentorReport("u1", { period: "weekly", hidePnl: true });
    expect(rpt.headline).toContain("weekly");
    expect(rpt.pnlHidden).toBe(true);
    expect(rpt.playbookHighlight).toContain("Pullback");
    expect(rpt.disciplineNote).toContain("A");
    vi.doUnmock("@/lib/services/trades");
    vi.doUnmock("@/lib/services/playbook-adherence");
    vi.doUnmock("@/lib/services/discipline");
  });

  // The metrics are all-time, so the default period must not claim "last 30 days".
  it("labels its default period honestly as all time and omits the grade when there is none", async () => {
    vi.resetModules();
    vi.doMock("@/lib/services/trades", () => ({
      getTradeMetrics: vi.fn().mockResolvedValue({ totalTrades: 0, winRate: 0, averageR: 0, profitFactor: 0, netPnl: 0 })
    }));
    vi.doMock("@/lib/services/playbook-adherence", () => ({ getPlaybookAdherence: vi.fn().mockResolvedValue([]) }));
    vi.doMock("@/lib/services/discipline", () => ({
      getDisciplineOverview: vi.fn().mockResolvedValue({ disciplineScore: null, mistakePatterns: [] })
    }));
    const { getMentorReport } = await import("@/lib/services/mentor-report");
    const rpt = await getMentorReport("u1");
    expect(rpt.period).toBe("all time");
    expect(rpt.headline).not.toMatch(/last 30 days/);
    expect(rpt.disciplineNote).toBeNull();
    vi.doUnmock("@/lib/services/trades");
    vi.doUnmock("@/lib/services/playbook-adherence");
    vi.doUnmock("@/lib/services/discipline");
  });
});
