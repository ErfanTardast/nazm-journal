import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

// The onboarding screen opens its next page with the app router, which a bare render does not have.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { AiAssistantScreen } from "@/features/ai/ai-assistant-screen";
import { AlertsScreen } from "@/features/alerts/alerts-screen";
import { BacktestScreen } from "@/features/backtesting/backtest-screen";
import { IdeasScreen } from "@/features/ideas/ideas-screen";
import { JournalScreen } from "@/features/journal/journal-screen";
import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";
import { PortfolioScreen } from "@/features/portfolio/portfolio-screen";
import { StrategyScreen } from "@/features/strategy/strategy-screen";
import { TradePlansScreen } from "@/features/trade-plans/trade-plans-screen";
import { WatchlistsScreen } from "@/features/watchlists/watchlists-screen";

const en = getMessages("en");
const fa = getMessages("fa");

/*
 * A signed-out visitor, or a session that expired mid-use, gets a 401 from the API. The screens must answer with
 * the sign-in state, not the raw English "Authentication is required" above a form that cannot work, an error
 * card, or an empty table.
 */

const unauthorized = () => {
  throw new ApiClientError("Authentication is required", 401, "UNAUTHORIZED");
};

const firstRunState = { state: { tradingPlatform: null, primaryGoal: null, onboardedAt: null, hasTrades: false, hasStrategy: false, hasPlan: false } };

function serve(routes: Record<string, unknown | (() => unknown)>) {
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    if (!(key in routes)) throw new Error(`Unexpected request ${key}`);
    const handler = routes[key];
    return typeof handler === "function" ? await (handler as () => unknown)() : handler;
  });
}

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

async function expectSignInState(locale: "en" | "fa" = "en") {
  await waitFor(() => expect(document.querySelector(`a[href="/${locale}/login"]`)).not.toBeNull());
  expect(document.body.textContent).not.toContain("Authentication is required");
}

function type(form: HTMLFormElement, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    fireEvent.change(form.elements.namedItem(name) as HTMLInputElement, { target: { value } });
  }
}

const formOf = (button: HTMLElement) => button.closest("form") as HTMLFormElement;

const journalRoutes = {
  "GET /api/trades": { trades: [] },
  "GET /api/trades/metrics": {
    metrics: { totalTrades: 0, winRate: 0, netPnl: 0, profitFactor: 0, expectancy: 0, averageR: 0, maxDrawdownAmount: 0, equityCurve: [] }
  },
  "GET /api/strategies": { strategies: [] },
  "GET /api/ideas": { ideas: [] },
  "GET /api/reviews": { reviews: [] },
  "GET /api/news?locale=en": { news: [] }
};

describe("screens that had no sign-in state", () => {
  it("strategies: loading while signed out", async () => {
    serve({
      "GET /api/strategies": unauthorized,
      "GET /api/playbooks/adherence": unauthorized,
      "GET /api/mentor-report?hidePnl=true&locale=en": unauthorized
    });
    render(<StrategyScreen locale="en" messages={en} />);
    await expectSignInState();
    expect(screen.queryByRole("button", { name: "Create strategy" })).toBeNull();
  });

  it("strategies: saving after the session expired", async () => {
    serve({
      "GET /api/strategies": { strategies: [] },
      "GET /api/playbooks/adherence": { playbooks: [] },
      "GET /api/mentor-report?hidePnl=true&locale=en": { available: false, report: null },
      "POST /api/strategies": unauthorized
    });
    render(<StrategyScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Create strategy" });
    type(formOf(button), { name: "Range fade", entryRules: "Wait for the sweep", exitRules: "Exit at the midpoint" });
    fireEvent.click(formOf(button).querySelector('input[name="allowedMarkets"][value="crypto"]')!);
    fireEvent.click(button);
    await expectSignInState();
  });

  it("alerts: loading while signed out", async () => {
    serve({ "GET /api/alerts": unauthorized });
    render(<AlertsScreen locale="en" messages={en} />);
    await expectSignInState();
    expect(screen.queryByRole("button", { name: "Create alert" })).toBeNull();
  });

  it("alerts: saving after the session expired", async () => {
    serve({ "GET /api/alerts": { alerts: [] }, "POST /api/alerts": unauthorized });
    render(<AlertsScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Create alert" });
    type(formOf(button), { symbol: "ETHUSDT", price: "3000", message: "Review level reached." });
    fireEvent.click(button);
    await expectSignInState();
  });

  it("portfolio: loading while signed out", async () => {
    serve({ "GET /api/portfolios": unauthorized });
    render(<PortfolioScreen locale="en" messages={en} />);
    await expectSignInState();
    expect(document.body.textContent).not.toContain("Portfolio unavailable");
  });

  it("portfolio: saving after the session expired", async () => {
    serve({ "GET /api/portfolios": { portfolios: [] }, "POST /api/portfolios": unauthorized });
    render(<PortfolioScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Create" });
    type(formOf(button), { name: "Main account" });
    fireEvent.click(button);
    await expectSignInState();
  });

  it("backtests: loading while signed out is not an empty table", async () => {
    serve({ "GET /api/backtests": unauthorized });
    render(<BacktestScreen locale="en" messages={en} />);
    await expectSignInState();
    expect(screen.queryByRole("button", { name: "Save scenario" })).toBeNull();
  });

  it("backtests: saving after the session expired", async () => {
    serve({ "GET /api/backtests": { backtests: [] }, "POST /api/backtests": unauthorized });
    render(<BacktestScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Save scenario" });
    type(formOf(button), { name: "Manual run", timeframe: "1h", startingBalance: "25000", entryPrice: "100", exitPrice: "110", quantity: "10" });
    fireEvent.click(button);
    await expectSignInState();
  });

  it("onboarding: opening the page while signed out", async () => {
    serve({ "GET /api/onboarding/state": firstRunState, "GET /api/onboarding/sprint": unauthorized });
    render(<OnboardingScreen locale="en" messages={en} />);
    await expectSignInState();
  });

  it("onboarding: building the plan after the session expired", async () => {
    serve({ "GET /api/onboarding/state": firstRunState, "GET /api/onboarding/sprint": { profile: null }, "GET /api/onboarding/plan?experience=beginner&market=crypto&disciplineIssue=no_plan&language=en": unauthorized });
    render(<OnboardingScreen locale="en" messages={en} />);
    fireEvent.click(await screen.findByRole("button", { name: en.onboarding.build }));
    await expectSignInState();
  });

  it("ai: running a workflow after the session expired", async () => {
    serve({ "POST /api/ai/journal-insights": unauthorized });
    render(<AiAssistantScreen locale="en" messages={en} />);
    fireEvent.click(screen.getByRole("button", { name: "Journal reviewer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Run workflow" }));
    await expectSignInState();
  });

  it("ai: reviewing a trade after the session expired", async () => {
    serve({ "POST /api/ai/review-trade": unauthorized });
    render(<AiAssistantScreen locale="en" messages={en} />);
    const button = screen.getByRole("button", { name: "Review journal trade" });
    type(formOf(button), { symbol: "ETHUSDT", entryPrice: "3000" });
    fireEvent.click(button);
    await expectSignInState();
  });

  it("journal: saving after the session expired", async () => {
    serve({ ...journalRoutes, "POST /api/trades": unauthorized });
    render(<JournalScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Create trade" });
    type(formOf(button), { symbol: "ETHUSDT", entryPrice: "3000", quantity: "1", openedAt: "2026-09-29T10:30" });
    fireEvent.click(button);
    await expectSignInState();
  });

  it("journal: quick save after the session expired", async () => {
    serve({ ...journalRoutes, "POST /api/trades": unauthorized });
    render(<JournalScreen locale="en" messages={en} />);
    const button = await screen.findByRole("button", { name: "Quick save" });
    type(formOf(button), { symbol: "ETHUSDT", entryPrice: "3000" });
    fireEvent.click(button);
    await expectSignInState();
  });
});

describe("screens that already had one keep it", () => {
  it("journal, plans, ideas and watchlists when loading while signed out", async () => {
    serve({ ...journalRoutes, "GET /api/trades": unauthorized });
    const journal = render(<JournalScreen locale="en" messages={en} />);
    await expectSignInState();
    journal.unmount();

    serve({ "GET /api/trade-plans": unauthorized });
    const plans = render(<TradePlansScreen locale="en" messages={en} />);
    await expectSignInState();
    plans.unmount();

    serve({ "GET /api/ideas": unauthorized });
    const ideas = render(<IdeasScreen locale="en" messages={en} />);
    await expectSignInState();
    ideas.unmount();

    serve({ "GET /api/watchlists": unauthorized });
    render(<WatchlistsScreen locale="en" messages={en} />);
    await expectSignInState();
  });

  it("plans, ideas and watchlists when saving after the session expired", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [] }, "POST /api/trade-plans": unauthorized });
    const plans = render(<TradePlansScreen locale="en" messages={en} />);
    const save = await screen.findByRole("button", { name: "Save plan" });
    type(formOf(save), { symbol: "ETHUSDT", direction: "long", bias: "Constructive", entryZone: "3000" });
    fireEvent.click(save);
    await expectSignInState();
    plans.unmount();

    serve({ "GET /api/ideas": { ideas: [] }, "POST /api/ideas": unauthorized });
    const ideas = render(<IdeasScreen locale="en" messages={en} />);
    const capture = await screen.findByRole("button", { name: "Capture idea" });
    type(formOf(capture), { title: "Range retest", thesis: "Review whether the retest held." });
    fireEvent.click(capture);
    await expectSignInState();
    ideas.unmount();

    serve({ "GET /api/watchlists": { watchlists: [] }, "POST /api/watchlists": unauthorized });
    render(<WatchlistsScreen locale="en" messages={en} />);
    const saveList = await screen.findByRole("button", { name: "Save watchlist" });
    type(formOf(saveList), { name: "Macro context", symbol: "EURUSD" });
    fireEvent.click(saveList);
    await expectSignInState();
  });

  it("sends the Persian page to the Persian sign-in", async () => {
    serve({ "GET /api/alerts": unauthorized });
    render(<AlertsScreen locale="fa" messages={fa} />);
    await expectSignInState("fa");
  });
});
