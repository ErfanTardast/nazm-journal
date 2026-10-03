import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { englishLeaks } from "./support/english-leaks";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { AlertsScreen } from "@/features/alerts/alerts-screen";
import { BacktestScreen } from "@/features/backtesting/backtest-screen";
import { DashboardScreen } from "@/features/dashboard/dashboard-screen";
import { PerformanceScreen } from "@/features/performance/performance-screen";
import { PortfolioScreen } from "@/features/portfolio/portfolio-screen";
import { StrategyScreen } from "@/features/strategy/strategy-screen";
import { WatchlistsScreen } from "@/features/watchlists/watchlists-screen";

const messages = { en: getMessages("en"), fa: getMessages("fa") };

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

/** Answers by path (the query string is ignored), so a screen can ask in its own language. */
function serve(routes: Record<string, unknown>) {
  (apiFetch as Mock).mockImplementation(async (path: string) => {
    const key = path.split("?")[0];
    if (!(key in routes)) throw new Error(`Unexpected request ${path}`);
    return routes[key];
  });
}

const locales = ["en", "fa"] as const;

/*
 * Product audit item 11: a page with nothing on it says in one sentence what it is for, and points to the next step
 * (a link, or the form on the same page).
 */

describe("Performance with no closed trades", () => {
  const empty = {
    totalTrades: 0, wins: 0, losses: 0, winRate: 0, grossProfit: 0, grossLoss: 0, netPnl: 0, averageR: 0, profitFactor: 0, expectancy: 0,
    maxDrawdownAmount: 0, maxDrawdownR: 0, equityCurve: []
  };
  const copy = {
    en: {
      title: "Not enough data yet",
      description: "After you import trades, your win rate, expectancy, drawdown and strategy results appear here.",
      actions: ["Import MT5 trades", "Log a trade in the journal"]
    },
    fa: {
      title: "هنوز داده کافی نیست",
      description: "بعد از ورود معاملات، نرخ برد، امید ریاضی، افت سرمایه و عملکرد استراتژی‌های شما اینجا نمایش داده می‌شود.",
      actions: ["ورود معاملات MT5", "ثبت معامله در ژورنال"]
    }
  } as const;

  it.each(locales)("explains what will appear and links to the import and the journal (%s)", async (locale) => {
    serve({ "/api/trades": { trades: [] }, "/api/trades/metrics": { metrics: empty } });
    const { container } = render(<PerformanceScreen locale={locale} messages={messages[locale]} />);
    expect(await screen.findByText(copy[locale].title)).toBeInTheDocument();
    expect(screen.getByText(copy[locale].description)).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([...copy[locale].actions]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([`/${locale}/import`, `/${locale}/journal`]);
    expect(links[0].className).toContain("bg-primary");
    if (locale === "fa") expect(englishLeaks(container)).toEqual([]);
  });
});

describe("Dashboard for an account with no trades and no plans", () => {
  const overview = (extra: Record<string, unknown> = {}) => ({
    metrics: { totalTrades: 0, winRate: 0 },
    openTrades: 0,
    plannedTrades: [],
    repeatedMistakes: [],
    ruleViolations: 0,
    journalFollowUps: 0,
    completePlanCount: 0,
    riskDefaults: { riskPerTradePct: 1, maxDailyLossPct: 3, maxWeeklyLossPct: 6, valid: true },
    readiness: {
      status: "not_ready",
      score: 20,
      primaryAction: "plan",
      checks: ["plan", "risk", "review", "rules", "journal"].map((key) => ({ key, passed: false, count: 0 }))
    },
    reviewFocus: { review: null, overdueCount: 0, suggestedType: "daily" },
    activeSession: null,
    ...extra
  });
  const discipline = { disciplineScore: null, propGuard: { alerts: [], isBlocked: false, todayLossPct: 0, maxDailyLossPct: 3 }, mistakePatterns: [] };
  const streak = { currentStreak: 0, bestStreak: 0, totalActiveDays: 0, totalDisciplinedDays: 0, lastActiveDate: null, brokeStreakOnLastDay: false, unreviewedDays: 0 };
  const routes = (data: unknown) => ({ "/api/dashboard/overview": data, "/api/discipline": discipline, "/api/discipline/streak": streak });

  // The overview cannot tell "never had a plan" from "all plans closed", so the sentence only claims what it can see.
  const copy = {
    en: {
      sentence: "No trades logged and no active plan yet. Write a plan, or import the trades you already took.",
      plan: "Write a plan",
      importTrades: "Import trades",
      plainLine: /No active plan is ready/
    },
    fa: {
      sentence: "هنوز معامله‌ای ثبت نشده و پلن فعالی ندارید. یک پلن بنویسید یا معامله‌هایی را که قبلاً انجام داده‌اید وارد کنید.",
      plan: "نوشتن پلن",
      importTrades: "ورود معاملات",
      plainLine: /پلن فعالی آماده نیست/
    }
  } as const;

  it.each(locales)("shows one clear first step with links to write the first plan and to import trades (%s)", async (locale) => {
    serve(routes(overview()));
    const { container } = render(<DashboardScreen locale={locale} messages={messages[locale]} />);
    const sentence = await screen.findByText(copy[locale].sentence);
    const panel = sentence.parentElement as HTMLElement;
    expect(within(panel).getByRole("link", { name: copy[locale].plan }).getAttribute("href")).toBe(`/${locale}/plans`);
    expect(within(panel).getByRole("link", { name: copy[locale].importTrades }).getAttribute("href")).toBe(`/${locale}/import`);
    // It reuses the existing "no plan" slot: there is no second getting-started block.
    expect(screen.getAllByText(copy[locale].sentence)).toHaveLength(1);
    if (locale === "fa") expect(englishLeaks(container)).toEqual([]);
  });

  it.each(locales)("does not offer the import to an account that already has trades (%s)", async (locale) => {
    serve(routes(overview({ metrics: { totalTrades: 5, winRate: 0.4 } })));
    render(<DashboardScreen locale={locale} messages={messages[locale]} />);
    await screen.findByText(copy[locale].plainLine);
    expect(screen.queryByText(copy[locale].sentence)).toBeNull();
    expect(screen.queryByRole("link", { name: copy[locale].importTrades })).toBeNull();
    // Still one step: write a plan.
    expect(screen.getByRole("link", { name: copy[locale].plan }).getAttribute("href")).toBe(`/${locale}/plans`);
  });

  it.each(locales)("does not say there are no trades when one is still open (%s)", async (locale) => {
    // `totalTrades` counts closed trades only; the first trade is open and nothing is planned.
    serve(routes(overview({ openTrades: 1 })));
    render(<DashboardScreen locale={locale} messages={messages[locale]} />);
    await screen.findByText(copy[locale].plainLine);
    expect(screen.queryByText(copy[locale].sentence)).toBeNull();
    expect(screen.queryByRole("link", { name: copy[locale].importTrades })).toBeNull();
    expect(screen.getByRole("link", { name: copy[locale].plan }).getAttribute("href")).toBe(`/${locale}/plans`);
  });

  it.each(locales)("shows no first-step links once there is a plan (%s)", async (locale) => {
    const plan = { id: "p1", symbol: "EURUSD", market: "forex", bias: "x", status: "planned", invalidationRule: "y", riskPercent: 1 };
    serve(routes(overview({ plannedTrades: [plan], completePlanCount: 1 })));
    render(<DashboardScreen locale={locale} messages={messages[locale]} />);
    await screen.findByText("EURUSD");
    expect(screen.queryByRole("link", { name: copy[locale].plan })).toBeNull();
    expect(screen.queryByRole("link", { name: copy[locale].importTrades })).toBeNull();
  });
});

describe("Strategy page with no strategies", () => {
  const copy = {
    en: {
      title: "No strategies yet",
      description: "A strategy keeps the entry, exit and invalidation rules you follow in one place. Create your first one with the form above."
    },
    fa: {
      title: "هنوز استراتژی‌ای نیست",
      description: "استراتژی جایی است که قوانین ورود، خروج و ابطال را یک‌جا نگه می‌دارید. اولین استراتژی را با فرم بالا بسازید."
    }
  } as const;

  it.each(locales)("says what a strategy is for and points to the form (%s)", async (locale) => {
    serve({ "/api/strategies": { strategies: [] }, "/api/playbooks/adherence": { playbooks: [] }, "/api/mentor-report": { available: false, report: null } });
    const { container } = render(<StrategyScreen locale={locale} messages={messages[locale]} />);
    expect(await screen.findByText(copy[locale].title)).toBeInTheDocument();
    expect(screen.getByText(copy[locale].description)).toBeInTheDocument();
    if (locale === "fa") expect(englishLeaks(container)).toEqual([]);
  });
});

describe("Alerts page with no alerts", () => {
  const copy = {
    en: {
      title: "No alerts yet",
      description: "An alert reminds you of a price level, a risk limit or your daily review. Create your first one with the form above."
    },
    fa: {
      title: "هنوز هشداری نیست",
      description: "هر هشدار یک سطح قیمت، حد ریسک یا مرور روزانه را به شما یادآوری می‌کند. اولین هشدار را با فرم بالا بسازید."
    }
  } as const;

  it.each(locales)("says what an alert is for and points to the form (%s)", async (locale) => {
    serve({ "/api/alerts": { alerts: [] } });
    const { container } = render(<AlertsScreen locale={locale} messages={messages[locale]} />);
    expect(await screen.findByText(copy[locale].title)).toBeInTheDocument();
    expect(screen.getByText(copy[locale].description)).toBeInTheDocument();
    if (locale === "fa") expect(englishLeaks(container)).toEqual([]);
  });
});

describe("Watchlists page with no lists", () => {
  const copy = {
    en: {
      title: "No watchlists yet",
      description: "A watchlist keeps the symbols you follow, with a context note for each. Create your first one with the New watchlist form."
    },
    fa: {
      title: "هنوز فهرستی نیست",
      description: "در فهرست نمادها، نمادهایی را که دنبال می‌کنید همراه با یادداشت زمینه هرکدام نگه می‌دارید. اولین فهرست را با فرم «فهرست جدید» بسازید."
    }
  } as const;

  it.each(locales)("says what a watchlist is for and points to the form (%s)", async (locale) => {
    serve({ "/api/watchlists": { watchlists: [] } });
    const { container } = render(<WatchlistsScreen locale={locale} messages={messages[locale]} />);
    expect(await screen.findByText(copy[locale].title)).toBeInTheDocument();
    expect(screen.getByText(copy[locale].description)).toBeInTheDocument();
    if (locale === "fa") expect(englishLeaks(container)).toEqual([]);
  });

  it("names a form that exists on the page", async () => {
    serve({ "/api/watchlists": { watchlists: [] } });
    render(<WatchlistsScreen locale="fa" messages={messages.fa} />);
    await screen.findByText(copy.fa.title);
    expect(screen.getByText("فهرست جدید")).toBeInTheDocument();
  });
});

describe("Portfolio page with nothing in it", () => {
  const copy = {
    en: {
      title: "No holdings yet",
      description: "Holdings appear here once you add a transaction to a portfolio. Create a portfolio with the form above, then add your first transaction."
    },
    fa: {
      title: "هنوز دارایی‌ای نیست",
      description: "دارایی‌ها بعد از ثبت اولین تراکنش در یک پورتفوی اینجا نمایش داده می‌شوند. ابتدا با فرم بالا پورتفوی بسازید، بعد اولین تراکنش را اضافه کنید."
    }
  } as const;

  it.each(locales)("says what will appear and what to do first (%s)", async (locale) => {
    serve({ "/api/portfolios": { portfolios: [] } });
    const { container } = render(<PortfolioScreen locale={locale} messages={messages[locale]} />);
    expect(await screen.findByText(copy[locale].title)).toBeInTheDocument();
    expect(screen.getByText(copy[locale].description)).toBeInTheDocument();
    if (locale === "fa") expect(englishLeaks(container)).toEqual([]);
  });
});

/*
 * A list that is still loading, or could not be loaded, must not say the trader has none: the empty state is shown only
 * after a successful load that returned nothing.
 */
describe("Lists that are loading or failed to load", () => {
  const screens = [
    { name: "alerts", path: "/api/alerts", render: (locale: "en" | "fa") => <AlertsScreen locale={locale} messages={messages[locale]} />, empty: { en: "No alerts yet", fa: "هنوز هشداری نیست" }, others: {} },
    {
      name: "strategies",
      path: "/api/strategies",
      render: (locale: "en" | "fa") => <StrategyScreen locale={locale} messages={messages[locale]} />,
      empty: { en: "No strategies yet", fa: "هنوز استراتژی‌ای نیست" },
      others: { "/api/playbooks/adherence": { playbooks: [] }, "/api/mentor-report": { available: false, report: null } }
    },
    { name: "watchlists", path: "/api/watchlists", render: (locale: "en" | "fa") => <WatchlistsScreen locale={locale} messages={messages[locale]} />, empty: { en: "No watchlists yet", fa: "هنوز فهرستی نیست" }, others: {} },
    { name: "scenarios", path: "/api/backtests", render: (locale: "en" | "fa") => <BacktestScreen locale={locale} messages={messages[locale]} />, empty: { en: "No scenarios saved yet", fa: "هنوز سناریویی ثبت نشده" }, others: {} }
  ];
  const cases = screens.flatMap((screenCase) => locales.map((locale) => ({ ...screenCase, locale, label: `${screenCase.name} (${locale})` })));

  function answer(path: string, others: Record<string, unknown>, listing: () => Promise<unknown>) {
    (apiFetch as Mock).mockImplementation(async (requested: string) => {
      const key = requested.split("?")[0];
      if (key === path) return listing();
      if (key in others) return others[key];
      throw new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
    });
  }

  it.each(cases)("shows the load error, not 'none yet', when the load fails: $label", async ({ path, others, render: show, empty, locale }) => {
    answer(path, others, async () => {
      throw new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
    });
    render(show(locale));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(empty[locale])).toBeNull();
  });

  it.each(cases)("shows a loading line, not 'none yet', while the list is loading: $label", async ({ path, others, render: show, empty, locale }) => {
    answer(path, others, () => new Promise(() => {}));
    render(show(locale));
    expect(await screen.findByText(locale === "en" ? "Loading" : "در حال بارگذاری")).toBeInTheDocument();
    expect(screen.queryByText(empty[locale])).toBeNull();
  });

  it.each(cases)("still shows 'none yet' once the load worked and returned nothing: $label", async ({ path, others, render: show, empty, locale }) => {
    const bodies: Record<string, unknown> = { "/api/alerts": { alerts: [] }, "/api/strategies": { strategies: [] }, "/api/watchlists": { watchlists: [] }, "/api/backtests": { backtests: [] } };
    answer(path, others, async () => bodies[path]);
    render(show(locale));
    expect(await screen.findByText(empty[locale])).toBeInTheDocument();
    expect(screen.queryByText(locale === "en" ? "Loading" : "در حال بارگذاری")).toBeNull();
  });
});
