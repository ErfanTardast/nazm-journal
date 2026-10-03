import { describe, expect, it } from "vitest";
import { buildMentorReport } from "@/lib/calculations/mentor-report";
import { localizeMentorReport } from "@/features/strategy/mentor-report-text";

/*
 * The mentor report is written in English by the server. On the Persian page its fixed sentences are shown in Persian;
 * the numbers, the playbook name and the mistake the trader wrote stay as they are. The report is built with the real
 * builder here, so a change to its wording fails this test instead of silently bringing English back.
 */

const INPUT = {
  period: "all time",
  metrics: { totalTrades: 12, winRate: 0.5, avgRMultiple: 0.3, profitFactor: 1.4, netPnl: 152.5 },
  disciplineGrade: "B",
  topPlaybook: { name: "بازگشت به میانه", adherenceRate: 0.75, avgRMultiple: 0.4 },
  topMistake: "ورود زودهنگام"
};

const LATIN_WORD = /[A-Za-z]{2,}/;

function everyString(report: ReturnType<typeof localizeMentorReport>) {
  return [report.headline, ...report.processMetrics, report.pnl, report.playbookHighlight, report.disciplineNote, report.improvement, report.disclaimer].filter(
    (text): text is string => typeof text === "string"
  );
}

describe("localizeMentorReport", () => {
  it("leaves the English page's report exactly as the server wrote it", () => {
    const report = buildMentorReport(INPUT);
    expect(localizeMentorReport(report, "en")).toEqual(report);
  });

  it("writes every sentence of a full report in Persian, keeping the numbers and names", () => {
    const report = localizeMentorReport(buildMentorReport(INPUT), "fa");
    for (const text of everyString(report)) expect(text.replace(/\bR\b/g, "")).not.toMatch(LATIN_WORD);
    expect(report.headline).toContain("12");
    expect(report.headline).toContain("50.0%");
    expect(report.processMetrics).toHaveLength(4);
    expect(report.processMetrics.join(" ")).toContain("1.40");
    expect(report.pnl).toContain("152.50");
    expect(report.playbookHighlight).toContain("بازگشت به میانه");
    expect(report.playbookHighlight).toContain("75.0%");
    expect(report.improvement).toContain("ورود زودهنگام");
  });

  it("handles a report with no P&L, playbook, grade or mistake", () => {
    const report = localizeMentorReport(
      buildMentorReport({ ...INPUT, disciplineGrade: null, topPlaybook: null, topMistake: null, metrics: { ...INPUT.metrics, profitFactor: Infinity } }, { hidePnl: true }),
      "fa"
    );
    expect(report.pnl).toBeNull();
    expect(report.playbookHighlight).toBeNull();
    expect(report.disciplineNote).toBeNull();
    for (const text of everyString(report)) expect(text).not.toMatch(LATIN_WORD);
  });

  it("handles a playbook without adherence or R", () => {
    const report = localizeMentorReport(buildMentorReport({ ...INPUT, topPlaybook: { name: "ستاپ", adherenceRate: null, avgRMultiple: null } }), "fa");
    for (const text of everyString(report)) expect(text.replace(/\bR\b/g, "")).not.toMatch(LATIN_WORD);
  });

  it("keeps a sentence it does not recognise unchanged instead of dropping it", () => {
    const report = { ...buildMentorReport(INPUT), improvement: "Something the server added later." };
    expect(localizeMentorReport(report, "fa").improvement).toBe("Something the server added later.");
  });

  it("keeps a custom period name as the server sent it", () => {
    const report = localizeMentorReport(buildMentorReport({ ...INPUT, period: "last 7 days" }), "fa");
    expect(report.headline).toContain("last 7 days");
  });
});
