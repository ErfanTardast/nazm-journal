import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { emptyReport, fullReport, servePerformance } from "./support/performance-report";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { PerformanceScreen } from "@/features/performance/performance-screen";

const en = getMessages("en");
const fa = getMessages("fa");

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

const performanceCalls = () => (apiFetch as Mock).mock.calls.map((call) => String(call[0])).filter((path) => path.startsWith("/api/performance"));

describe("PerformanceScreen data and period", () => {
  it("asks for the whole history first, then for the period a chip names", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport(), "30d": fullReport({ context: { ...fullReport().context, period: "30d" } }) });
    render(<PerformanceScreen locale="en" messages={en} />);

    const all = await screen.findByRole("button", { name: "All" });
    expect(performanceCalls()).toEqual(["/api/performance?period=all"]);
    expect(all).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    await waitFor(() => expect(performanceCalls()).toEqual(["/api/performance?period=all", "/api/performance?period=30d"]));
    await waitFor(() => expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
  });

  it("has four chips, each at least 44 px high", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="en" messages={en} />);

    await screen.findByRole("button", { name: "All" });
    const chips = ["7 days", "30 days", "90 days", "All"].map((name) => screen.getByRole("button", { name }));
    for (const chip of chips) expect(chip.className).toContain("min-h-11");
  });

  it("writes the chips in Persian digits on the Persian page", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="fa" messages={fa} />);

    for (const name of ["۷ روز", "۳۰ روز", "۹۰ روز", "همه"]) expect(await screen.findByRole("button", { name })).toBeInTheDocument();
  });

  it("names the time zone the days are counted in, with a link to Settings", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="en" messages={en} />);

    expect(await screen.findByText(/Days in your time zone:/)).toBeInTheDocument();
    expect(screen.getByText("Asia/Tehran")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change in Settings" })).toHaveAttribute("href", "/en/settings");
  });

  it("says the same in Persian", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="fa" messages={fa} />);

    expect(await screen.findByText(/^روزها به وقت/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "تغییر در تنظیمات" })).toHaveAttribute("href", "/fa/settings");
  });

  it("labels sample data, and only sample data", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport({ context: { ...fullReport().context, source: "sample" } }) });
    const { unmount } = render(<PerformanceScreen locale="en" messages={en} />);
    expect(await screen.findByText("Sample data")).toBeInTheDocument();
    unmount();

    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "All" });
    expect(screen.queryByText("Sample data")).not.toBeInTheDocument();
  });

  it("calls the sample data «داده نمونه» on the Persian page", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport({ context: { ...fullReport().context, source: "sample" } }) });
    render(<PerformanceScreen locale="fa" messages={fa} />);

    expect(await screen.findByText("داده نمونه")).toBeInTheDocument();
  });

  it("notes a small sample only when the sample is small", async () => {
    const small = fullReport();
    small.summary = { ...small.summary, lowSample: true, entries: { ...small.summary.entries, count: 12 } };
    servePerformance(apiFetch as Mock, { all: small });
    const { unmount } = render(<PerformanceScreen locale="en" messages={en} />);
    expect(await screen.findByText(/Based on 12 entries/)).toBeInTheDocument();
    unmount();

    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "All" });
    expect(screen.queryByText(/Based on/)).not.toBeInTheDocument();
  });

  it("says how many closed trades have no money value, only when some do not", async () => {
    const report = fullReport();
    report.summary = { ...report.summary, unpricedClosed: 3 };
    servePerformance(apiFetch as Mock, { all: report });
    const { unmount } = render(<PerformanceScreen locale="en" messages={en} />);
    expect(await screen.findByText("3 closed trades have no money value and are left out of the money figures.")).toBeInTheDocument();
    unmount();

    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "All" });
    expect(screen.queryByText(/no money value/)).not.toBeInTheDocument();
  });

  it("says how many open trades are not included, only when some are open", async () => {
    const report = fullReport();
    report.summary = { ...report.summary, openTrades: 2 };
    servePerformance(apiFetch as Mock, { all: report });
    const { unmount } = render(<PerformanceScreen locale="en" messages={en} />);
    expect(await screen.findByText("2 open trades are not included.")).toBeInTheDocument();
    unmount();

    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "All" });
    expect(screen.queryByText(/open trade/)).not.toBeInTheDocument();
  });

  it("writes the notes in Persian digits and Persian words", async () => {
    const report = fullReport();
    report.summary = { ...report.summary, lowSample: true, unpricedClosed: 3, openTrades: 2, entries: { ...report.summary.entries, count: 12 } };
    servePerformance(apiFetch as Mock, { all: report });
    render(<PerformanceScreen locale="fa" messages={fa} />);

    expect(await screen.findByText(/بر پایه‌ی ۱۲ ورود/)).toBeInTheDocument();
    expect(screen.getByText(/۳ معامله‌ی بسته ارزش پولی ندارد/)).toBeInTheDocument();
    expect(screen.getByText(/۲ معامله‌ی باز/)).toBeInTheDocument();
  });

  it("shows a short empty state for a period with no closed trade, with a way back to All", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport(), "7d": emptyReport("7d", { source: "own" }) });
    render(<PerformanceScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "All" });

    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    expect(await screen.findByText("No closed trades in this period")).toBeInTheDocument();
    expect(screen.queryByText("Not enough data yet")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show all trades" }));
    await waitFor(() => expect(performanceCalls().at(-1)).toBe("/api/performance?period=all"));
    await waitFor(() => expect(screen.queryByText("No closed trades in this period")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  });

  it("still says how many trades are open when the period has no closed trade", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport(), "7d": emptyReport("7d", { source: "own", openTrades: 2 }) });
    render(<PerformanceScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "All" });

    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    expect(await screen.findByText("2 open trades are not included.")).toBeInTheDocument();
    expect(screen.queryByText(/Based on/)).not.toBeInTheDocument();
  });

  it("keeps the first-run empty state (import, journal) for an account with no closed trade at all", async () => {
    servePerformance(apiFetch as Mock, { all: emptyReport("all") }, { "GET /api/sample-workspace": { active: false, loadedAt: null, canLoad: true } });
    render(<PerformanceScreen locale="en" messages={en} />);

    expect(await screen.findByText("Not enough data yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import MT5 trades" })).toHaveAttribute("href", "/en/import");
    expect(screen.getByRole("link", { name: "Log a trade in the journal" })).toHaveAttribute("href", "/en/journal");
    expect(screen.queryByRole("button", { name: "30 days" })).not.toBeInTheDocument();
  });

  it("says when the report cannot be loaded, in the page's words", async () => {
    (apiFetch as Mock).mockRejectedValue(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    render(<PerformanceScreen locale="en" messages={en} />);

    expect(await screen.findByText("Performance unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Unexpected server error")).not.toBeInTheDocument();
  });

  it("asks a signed-out visitor to sign in", async () => {
    (apiFetch as Mock).mockRejectedValue(new ApiClientError("Authentication required", 401, "UNAUTHORIZED"));
    render(<PerformanceScreen locale="en" messages={en} />);

    expect(await screen.findByText("Sign in required")).toBeInTheDocument();
  });

  it("keeps the chips when a period fails to load, so another one can be tried", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "All" });

    fireEvent.click(screen.getByRole("button", { name: "90 days" }));
    expect(await screen.findByText("Performance unavailable")).toBeInTheDocument();
    const chips = screen.getByRole("group", { name: "Time period" });
    fireEvent.click(within(chips).getByRole("button", { name: "All" }));
    await waitFor(() => expect(screen.queryByText("Performance unavailable")).not.toBeInTheDocument());
  });
});

describe("PerformanceScreen headline cards", () => {
  const labelsEn = ["Net P&L", "Win rate", "Profit factor", "Expectancy", "Average R", "Max drawdown"];
  const labelsFa = ["سود و زیان خالص", "نرخ برد", "ضریب سود", "امید ریاضی", "میانگین R", "بیشترین افت سرمایه"];

  it.each([
    ["en", labelsEn],
    ["fa", labelsFa]
  ] as const)("shows six cards, each with a label, a value and a one-line explanation (%s)", async (locale, labels) => {
    servePerformance(apiFetch as Mock, { all: fullReport() });
    const { container } = render(<PerformanceScreen locale={locale} messages={locale === "fa" ? fa : en} />);
    await screen.findByText(labels[0]);

    const cards = Array.from(container.querySelectorAll("[data-headline]"));
    expect(cards).toHaveLength(6);
    cards.forEach((card, index) => {
      const lines = Array.from(card.querySelectorAll("p")).map((line) => line.textContent ?? "");
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe(labels[index]);
      expect(lines[1].trim()).not.toBe("");
      expect(lines[2].trim().length).toBeGreaterThan(10);
    });
  });

  it("writes the fixture's numbers as the page language does", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="en" messages={en} />);

    expect(await screen.findByText("+$275.51")).toBeInTheDocument();
    expect(screen.getByText("58.33%")).toBeInTheDocument();
    expect(screen.getByText("1.82")).toBeInTheDocument();
    expect(screen.getByText("+$11.48")).toBeInTheDocument();
    expect(screen.getByText("1.25R")).toBeInTheDocument();
    expect(screen.getByText("$120.50")).toBeInTheDocument();
  });

  it("explains each number from what it counts", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="en" messages={en} />);

    expect(await screen.findByText("24 closed trades in this period, after fees")).toBeInTheDocument();
    expect(screen.getByText("14 wins, 9 losses and 1 breakeven out of 24 closed trades")).toBeInTheDocument();
    expect(screen.getByText("Gross profit $612.40 divided by gross loss $336.89")).toBeInTheDocument();
    expect(screen.getByText("Average result per closed trade so far, over 24 trades with a money value")).toBeInTheDocument();
    expect(screen.getByText("Average result in R over the 24 closed trades that have an R")).toBeInTheDocument();
    expect(screen.getByText("Deepest fall from a high of the curve in this period (3.4R)")).toBeInTheDocument();
  });

  it("adds the share of the balance for the whole history when the starting balance is set", async () => {
    const report = fullReport();
    report.summary = { ...report.summary, maxDrawdownPct: 0.0412 };
    servePerformance(apiFetch as Mock, { all: report });
    render(<PerformanceScreen locale="en" messages={en} />);

    expect(await screen.findByText("Deepest fall from a high of the curve in this period (3.4R), 4.12% of the balance at that high")).toBeInTheDocument();
  });

  it("shows a dash and a reason, not a zero, when a number does not exist", async () => {
    const report = fullReport();
    report.summary = { ...report.summary, profitFactor: null, profitFactorState: "no_losses", grossLoss: 0, expectancy: null, averageR: null, winRate: null };
    servePerformance(apiFetch as Mock, { all: report });
    const { container } = render(<PerformanceScreen locale="en" messages={en} />);
    await screen.findByText("Profit factor");

    const card = (name: string) => container.querySelector(`[data-headline="${name}"]`)!;
    expect(card("profit-factor").textContent).toContain("—");
    expect(card("profit-factor").textContent).toContain("No losing trade in this period");
    expect(card("expectancy").textContent).toContain("—");
    expect(card("average-r").textContent).toContain("—");
    expect(card("win-rate").textContent).toContain("—");
  });

  it("says there is nothing to compare when the period has no profit and no loss", async () => {
    const report = fullReport();
    report.summary = { ...report.summary, profitFactor: null, profitFactorState: "no_results", grossLoss: 0, grossProfit: 0 };
    servePerformance(apiFetch as Mock, { all: report });
    render(<PerformanceScreen locale="en" messages={en} />);

    expect(await screen.findByText("No profit or loss to compare in this period")).toBeInTheDocument();
  });

  it("changes the numbers when another period is chosen", async () => {
    const month = fullReport({ context: { ...fullReport().context, period: "30d" } });
    month.summary = { ...month.summary, closedTrades: 9, netPnl: -42.1, winRate: 4 / 9, wins: 4, losses: 5, breakeven: 0 };
    servePerformance(apiFetch as Mock, { all: fullReport(), "30d": month });
    render(<PerformanceScreen locale="en" messages={en} />);
    expect(await screen.findByText("+$275.51")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    expect(await screen.findByText("-$42.10")).toBeInTheDocument();
    expect(screen.queryByText("+$275.51")).not.toBeInTheDocument();
    expect(screen.getByText("9 closed trades in this period, after fees")).toBeInTheDocument();
  });

  it("keeps a negative result's minus on the left in Persian", async () => {
    const report = fullReport();
    report.summary = { ...report.summary, netPnl: -42.1 };
    servePerformance(apiFetch as Mock, { all: report });
    const { container } = render(<PerformanceScreen locale="fa" messages={fa} />);
    await screen.findByText("سود و زیان خالص");

    const value = container.querySelector('[data-headline="net-pnl"] p:nth-of-type(2)')?.textContent ?? "";
    expect(value).toContain("−");
    expect(value).not.toContain("-");
    expect(value).toContain("۴۲٫۱۰");
  });

  it("says wins are counted after costs", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="fa" messages={fa} />);

    expect(await screen.findByText(/بعد از کمیسیون و سواپ/)).toBeInTheDocument();
  });
});

describe("PerformanceScreen entries", () => {
  function withLadders(pendingLegs = 0, combined = 2) {
    const report = fullReport();
    report.summary = { ...report.summary, entries: { ...report.summary.entries, combined, pendingLegs } };
    return report;
  }

  it("shows per-entry results when ladder legs were combined", async () => {
    servePerformance(apiFetch as Mock, { all: withLadders() });
    render(<PerformanceScreen locale="en" messages={en} />);

    const panel = within((await screen.findByText("By entry (ladder legs combined)")).closest(".rounded-lg") as HTMLElement);
    expect(panel.getByText("Entry win rate")).toBeInTheDocument();
    expect(panel.getByText("56.67%")).toBeInTheDocument();
    expect(panel.getByText("0.41R")).toBeInTheDocument();
    expect(panel.getByText("+$9.18")).toBeInTheDocument();
  });

  it("hides the entries block when no trade was split into legs", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="en" messages={en} />);

    await screen.findByText("Average R");
    expect(screen.queryByText(/ladder legs combined/i)).not.toBeInTheDocument();
  });

  it("says when closed legs wait for the rest of their entry", async () => {
    servePerformance(apiFetch as Mock, { all: withLadders(2, 0) });
    render(<PerformanceScreen locale="en" messages={en} />);

    expect(await screen.findByText(/2 closed positions belong to entries whose other legs are still open or not imported yet/i)).toBeInTheDocument();
  });
});

describe("PerformanceScreen equity chart", () => {
  it("draws the period's equity and drawdown under the cards, with a text alternative", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="en" messages={en} />);

    expect(await screen.findByRole("img", { name: /Equity curve and drawdown.*24 closed trades/ })).toHaveAttribute("dir", "ltr");
    expect(screen.getByRole("heading", { name: "Equity curve" })).toBeInTheDocument();
  });

  it("says so when the period has trades but no two of them have a money value", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport({ equity: [] }) });
    render(<PerformanceScreen locale="en" messages={en} />);

    expect(await screen.findByText(/Two or more closed trades with a money value are needed/)).toBeInTheDocument();
  });
});

describe("PerformanceScreen R distribution", () => {
  it("shows the seven R buckets in place of the old P&L distribution card", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="en" messages={en} />);

    expect(await screen.findByRole("heading", { name: "R distribution" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Entries by result in R" })).getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getByText(/3 trades without R \(no stop\)/)).toBeInTheDocument();
    expect(screen.queryByText("P&L distribution")).not.toBeInTheDocument();
  });
});

describe("PerformanceScreen breakdowns", () => {
  it("shows the nine breakdowns of the report, each titled", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="en" messages={en} />);

    for (const title of [
      "Performance by strategy", "Performance by session", "Performance by symbol", "Performance by side (long or short)",
      "Performance by weekday", "Performance by setup", "Mistake analysis", "Emotion analysis", "Performance by market"
    ]) expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
  });

  it("translates the report's keys and keeps the trader's own words", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="fa" messages={fa} />);

    expect((await screen.findAllByText("لندن")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("دوشنبه").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Breakout").length).toBeGreaterThan(0);
  });

  it("says what to do in a breakdown the report left empty", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport({ breakdowns: { ...fullReport().breakdowns, mistake: [] } }) });
    render(<PerformanceScreen locale="en" messages={en} />);

    const card = (await screen.findByRole("heading", { name: "Mistake analysis" })).closest(".rounded-lg") as HTMLElement;
    expect(within(card).getByText("Add more journal entries to populate this review.")).toBeInTheDocument();
  });
});

describe("PerformanceScreen order and layout", () => {
  it("reads in the order of a phone: cards, chart, behaviour, breakdowns, R histogram, entries, review questions", async () => {
    const report = fullReport();
    report.summary = { ...report.summary, entries: { ...report.summary.entries, combined: 2 } };
    servePerformance(apiFetch as Mock, { all: report });
    render(<PerformanceScreen locale="en" messages={en} />);
    await screen.findByRole("heading", { name: "Equity curve" });

    const names = [
      "Closed trades: all time",
      "Equity curve",
      "Behaviour",
      "Performance by strategy",
      "Performance by session",
      "Performance by symbol",
      "Performance by side (long or short)",
      "Performance by weekday",
      "Performance by setup",
      "Mistake analysis",
      "Emotion analysis",
      "Performance by market",
      "R distribution",
      "By entry (ladder legs combined)",
      "Weekly review prompts"
    ];
    const headings = names.map((name) => screen.getByRole("heading", { name }));
    headings.slice(1).forEach((heading, index) => {
      expect(headings[index].compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it("keeps the four review questions as questions", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="en" messages={en} />);

    const list = (await screen.findByRole("heading", { name: "Weekly review prompts" })).closest(".rounded-lg") as HTMLElement;
    const questions = within(list).getAllByRole("listitem").map((item) => item.textContent ?? "");
    expect(questions).toHaveLength(4);
    for (const question of questions) expect(question.endsWith("?")).toBe(true);
  });

  it("gives every grid one column on a phone, and lets its children shrink", async () => {
    const report = fullReport();
    report.summary = { ...report.summary, entries: { ...report.summary.entries, combined: 2 } };
    servePerformance(apiFetch as Mock, { all: report });
    const { container } = render(<PerformanceScreen locale="en" messages={en} />);
    await screen.findByRole("heading", { name: "Behaviour" });

    const grids = Array.from(container.querySelectorAll(".grid"));
    expect(grids.length).toBeGreaterThanOrEqual(4);
    for (const grid of grids) {
      expect(grid.className).toContain("grid-cols-1");
      for (const child of Array.from(grid.children)) expect(child.className).toContain("min-w-0");
    }
  });

  it("no longer builds anything from the last twelve trades", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="en" messages={en} />);
    await screen.findByRole("heading", { name: "Behaviour" });

    expect(screen.queryByText("P&L distribution")).not.toBeInTheDocument();
    expect(performanceCalls()).toEqual(["/api/performance?period=all"]);
    expect((apiFetch as Mock).mock.calls.map((call) => String(call[0]))).not.toContain("/api/trades");
  });
});

describe("PerformanceScreen links to the journal", () => {
  it("gives each breakdown row a link that opens the journal on the trades behind it, for the period shown", async () => {
    const report = fullReport({ context: { ...fullReport().context, period: "30d" } });
    servePerformance(apiFetch as Mock, { all: fullReport(), "30d": report });
    render(<PerformanceScreen locale="en" messages={en} />);

    await screen.findByRole("button", { name: "All" });
    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "See these trades: Wednesday" }).getAttribute("href")).toContain("period=30d"));
    const weekday = report.breakdowns.weekday.find((row) => row.label.kind === "key" && row.label.key === "weekday.3")!;
    const link = await screen.findByRole("link", { name: "See these trades: Wednesday" });
    expect(link).toHaveAttribute("href", `/en/journal?period=30d&dimension=weekday&row=${encodeURIComponent(weekday.id)}`);

    const symbol = report.breakdowns.symbol[0];
    expect(screen.getByRole("link", { name: "See these trades: XAUUSD" })).toHaveAttribute(
      "href",
      `/en/journal?period=30d&dimension=symbol&row=${encodeURIComponent(symbol.id)}`
    );
  });

  it("writes the link and the address in Persian", async () => {
    servePerformance(apiFetch as Mock, { all: fullReport() });
    render(<PerformanceScreen locale="fa" messages={fa} />);

    const link = await screen.findByRole("link", { name: "دیدن این معامله‌ها: چهارشنبه" });
    expect(link).toHaveTextContent("دیدن این معامله‌ها");
    expect(link.getAttribute("href")?.startsWith("/fa/journal?period=all&dimension=weekday&row=")).toBe(true);
  });
});
