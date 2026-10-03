import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { englishLeaks } from "./support/english-leaks";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { JournalScreen } from "@/features/journal/journal-screen";

const en = getMessages("en");
const fa = getMessages("fa");

type Call = { key: string; body?: Record<string, unknown> };
const calls: Call[] = [];

// Image format names in the screenshot hint are kept in Latin letters, like CSV and MT5.
const FILE_FORMATS = ["PNG", "JPG", "WebP", "GIF"];

const trade = {
  id: "t1",
  strategyId: "s1",
  symbol: "BTCUSDT",
  market: "crypto",
  side: "long",
  status: "closed",
  entryPrice: 65000,
  exitPrice: 66000,
  stopLoss: 64000,
  takeProfit: 67000,
  quantity: 0.1,
  riskAmount: 100,
  riskPercent: 1,
  rMultiple: 1,
  realizedPnl: 100,
  fees: 1,
  session: null,
  setupType: null,
  confidenceScore: 7,
  preTradeNotes: null,
  postTradeNotes: null,
  lessonsLearned: null,
  outcome: null,
  ruleFollowed: "followed",
  openedAt: "2026-09-29T10:00:00Z",
  closedAt: "2026-09-29T12:00:00Z",
  strategy: { id: "s1", name: "بازگشت به میانه" },
  journalEntry: null
};

function routes(overrides: Record<string, unknown | (() => unknown)> = {}, locale: "en" | "fa" = "en") {
  return {
    "GET /api/trades": { trades: [trade] },
    "GET /api/trades/metrics": {
      metrics: { totalTrades: 1, winRate: 1, netPnl: 100, profitFactor: 2, expectancy: 100, averageR: 1, maxDrawdownAmount: 20, equityCurve: [0, 50, 100] }
    },
    "GET /api/strategies": { strategies: [{ id: "s1", name: "بازگشت به میانه" }] },
    "GET /api/ideas": {
      ideas: [{ id: "i1", title: "بازگشت به حمایت", market: "crypto", symbols: ["BTCUSDT"], status: "draft", confidence: 6, thesis: "فرضیه" }]
    },
    "GET /api/reviews": {
      reviews: [{ id: "r1", type: "trade", title: "مرور معامله", status: "completed", linkedTradeIds: ["t1"], linkedStrategyIds: [] }]
    },
    [`GET /api/news?locale=${locale}`]: {
      news: [{ title: "گزارش اشتغال", source: "منبع", market: "crypto", relatedSymbols: ["BTCUSDT"], importance: "high", summary: "خلاصه" }]
    },
    "POST /api/trades": { trade: { id: "t2" } },
    ...overrides
  } as Record<string, unknown | (() => unknown)>;
}

function serve(table: Record<string, unknown | (() => unknown)>) {
  calls.length = 0;
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (!(key in table)) throw new Error(`Unexpected request ${key}`);
    const handler = table[key];
    return typeof handler === "function" ? await (handler as () => unknown)() : handler;
  });
}

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

const field = (form: HTMLFormElement, name: string) => form.elements.namedItem(name) as HTMLInputElement;
const type = (form: HTMLFormElement, values: Record<string, string>) => {
  for (const [name, value] of Object.entries(values)) fireEvent.change(field(form, name), { target: { value } });
};

describe("the journal page in Persian", () => {
  it("has no English left: stat cards, equity curve, badges, related items", async () => {
    serve(routes({}, "fa"));
    const { container } = render(<JournalScreen locale="fa" messages={fa} />);
    await screen.findByRole("button", { name: "ثبت معامله" });

    // The symbol is a ticker, and the English page keeps those in Latin letters.
    expect(englishLeaks(container, ["BTCUSDT", ...FILE_FORMATS])).toEqual([]);
    for (const label of ["معاملات", "نرخ برد", "سود و زیان خالص", "امید ریاضی", "بیشترین افت سرمایه"]) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0);
    }
    expect(screen.getByText("منحنی سرمایه")).toBeInTheDocument();
    // The trend line is announced in the page language too.
    expect(screen.getByRole("img", { name: "منحنی سرمایه" })).toBeInTheDocument();
    // "None" next to the mistakes and tags of a trade that has none.
    expect(screen.getAllByText("ندارد").length).toBeGreaterThan(0);
    expect(screen.queryByText("None")).toBeNull();
  });

  it("names a trade without a plan with the glossary word", async () => {
    serve(routes({ "GET /api/trades": { trades: [{ ...trade, strategyId: null, strategy: null }] } }, "fa"));
    const { container } = render(<JournalScreen locale="fa" messages={fa} />);
    await screen.findByRole("button", { name: "ثبت معامله" });
    expect(container.textContent).toContain("بدون پلن");
    // "برنامه" is not used for a plan any more; "برنامه‌ریزی" (the activity, and the Planned status) stays.
    expect(container.textContent).not.toMatch(/برنامه(?!‌ریز)/);
  });

  it("describes the trade table in natural Persian, not the calque «زمینه ژورنال»", async () => {
    serve(routes({}, "fa"));
    const { container } = render(<JournalScreen locale="fa" messages={fa} />);
    await screen.findByRole("button", { name: "ثبت معامله" });
    expect(screen.getByText("معامله‌های اخیر همراه با ریسک، R، نتیجه رعایت قوانین و یادداشت‌های ژورنال.")).toBeInTheDocument();
    expect(container.textContent).not.toContain("زمینه ژورنال");
  });

  it("keeps the English table description", async () => {
    serve(routes());
    render(<JournalScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "Create trade" });
    expect(screen.getByText("Recent records with risk, R multiple, rule result, and journal context.")).toBeInTheDocument();
  });

  // convertTradePlan writes these two values itself; they are product words, not something the trader typed.
  const convertedTrade = {
    ...trade,
    setupType: "planned-trade-conversion",
    journalEntry: { mistakes: [], tags: ["converted-plan", "breakout"], notes: null }
  };

  it("names a trade converted from a plan in Persian, not with the English slugs", async () => {
    serve(routes({ "GET /api/trades": { trades: [convertedTrade] } }, "fa"));
    const { container } = render(<JournalScreen locale="fa" messages={fa} />);
    await screen.findByRole("button", { name: "ثبت معامله" });

    // "breakout" is a tag the trader typed, so it stays as typed.
    expect(englishLeaks(container, ["BTCUSDT", "breakout", ...FILE_FORMATS])).toEqual([]);
    expect(container.textContent).not.toContain("planned-trade-conversion");
    expect(container.textContent).not.toContain("converted-plan");
    // The mobile list, the dossier line and the tag badges.
    expect(screen.getAllByText(/از روی پلن/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("پلن تبدیل‌شده")).toBeInTheDocument();
    expect(screen.getByText("breakout")).toBeInTheDocument();
  });

  it("names it in English too", async () => {
    serve(routes({ "GET /api/trades": { trades: [convertedTrade] } }));
    const { container } = render(<JournalScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "Create trade" });

    expect(container.textContent).not.toContain("planned-trade-conversion");
    expect(container.textContent).not.toContain("converted-plan");
    expect(screen.getAllByText(/From a plan/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Converted plan")).toBeInTheDocument();
  });

  it("finds a converted trade by the name the page shows for it", async () => {
    const other = { ...trade, id: "t9", symbol: "ETHUSDT", setupType: "breakout" };
    serve(routes({ "GET /api/trades": { trades: [convertedTrade, other] } }));
    render(<JournalScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "Create trade" });
    // The symbol button of each row in the trade log.
    expect(screen.getByRole("button", { name: "ETHUSDT" })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search symbol, setup, note, mistake"), { target: { value: "from a plan" } });
    expect(screen.queryByRole("button", { name: "ETHUSDT" })).toBeNull();
    expect(screen.getByRole("button", { name: "BTCUSDT" })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search symbol, setup, note, mistake"), { target: { value: "converted plan" } });
    expect(screen.queryByRole("button", { name: "ETHUSDT" })).toBeNull();
    expect(screen.getByRole("button", { name: "BTCUSDT" })).toBeInTheDocument();
  });

  it("leaves a setup the trader typed as typed, even when it is named like an object key", async () => {
    serve(routes({ "GET /api/trades": { trades: [{ ...trade, setupType: "constructor" }] } }));
    const { container } = render(<JournalScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "Create trade" });
    expect(container.textContent).toContain("constructor");
  });

  it("keeps the English page in English", async () => {
    serve(routes());
    const { container } = render(<JournalScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "Create trade" });
    for (const label of ["Trades", "Win rate", "Net P&L", "Expectancy", "Max drawdown"]) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0);
    }
    expect(screen.getByRole("img", { name: "Equity curve" })).toBeInTheDocument();
    expect(container.textContent).toContain("Quick entry");
  });
});

describe("journal errors are shown in the page language", () => {
  async function failFullForm(locale: "fa" | "en", error: unknown) {
    serve(routes({ "POST /api/trades": () => { throw error; } }, locale));
    render(<JournalScreen locale={locale} messages={locale === "fa" ? fa : en} />);
    const button = await screen.findByRole("button", { name: locale === "fa" ? "ثبت معامله" : "Create trade" });
    type(button.closest("form") as HTMLFormElement, { symbol: "ETHUSDT", entryPrice: "3000", quantity: "1", openedAt: "2026-09-29T10:00" });
    fireEvent.click(button);
    return screen.findByRole("alert");
  }

  async function failQuickEntry(locale: "fa" | "en", error: unknown) {
    serve(routes({ "POST /api/trades": () => { throw error; } }, locale));
    render(<JournalScreen locale={locale} messages={locale === "fa" ? fa : en} />);
    const button = await screen.findByRole("button", { name: locale === "fa" ? "ذخیره سریع" : "Quick save" });
    type(button.closest("form") as HTMLFormElement, { symbol: "ETHUSDT", entryPrice: "3000" });
    fireEvent.click(button);
    return screen.findByRole("alert");
  }

  const server500 = new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");

  it("full form: a server error is a Persian sentence, never the server's English text", async () => {
    const alert = await failFullForm("fa", server500);
    expect(alert.textContent).toMatch(/[؀-ۿ]/);
    expect(englishLeaks(alert)).toEqual([]);
    expect(alert.textContent).not.toContain("Unexpected server error");
  });

  it("full form: an error that is not an ApiClientError falls back to the Persian sentence", async () => {
    const alert = await failFullForm("fa", new Error("Cannot read properties of undefined"));
    expect(alert.textContent).not.toContain("Cannot read");
    expect(englishLeaks(alert)).toEqual([]);
  });

  it("full form: the rejected fields are named with the field labels, in Persian", async () => {
    const alert = await failFullForm("fa", new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: { entryPrice: ["Too small"] } }));
    expect(alert).toHaveTextContent("قیمت ورود");
    expect(englishLeaks(alert)).toEqual([]);
  });

  it("full form (English): keeps the server's own text for a client error", async () => {
    const alert = await failFullForm("en", new ApiClientError("Symbol is not allowed", 409, "CONFLICT"));
    expect(alert).toHaveTextContent("Symbol is not allowed");
  });

  it("full form (English): a server error uses the screen's own sentence", async () => {
    const alert = await failFullForm("en", server500);
    expect(alert).toHaveTextContent("Trade could not be created");
    expect(alert.textContent).not.toContain("Unexpected server error");
  });

  it("quick entry: a server error is a Persian sentence", async () => {
    const line = await failQuickEntry("fa", server500);
    expect(line.textContent).toMatch(/[؀-ۿ]/);
    expect(englishLeaks(line)).toEqual([]);
  });

  it("quick entry (English): a server error says the trade could not be saved", async () => {
    const line = await failQuickEntry("en", server500);
    expect(line).toHaveTextContent("Could not save");
  });

  it("a failed load shows a Persian card, not the server's text", async () => {
    (apiFetch as Mock).mockImplementation(async () => { throw server500; });
    const { container } = render(<JournalScreen locale="fa" messages={fa} />);
    await screen.findByText("ژورنال در دسترس نیست");
    expect(container.textContent).not.toContain("Unexpected server error");
    expect(englishLeaks(container)).toEqual([]);
  });
});


