import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { englishLeaks } from "./support/english-leaks";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { GrowthScreen } from "@/features/growth/growth-screen";
import { NewsScreen } from "@/features/news/news-screen";
import { PerformanceScreen } from "@/features/performance/performance-screen";

const en = getMessages("en");
const fa = getMessages("fa");
const ARABIC_SCRIPT = /[؀-ۿ]/;

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

function serve(routes: Record<string, unknown | ((init?: RequestInit) => unknown)>) {
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    if (!(key in routes)) throw new Error(`Unexpected request ${key}`);
    const handler = routes[key];
    return typeof handler === "function" ? handler(init) : handler;
  });
}

function failWith(error: unknown) {
  (apiFetch as Mock).mockRejectedValue(error);
}

/*
 * News, Performance and Growth on the Persian page: no English heading, stat label, column, filter, badge, milestone,
 * generated sentence or error line. The server's own content is fed in as it really arrives.
 */

describe("NewsScreen in Persian", () => {
  const news = [
    {
      id: "n1",
      title: "اظهارنظر بانک مرکزی می‌تواند نوسان جفت‌ارزها را افزایش دهد",
      source: "نمونه آموزشی اپ نظم",
      language: "fa",
      market: "forex",
      category: "central_bank",
      importance: "high",
      sentiment: "احتیاط",
      summary: "زمان رویداد و میزان ریسک را بررسی کنید.",
      riskNotes: ["تقویم اقتصادی را بررسی کنید"]
    },
    {
      id: "n2",
      title: "تیتر مقررات کریپتو",
      source: "منبع محلی",
      language: "fa",
      market: "crypto",
      category: "crypto_regulation",
      importance: "medium",
      sentiment: "mixed",
      summary: "خلاصه خبر.",
      riskNotes: []
    }
  ];
  // What POST /api/news/analyze answers today: the disclaimer and the enum values are English.
  const analysis = {
    whatHappened: "زمان رویداد و میزان ریسک را بررسی کنید.",
    affectedMarket: "forex",
    category: "central_bank",
    impactLevel: "high",
    cautionNotes: ["بازار forex ممکن است نوسان بیشتری داشته باشد.", "این تحلیل فقط برای آگاهی و مرور ریسک است."],
    reviewChecklist: ["تقویم و اخبار را بررسی کنید"],
    disclaimer: "This context analysis is educational. It does not predict direction, provide financial advice, or create market certainty."
  };

  it("has no English heading, filter, column, market, importance or category", async () => {
    serve({ "GET /api/news?locale=fa": { news } });
    const { container } = render(<NewsScreen locale="fa" messages={fa} />);
    await screen.findByRole("table");
    expect(englishLeaks(container)).toEqual([]);
    expect(screen.getByRole("columnheader", { name: "عنوان" })).toBeInTheDocument();
    expect(screen.getByLabelText("فیلتر بازار")).toBeInTheDocument();
  });

  it("describes the queue and the analysis without developer wording or a word that reads as certainty", async () => {
    serve({ "GET /api/news?locale=fa": { news } });
    const { container } = render(<NewsScreen locale="fa" messages={fa} />);
    await screen.findByRole("table");
    // "قطعیت" (certainty) is a word the page uses on purpose, to say it gives none; "قطعی" alone read as "definitive".
    expect(container.textContent).not.toMatch(/قطعی(?!ت)/);
    expect(container.textContent).not.toContain("بذری");
    expect(screen.getByText("مورد را بخوانید و تحلیل زمینه را اجرا کنید.")).toBeInTheDocument();
  });

  it("has no English after running the analysis", async () => {
    serve({ "GET /api/news?locale=fa": { news }, "POST /api/news/analyze": { analysis } });
    const { container } = render(<NewsScreen locale="fa" messages={fa} />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "تحلیل زمینه" }));
    await screen.findByText("بانک مرکزی", { selector: "p" });
    expect(englishLeaks(container)).toEqual([]);
    expect(container.textContent).not.toMatch(/forex/);
  });

  it("has no English when there are no items", async () => {
    serve({ "GET /api/news?locale=fa": { news: [] } });
    const { container } = render(<NewsScreen locale="fa" messages={fa} />);
    await screen.findByText(fa.common.emptyTitle);
    expect(englishLeaks(container)).toEqual([]);
  });

  it("has no English while loading", () => {
    (apiFetch as Mock).mockReturnValue(new Promise(() => undefined));
    const { container } = render(<NewsScreen locale="fa" messages={fa} />);
    expect(container.textContent).toMatch(ARABIC_SCRIPT);
    expect(englishLeaks(container)).toEqual([]);
  });

  it("has no English when the context cannot be loaded", async () => {
    failWith(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    const { container } = render(<NewsScreen locale="fa" messages={fa} />);
    await waitFor(() => expect(container.textContent).toMatch(ARABIC_SCRIPT));
    expect(englishLeaks(container)).toEqual([]);
  });

  it("has no English when the analysis fails", async () => {
    serve({
      "GET /api/news?locale=fa": { news },
      "POST /api/news/analyze": () => {
        throw new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
      }
    });
    const { container } = render(<NewsScreen locale="fa" messages={fa} />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "تحلیل زمینه" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(ARABIC_SCRIPT);
    expect(englishLeaks(container)).toEqual([]);
  });

  it("asks a signed-out visitor to sign in when the analysis needs an account", async () => {
    serve({
      "GET /api/news?locale=fa": { news },
      "POST /api/news/analyze": () => {
        throw new ApiClientError("Authentication is required", 401, "UNAUTHORIZED");
      }
    });
    render(<NewsScreen locale="fa" messages={fa} />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "تحلیل زمینه" }));
    expect(await screen.findByText("ورود لازم است")).toBeInTheDocument();
  });

  it("keeps the English labels on the English page", async () => {
    serve({ "GET /api/news?locale=en": { news: [{ ...news[0], title: "Central bank remarks", language: "en", sentiment: "caution", summary: "Check the calendar.", riskNotes: [] }] } });
    render(<NewsScreen locale="en" messages={en} />);
    await screen.findByRole("table");
    expect(screen.getByRole("columnheader", { name: "Importance" })).toBeInTheDocument();
    expect(screen.getByLabelText("Market filter")).toBeInTheDocument();
    expect(screen.getAllByText("High").length).toBeGreaterThan(0);
  });
});

describe("PerformanceScreen in Persian", () => {
  const metrics = {
    totalTrades: 3,
    wins: 2,
    losses: 1,
    winRate: 2 / 3,
    grossProfit: 300,
    grossLoss: 100,
    netPnl: 200,
    averageR: 0.8,
    profitFactor: 3,
    expectancy: 66.7,
    maxDrawdownAmount: 100,
    maxDrawdownR: 1,
    equityCurve: [100, 250, 200],
    setups: { count: 3, combined: 1, pendingLegs: 0, wins: 2, losses: 1, winRate: 2 / 3, averageR: 0.8, expectancy: 66.7 }
  };
  // No strategy, setup, session or emotion on these trades: the "unspecified" group must not be English.
  const trades = [
    { symbol: "EURUSD", market: "forex", side: "long", realizedPnl: 200, rMultiple: 2 },
    { symbol: "BTCUSDT", market: "crypto", side: "short", realizedPnl: 100, rMultiple: 1 },
    { symbol: "EURUSD", market: "forex", side: "long", realizedPnl: -100, rMultiple: -1 }
  ];

  it("has no English in the report, including the unspecified groups and market names", async () => {
    serve({ "GET /api/trades": { trades }, "GET /api/trades/metrics": { metrics } });
    const { container } = render(<PerformanceScreen locale="fa" messages={fa} />);
    await screen.findAllByText("منحنی سرمایه");
    expect(englishLeaks(container)).toEqual([]);
    expect(screen.getAllByText("فارکس").length).toBeGreaterThan(0);
  });

  it("describes the equity curve for screen readers in Persian", async () => {
    serve({ "GET /api/trades": { trades }, "GET /api/trades/metrics": { metrics } });
    const { container } = render(<PerformanceScreen locale="fa" messages={fa} />);
    await screen.findAllByText("منحنی سرمایه");
    const description = container.querySelector("svg desc")?.textContent ?? "";
    expect(description).toMatch(ARABIC_SCRIPT);
    expect(description).not.toMatch(/closed journal results/);
  });

  it("has no English when the report cannot be loaded", async () => {
    failWith(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    const { container } = render(<PerformanceScreen locale="fa" messages={fa} />);
    await waitFor(() => expect(container.textContent).toMatch(ARABIC_SCRIPT));
    expect(englishLeaks(container)).toEqual([]);
  });

  it("keeps the English group name on the English page", async () => {
    serve({ "GET /api/trades": { trades }, "GET /api/trades/metrics": { metrics } });
    render(<PerformanceScreen locale="en" messages={en} />);
    expect((await screen.findAllByText("Unspecified")).length).toBeGreaterThan(0);
  });
});

describe("GrowthScreen in Persian", () => {
  const metrics = { totalTrades: 12, winRate: 0.5, netPnl: 340, averageR: 0.6, expectancy: 28, maxDrawdownAmount: 90, equityCurve: [0, 120, 340] };
  const trades = [
    { id: "t1", symbol: "EURUSD", market: "forex", realizedPnl: 100, rMultiple: 1, ruleFollowed: "followed", openedAt: "2026-09-01T10:00:00Z", journalEntry: { mistakes: ["ورود زودهنگام"] } },
    { id: "t2", symbol: "EURUSD", market: "forex", realizedPnl: -50, rMultiple: -1, ruleFollowed: "broken", openedAt: "2026-09-02T10:00:00Z", journalEntry: { mistakes: ["ورود زودهنگام"] } }
  ];
  const reviews = [
    { id: "r1", status: "completed", type: "weekly", title: "مرور هفتگی", periodStart: "2026-09-01T00:00:00Z" },
    { id: "r2", status: "open", type: "daily", title: "مرور روزانه", periodStart: "2026-09-02T00:00:00Z" }
  ];
  const strategies = [{ id: "s1", name: "بازگشت به میانه", checklist: [], commonMistakes: [] }];
  const routes = {
    "GET /api/trades": { trades },
    "GET /api/trades/metrics": { metrics },
    "GET /api/reviews": { reviews },
    "GET /api/strategies": { strategies }
  };

  it("has no English stat, milestone, generated sentence or panel title", async () => {
    serve(routes);
    const { container } = render(<GrowthScreen locale="fa" messages={fa} />);
    await screen.findByRole("heading", { level: 1 });
    expect(englishLeaks(container)).toEqual([]);
    expect(container.textContent).toContain("ورود زودهنگام");
  });

  it("has no English for a brand-new account with nothing recorded", async () => {
    serve({
      "GET /api/trades": { trades: [] },
      "GET /api/trades/metrics": { metrics: { ...metrics, totalTrades: 0, netPnl: 0, averageR: 0, equityCurve: [] } },
      "GET /api/reviews": { reviews: [] },
      "GET /api/strategies": { strategies: [] }
    });
    const { container } = render(<GrowthScreen locale="fa" messages={fa} />);
    await screen.findByRole("heading", { level: 1 });
    expect(englishLeaks(container)).toEqual([]);
    // The "repeated mistake pressure" card reads as a short answer, not a broken fragment.
    expect(screen.getByText("ندارد")).toBeInTheDocument();
    expect(screen.queryByText("هیچ")).toBeNull();
  });

  it("writes the summary and the long-term note as sentences", async () => {
    serve(routes);
    render(<GrowthScreen locale="fa" messages={fa} />);
    await screen.findByRole("heading", { level: 1 });
    expect(
      screen.getByText("شواهد فعلی نشان می‌دهد موضوع مرور بعدی باید «ورود زودهنگام» باشد. تمرکز بعدی را محدود و قابل‌اندازه‌گیری نگه دارید.")
    ).toBeInTheDocument();
    expect(screen.getByText("منحنی سرمایه، تکمیل مرورها و انضباط شواهدی برای مرور شخصی هستند، نه وعده نتیجه.")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("خودمرور");
  });

  it("writes every count in Persian digits, so one sentence never mixes two digit sets", async () => {
    serve(routes);
    render(<GrowthScreen locale="fa" messages={fa} />);
    await screen.findByRole("heading", { level: 1 });
    // 12 trades: the first-ten milestone stops at ten, it never reads "12 of 10".
    expect(screen.getByText("۱۰ از ۱۰ معامله ثبت شده")).toBeInTheDocument();
    expect(screen.getByText("۱ مرور هفتگی تکمیل شده")).toBeInTheDocument();
    expect(screen.getByText("۱ پلی‌بوک فعال")).toBeInTheDocument();
    expect(screen.getByText("۱ مرور تکمیل شده است.")).toBeInTheDocument();
    expect(screen.getByText("۱ پلی‌بوک استراتژی برای مرور موجود است.")).toBeInTheDocument();
    // The stat cards use the same digits.
    expect(screen.getByText("۱۲")).toBeInTheDocument();
    expect(screen.getByText("۰٫۶۰")).toBeInTheDocument();
  });

  it.each([
    ["fa", fa, "۴ از ۱۰ معامله ثبت شده"],
    ["en", en, "4/10 journaled trades"]
  ] as const)("shows the real count below ten trades (%s)", async (locale, messages, sentence) => {
    serve({ ...routes, "GET /api/trades/metrics": { metrics: { ...metrics, totalTrades: 4 } } });
    render(<GrowthScreen locale={locale} messages={messages} />);
    expect(await screen.findByText(sentence)).toBeInTheDocument();
  });

  it("has no English while loading", () => {
    (apiFetch as Mock).mockReturnValue(new Promise(() => undefined));
    const { container } = render(<GrowthScreen locale="fa" messages={fa} />);
    expect(container.textContent).toMatch(ARABIC_SCRIPT);
    expect(englishLeaks(container)).toEqual([]);
  });

  it("has no English when the data cannot be loaded", async () => {
    failWith(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    const { container } = render(<GrowthScreen locale="fa" messages={fa} />);
    await waitFor(() => expect(container.textContent).toMatch(ARABIC_SCRIPT));
    expect(englishLeaks(container)).toEqual([]);
  });

  it("keeps the English sentences on the English page", async () => {
    serve(routes);
    render(<GrowthScreen locale="en" messages={en} />);
    expect(await screen.findByText("First 10 journaled trades")).toBeInTheDocument();
    expect(screen.getByText('Reduce "ورود زودهنگام" before adding new complexity.')).toBeInTheDocument();
    expect(screen.getByText("1 active playbooks")).toBeInTheDocument();
    expect(screen.getByText("10/10 journaled trades")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });
});
