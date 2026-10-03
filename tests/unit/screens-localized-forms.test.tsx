import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { englishLeaks } from "./support/english-leaks";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { AlertsScreen } from "@/features/alerts/alerts-screen";
import { BacktestScreen } from "@/features/backtesting/backtest-screen";
import { LearningScreen } from "@/features/learning/learning-screen";
import { PortfolioScreen } from "@/features/portfolio/portfolio-screen";
import { StrategyScreen } from "@/features/strategy/strategy-screen";
import { WatchlistsScreen } from "@/features/watchlists/watchlists-screen";

const en = getMessages("en");
const fa = getMessages("fa");
const ARABIC_SCRIPT = /[؀-ۿ]/;

/*
 * The Persian page must not keep English headings, column titles, badges, empty states or error lines. Each screen is
 * rendered with locale="fa" and the visible text is scanned for English words (support/english-leaks.ts).
 */

type Call = { key: string; body?: Record<string, unknown> };
const calls: Call[] = [];
const posted = (key: string) => calls.filter((call) => call.key === key);

function serve(routes: Record<string, unknown | ((init?: RequestInit) => unknown)>) {
  calls.length = 0;
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (!(key in routes)) throw new Error(`Unexpected request ${key}`);
    const handler = routes[key];
    return typeof handler === "function" ? handler(init) : handler;
  });
}

function failWith(error: unknown) {
  (apiFetch as Mock).mockRejectedValue(error);
}

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

function field(container: HTMLElement | HTMLFormElement, name: string) {
  const element = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`);
  if (!element) throw new Error(`no field named ${name}`);
  return element;
}

function type(container: HTMLElement | HTMLFormElement, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) fireEvent.change(field(container, name), { target: { value } });
}

const strategyRoutes = {
  "GET /api/strategies": {
    strategies: [
      { id: "s1", name: "بازگشت به میانه", description: null, allowedMarkets: ["crypto", "forex"], isActive: true },
      { id: "s2", name: "شکست محدوده", description: null, allowedMarkets: ["stocks"], isActive: false }
    ]
  },
  "GET /api/playbooks/adherence": { playbooks: [] },
  "GET /api/mentor-report?hidePnl=true&locale=fa": { available: false, requiredTier: "elite", report: null },
  "GET /api/mentor-report?hidePnl=true&locale=en": { available: false, requiredTier: "elite", report: null }
};

describe("StrategyScreen in Persian", () => {
  it("has no English heading, label, column, badge or market name", async () => {
    serve(strategyRoutes);
    const { container } = render(<StrategyScreen locale="fa" messages={fa} />);
    await screen.findByRole("table");
    expect(englishLeaks(container)).toEqual([]);
    expect(screen.getByRole("columnheader", { name: "نام" })).toBeInTheDocument();
    expect(screen.getByText("کریپتو، فارکس")).toBeInTheDocument();
    expect(screen.getByText("فعال")).toBeInTheDocument();
    expect(screen.getByText("غیرفعال")).toBeInTheDocument();
  });

  it("has no English in the empty state", async () => {
    serve({ ...strategyRoutes, "GET /api/strategies": { strategies: [] } });
    const { container } = render(<StrategyScreen locale="fa" messages={fa} />);
    await screen.findByText("هنوز استراتژی‌ای نیست");
    expect(englishLeaks(container)).toEqual([]);
  });

  it("shows a Persian line when the strategy could not be saved", async () => {
    serve({
      ...strategyRoutes,
      "POST /api/strategies": () => {
        throw new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: { entryRules: ["Too small"] } });
      }
    });
    const { container } = render(<StrategyScreen locale="fa" messages={fa} />);
    await screen.findByRole("table");
    type(container, { name: "بازگشت", entryRules: "منتظر تأیید", exitRules: "خروج در میانه" });
    fireEvent.click(container.querySelector('input[name="allowedMarkets"][value="forex"]')!);
    fireEvent.click(screen.getByRole("button", { name: "ساخت استراتژی" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(ARABIC_SCRIPT);
    expect(englishLeaks(alert)).toEqual([]);
    // The line sits in the form, just above the Create button, not in a banner far above the form.
    const form = container.querySelector("form")!;
    expect(form.contains(alert)).toBe(true);
    const submitButton = within(form).getByRole("button", { name: "ساخت استراتژی" });
    expect(alert.compareDocumentPosition(submitButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(alert.nextElementSibling).toBe(submitButton);
  });

  it("words the markets hint as a plain Persian sentence", async () => {
    serve(strategyRoutes);
    render(<StrategyScreen locale="fa" messages={fa} />);
    await screen.findByRole("table");
    expect(screen.getByText("بازارهایی را که این پلی‌بوک برای آن‌ها نوشته شده انتخاب کنید.")).toBeInTheDocument();
  });

  it("hands its language to the coaching panel, so the mentor report is requested in Persian", async () => {
    serve(strategyRoutes);
    render(<StrategyScreen locale="fa" messages={fa} />);
    await screen.findByRole("table");
    await waitFor(() => expect(calls.map((call) => call.key)).toContain("GET /api/mentor-report?hidePnl=true&locale=fa"));
    expect(calls.map((call) => call.key)).not.toContain("GET /api/mentor-report?hidePnl=true&locale=en");
  });

  it("keeps a failed list load in the banner above the form", async () => {
    failWith(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    const { container } = render(<StrategyScreen locale="fa" messages={fa} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(ARABIC_SCRIPT);
    expect(container.querySelector("form")!.contains(alert)).toBe(false);
  });
});

describe("StrategyScreen sends only what the trader entered", () => {
  it("posts the typed rules and the chosen markets and nothing invented", async () => {
    serve({ ...strategyRoutes, "POST /api/strategies": { strategy: { id: "s3" } } });
    const { container } = render(<StrategyScreen locale="en" messages={en} />);
    await screen.findByRole("table");
    type(container, { name: "Range fade", entryRules: "Wait for the sweep", exitRules: "Exit at the midpoint" });
    fireEvent.click(container.querySelector('input[name="allowedMarkets"][value="crypto"]')!);
    fireEvent.click(screen.getByRole("button", { name: "Create strategy" }));

    await waitFor(() => expect(posted("POST /api/strategies")).toHaveLength(1));
    const body = posted("POST /api/strategies")[0].body!;
    expect(body).toMatchObject({ name: "Range fade", entryRules: ["Wait for the sweep"], exitRules: ["Exit at the midpoint"], allowedMarkets: ["crypto"] });
    expect(body).not.toHaveProperty("riskRules");
    expect(body).not.toHaveProperty("allowedSessions");
    expect(body).not.toHaveProperty("checklist");
    expect(JSON.stringify(body)).not.toMatch(/Max 1% risk|London|New York|News checked|Risk calculated/);
  });

  it("sends the optional risk rules, sessions and checklist only when they were typed", async () => {
    serve({ ...strategyRoutes, "POST /api/strategies": { strategy: { id: "s3" } } });
    const { container } = render(<StrategyScreen locale="en" messages={en} />);
    await screen.findByRole("table");
    type(container, {
      name: "Range fade",
      entryRules: "Wait for the sweep",
      exitRules: "Exit at the midpoint",
      riskRules: "Stop after two losses\nNo trades before news",
      allowedSessions: "London, New York",
      checklist: "News checked\nRisk calculated"
    });
    fireEvent.click(container.querySelector('input[name="allowedMarkets"][value="forex"]')!);
    fireEvent.click(container.querySelector('input[name="allowedMarkets"][value="stocks"]')!);
    fireEvent.click(screen.getByRole("button", { name: "Create strategy" }));

    await waitFor(() => expect(posted("POST /api/strategies")).toHaveLength(1));
    expect(posted("POST /api/strategies")[0].body).toMatchObject({
      allowedMarkets: ["forex", "stocks"],
      riskRules: ["Stop after two losses", "No trades before news"],
      allowedSessions: ["London", "New York"],
      checklist: ["News checked", "Risk calculated"]
    });
  });

  it("asks for a market instead of guessing one", async () => {
    serve({ ...strategyRoutes, "POST /api/strategies": { strategy: { id: "s3" } } });
    const { container } = render(<StrategyScreen locale="fa" messages={fa} />);
    await screen.findByRole("table");
    type(container, { name: "بازگشت", entryRules: "منتظر تأیید", exitRules: "خروج در میانه" });
    fireEvent.click(screen.getByRole("button", { name: "ساخت استراتژی" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(ARABIC_SCRIPT);
    expect(posted("POST /api/strategies")).toHaveLength(0);
  });

  it("shows the missing-market message under the markets, before the Create button, and moves focus to the first market", async () => {
    serve({ ...strategyRoutes, "POST /api/strategies": { strategy: { id: "s3" } } });
    const { container } = render(<StrategyScreen locale="en" messages={en} />);
    await screen.findByRole("table");
    type(container, { name: "Range fade", entryRules: "Wait for the sweep", exitRules: "Exit at the midpoint" });
    fireEvent.click(screen.getByRole("button", { name: "Create strategy" }));

    const alert = await screen.findByRole("alert");
    const form = container.querySelector("form")!;
    expect(alert.textContent).toBe("Choose at least one market.");
    expect(form.contains(alert)).toBe(true);
    const fieldset = container.querySelector("fieldset")!;
    expect(fieldset.nextElementSibling).toBe(alert);
    const submitButton = within(form).getByRole("button", { name: "Create strategy" });
    expect(alert.compareDocumentPosition(submitButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fieldset.getAttribute("aria-invalid")).toBe("true");
    expect(alert.id).not.toBe("");
    expect((fieldset.getAttribute("aria-describedby") ?? "").split(" ")).toContain(alert.id);
    expect(document.activeElement).toBe(container.querySelector('input[name="allowedMarkets"]'));
    expect(posted("POST /api/strategies")).toHaveLength(0);
  });

  it("clears the missing-market message as soon as a market is ticked", async () => {
    serve({ ...strategyRoutes, "POST /api/strategies": { strategy: { id: "s3" } } });
    const { container } = render(<StrategyScreen locale="en" messages={en} />);
    await screen.findByRole("table");
    type(container, { name: "Range fade", entryRules: "Wait for the sweep", exitRules: "Exit at the midpoint" });
    fireEvent.click(screen.getByRole("button", { name: "Create strategy" }));
    await screen.findByRole("alert");

    fireEvent.click(container.querySelector('input[name="allowedMarkets"][value="forex"]')!);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.querySelector("fieldset")!.getAttribute("aria-invalid")).toBeNull();
  });
});

describe("AlertsScreen in Persian", () => {
  const alerts = [
    { id: "a1", type: "price", status: "active", symbol: "BTCUSDT", message: "سطح قیمت دیده شد" },
    { id: "a2", type: "daily_review", status: "paused", symbol: null, message: "مرور پایان روز" },
    { id: "a3", type: "weekly_review", status: "triggered", symbol: null, message: "مرور پایان هفته" }
  ];

  it("has no English heading, column, type or status", async () => {
    serve({ "GET /api/alerts": { alerts } });
    const { container } = render(<AlertsScreen locale="fa" messages={fa} />);
    await screen.findByRole("table");
    expect(englishLeaks(container)).toEqual([]);
    expect(screen.getByRole("columnheader", { name: "نوع" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "پیام" })).toBeInTheDocument();
  });

  it("writes the triggered status with the half-space its sibling statuses use", async () => {
    serve({ "GET /api/alerts": { alerts } });
    render(<AlertsScreen locale="fa" messages={fa} />);
    await screen.findByRole("table");
    expect(screen.getByText("اعلام‌شده")).toBeInTheDocument();
  });

  it("has no English in the empty state", async () => {
    serve({ "GET /api/alerts": { alerts: [] } });
    const { container } = render(<AlertsScreen locale="fa" messages={fa} />);
    await screen.findByText("هنوز هشداری نیست");
    expect(englishLeaks(container)).toEqual([]);
  });

  it("shows a Persian line when the list cannot be loaded", async () => {
    failWith(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    const { container } = render(<AlertsScreen locale="fa" messages={fa} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(ARABIC_SCRIPT);
    expect(englishLeaks(container)).toEqual([]);
  });
});

describe("BacktestScreen in Persian", () => {
  it("has no English heading, column or market name", async () => {
    serve({
      "GET /api/backtests": {
        backtests: [{ id: "b1", name: "ماه اول", market: "forex", timeframe: "1h", result: { netPnl: 120, winRate: 0.5, maxDrawdown: 0.1 } }]
      }
    });
    const { container } = render(<BacktestScreen locale="fa" messages={fa} />);
    await screen.findByRole("table");
    expect(englishLeaks(container, ["1h"])).toEqual([]);
    expect(screen.getByRole("columnheader", { name: "نرخ برد" })).toBeInTheDocument();
    expect(screen.getAllByText("فارکس").length).toBeGreaterThan(0);
  });

  it("has no English in the empty state", async () => {
    serve({ "GET /api/backtests": { backtests: [] } });
    const { container } = render(<BacktestScreen locale="fa" messages={fa} />);
    await screen.findByText("هنوز سناریویی ثبت نشده");
    expect(englishLeaks(container, ["1h"])).toEqual([]);
  });

  it("shows a Persian line when the run is rejected", async () => {
    serve({
      "GET /api/backtests": { backtests: [] },
      "POST /api/backtests": () => {
        throw new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: { startingBalance: ["Too small"] } });
      }
    });
    const { container } = render(<BacktestScreen locale="fa" messages={fa} />);
    await screen.findByText("هنوز سناریویی ثبت نشده");
    type(container, { name: "ماه اول", timeframe: "1h", startingBalance: "0", entryPrice: "100", exitPrice: "110", quantity: "1" });
    fireEvent.click(screen.getByRole("button", { name: "ثبت سناریو" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(ARABIC_SCRIPT);
    expect(englishLeaks(alert)).toEqual([]);
  });
});

describe("PortfolioScreen in Persian", () => {
  const portfolio = {
    id: "p1",
    name: "حساب اصلی",
    cashBalance: 1000,
    baseCurrency: "USD",
    holdings: [{ id: "h1", quantity: 2, averageEntry: 100, realizedPnl: 12, asset: { symbol: "BTCUSDT" } }]
  };

  it("has no English heading, stat label or column", async () => {
    serve({ "GET /api/portfolios": { portfolios: [portfolio] } });
    const { container } = render(<PortfolioScreen locale="fa" messages={fa} />);
    await screen.findByRole("table");
    expect(englishLeaks(container)).toEqual([]);
    expect(screen.getByRole("columnheader", { name: "پورتفوی" })).toBeInTheDocument();
  });

  it("has no English in the empty state", async () => {
    serve({ "GET /api/portfolios": { portfolios: [] } });
    const { container } = render(<PortfolioScreen locale="fa" messages={fa} />);
    await screen.findByText("هنوز دارایی‌ای نیست");
    expect(englishLeaks(container)).toEqual([]);
  });

  it("has no English while loading", () => {
    (apiFetch as Mock).mockReturnValue(new Promise(() => undefined));
    const { container } = render(<PortfolioScreen locale="fa" messages={fa} />);
    expect(container.textContent).toMatch(ARABIC_SCRIPT);
    expect(englishLeaks(container)).toEqual([]);
  });

  it("has no English when the portfolio cannot be loaded", async () => {
    failWith(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    const { container } = render(<PortfolioScreen locale="fa" messages={fa} />);
    await waitFor(() => expect(container.textContent).toMatch(ARABIC_SCRIPT));
    expect(englishLeaks(container)).toEqual([]);
  });
});

describe("WatchlistsScreen in Persian", () => {
  it("has no English heading, column or market badge", async () => {
    serve({
      "GET /api/watchlists": {
        watchlists: [{ id: "w1", name: "زمینه کلان", items: [{ id: "i1", symbol: "EURUSD", market: "forex", notes: null }] }]
      }
    });
    const { container } = render(<WatchlistsScreen locale="fa" messages={fa} />);
    await screen.findByRole("table");
    expect(englishLeaks(container)).toEqual([]);
    expect(screen.getByRole("columnheader", { name: "فهرست" })).toBeInTheDocument();
    expect(screen.getAllByText("فارکس").length).toBeGreaterThan(0);
  });

  it("has no English in the empty state", async () => {
    serve({ "GET /api/watchlists": { watchlists: [] } });
    const { container } = render(<WatchlistsScreen locale="fa" messages={fa} />);
    await screen.findByText("هنوز فهرستی نیست");
    expect(englishLeaks(container)).toEqual([]);
  });

  it("shows a Persian line when the list cannot be loaded", async () => {
    failWith(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    const { container } = render(<WatchlistsScreen locale="fa" messages={fa} />);
    await waitFor(() => expect(container.querySelector('[class*="bg-destructive/10"]')).not.toBeNull());
    expect(englishLeaks(container)).toEqual([]);
  });
});

describe("LearningScreen in Persian", () => {
  const learning = {
    glossary: [{ term: "نرخ برد", definition: "درصد معاملات برنده.", example: "۶ برد از ۱۰ معامله.", level: "beginner", relatedTerms: [] }],
    templates: { journalPrompt: ["چه چیزی را طبق برنامه انجام دادم؟"], weeklyReview: ["کدام قانون را شکستم؟"] }
  };

  it("has no English heading, template title or disclaimer", async () => {
    serve({ "GET /api/learning/glossary?locale=fa": learning });
    const { container } = render(<LearningScreen locale="fa" messages={fa} />);
    await screen.findByText("نرخ برد");
    expect(englishLeaks(container)).toEqual([]);
  });

  it("describes the page as a study guide, not as 'learning support'", async () => {
    serve({ "GET /api/learning/glossary?locale=fa": learning });
    render(<LearningScreen locale="fa" messages={fa} />);
    await screen.findByText("نرخ برد");
    expect(screen.getByText("راهنمای آموزشی سطح مبتدی و متوسط برای شاخص‌ها، ژورنال‌نویسی، چک‌لیست استراتژی، خطاها و انضباط ریسک.")).toBeInTheDocument();
  });

  it("tells the visitor to sign in instead of showing an empty page", async () => {
    failWith(new ApiClientError("Authentication is required", 401, "UNAUTHORIZED"));
    const { container } = render(<LearningScreen locale="fa" messages={fa} />);
    expect(await screen.findByText("ورود لازم است")).toBeInTheDocument();
    expect(englishLeaks(container)).toEqual([]);
  });

  it("shows a Persian line when the glossary cannot be loaded", async () => {
    failWith(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    const { container } = render(<LearningScreen locale="fa" messages={fa} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(ARABIC_SCRIPT);
    expect(englishLeaks(container)).toEqual([]);
  });
});
