import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { buildMentorReport } from "@/lib/calculations/mentor-report";
import { englishLeaks } from "./support/english-leaks";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "@/lib/api/client";
import { PlaybookCoachingPanel } from "@/features/strategy/playbook-coaching-panel";

const en = getMessages("en");

function mockApi(mentor: unknown) {
  vi.mocked(apiFetch).mockImplementation((url: string) =>
    Promise.resolve(
      url.includes("mentor")
        ? mentor
        : { playbooks: [{ strategyId: "s1", name: "Breakout", tradeCount: 4, adherenceRate: 0.75, avgRMultiple: 0.4, topMistake: "chasing" }] }
    ) as never
  );
}

const requested = () => vi.mocked(apiFetch).mock.calls.map(([url]) => url);

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("PlaybookCoachingPanel", () => {
  it("renders playbook adherence + the entitlement-locked mentor state (free tier)", async () => {
    mockApi({ available: false, requiredTier: "elite", report: null });
    render(<PlaybookCoachingPanel messages={en} locale="en" />);
    expect(await screen.findByText("Breakout")).toBeInTheDocument();
    expect(screen.getByText(/75%/)).toBeInTheDocument(); // adherence value
    expect(screen.getByText(/chasing/)).toBeInTheDocument(); // watch-for mistake
    expect(await screen.findByText(/Mentor report is available on the Elite plan/)).toBeInTheDocument();
  });

  it("renders the mentor report when available, with a hide/show P&L toggle", async () => {
    mockApi({
      available: true,
      report: {
        headline: "Process review for weekly: 4 trades.",
        processMetrics: ["Trades: 4", "Win rate: 50.0%"],
        pnl: null,
        playbookHighlight: null,
        disciplineNote: "Discipline grade: B.",
        improvement: "Focus next: keep one improvement.",
        disclaimer: "Shared for process review only."
      }
    });
    render(<PlaybookCoachingPanel messages={en} locale="en" />);
    expect(await screen.findByText(/Process review for weekly/)).toBeInTheDocument();
    expect(screen.getByText("Win rate: 50.0%")).toBeInTheDocument(); // unique to the mentor report
    expect(screen.getByText(/Discipline grade: B/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.coaching.showPnl })).toBeInTheDocument();
  });
});

describe("PlaybookCoachingPanel in Persian", () => {
  const fa = getMessages("fa");

  it("shows the server's English mentor report in Persian, and no tier name in Latin letters", async () => {
    mockApi({
      available: true,
      report: buildMentorReport({
        period: "all time",
        metrics: { totalTrades: 4, winRate: 0.5, avgRMultiple: 0.3, profitFactor: 1.4, netPnl: 12 },
        disciplineGrade: "B",
        topPlaybook: { name: "بازگشت", adherenceRate: 0.75, avgRMultiple: 0.4 },
        topMistake: "ورود زودهنگام"
      })
    });
    const { container } = render(<PlaybookCoachingPanel messages={fa} locale="fa" />);
    expect(await screen.findByText(/مرور فرایند برای کل دوره/)).toBeInTheDocument();
    expect(englishLeaks(container, ["Breakout", "chasing"])).toEqual([]);
  });

  it("shows a report the server already wrote in Persian untouched", async () => {
    const report = buildMentorReport(
      {
        period: "کل دوره",
        metrics: { totalTrades: 4, winRate: 0.5, avgRMultiple: 0.3, profitFactor: 1.4, netPnl: 12 },
        disciplineGrade: "B",
        topPlaybook: { name: "بازگشت", adherenceRate: 0.75, avgRMultiple: 0.4 },
        topMistake: "ورود زودهنگام"
      },
      { locale: "fa" }
    );
    mockApi({ available: true, report });
    const { container } = render(<PlaybookCoachingPanel messages={fa} locale="fa" />);
    expect(await screen.findByText(report.headline)).toBeInTheDocument();
    expect(screen.getByText(report.improvement)).toBeInTheDocument();
    expect(screen.getByText(report.disclaimer)).toBeInTheDocument();
    expect(englishLeaks(container, ["Breakout", "chasing"])).toEqual([]);
  });

  it("names the plan once when the report is locked, without the English tier code", async () => {
    mockApi({ available: false, requiredTier: "elite", report: null });
    const { container } = render(<PlaybookCoachingPanel messages={fa} locale="fa" />);
    expect(await screen.findByText(fa.coaching.locked)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/elite/i);
  });
});

describe("PlaybookCoachingPanel asks for the report in the page language", () => {
  it.each(["fa", "en"] as const)("sends locale=%s with the mentor report request, and again when P&L is shown", async (locale) => {
    mockApi({ available: false, requiredTier: "elite", report: null });
    render(<PlaybookCoachingPanel messages={getMessages(locale)} locale={locale} />);
    await screen.findByText(getMessages(locale).coaching.locked);
    expect(requested()).toContain(`/api/mentor-report?hidePnl=true&locale=${locale}`);

    fireEvent.click(screen.getByRole("button", { name: getMessages(locale).coaching.showPnl }));
    await vi.waitFor(() => expect(requested()).toContain(`/api/mentor-report?hidePnl=false&locale=${locale}`));
    expect(requested().filter((url) => String(url).includes("mentor-report") && !String(url).includes(`locale=${locale}`))).toEqual([]);
  });
});
