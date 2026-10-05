import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { englishLeaks } from "./support/english-leaks";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { AlertsScreen } from "@/features/alerts/alerts-screen";
import { BacktestScreen } from "@/features/backtesting/backtest-screen";
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
