import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { englishLeaks } from "./support/english-leaks";
import { latinDigitStrings } from "./support/latin-digits";

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), pathname: "/en/journal", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.params,
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), refresh: vi.fn() })
}));
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { rowLabel } from "@/features/journal/drill-down-chip";
import { JournalScreen } from "@/features/journal/journal-screen";

const en = getMessages("en");
const fa = getMessages("fa");

const base = {
  strategyId: null,
  market: "forex",
  side: "long",
  status: "closed",
  entryPrice: 1.1,
  exitPrice: 1.2,
  stopLoss: 1.05,
  takeProfit: 1.3,
  quantity: 1,
  riskAmount: 100,
  riskPercent: 1,
  rMultiple: 1,
  realizedPnl: 100,
  fees: 0,
  session: null,
  setupType: null,
  confidenceScore: null,
  preTradeNotes: null,
  postTradeNotes: null,
  lessonsLearned: null,
  outcome: null,
  ruleFollowed: "followed",
  openedAt: "2026-09-29T10:00:00Z",
  closedAt: "2026-09-29T12:00:00Z",
  strategy: null,
  journalEntry: null
};
const trades = [
  { ...base, id: "t1", symbol: "GBPUSD", strategy: { id: "s1", name: "Range" } },
  { ...base, id: "t2", symbol: "EURUSD", setupType: "Breakout", journalEntry: { mistakes: ["Late Entry"], emotionalState: "Calm" } },
  { ...base, id: "t3", symbol: "XAUUSD", setupType: "breakout", journalEntry: { mistakes: ["Late entry", "late entry "], emotionalState: "calm" } }
];
const SYMBOLS = ["GBPUSD", "EURUSD", "XAUUSD"];

const TRADES_URL = (query: string) => `/api/performance/trades?${query}`;
const WEDNESDAY = "period=30d&dimension=weekday&row=key%3Aweekday.3";
const get = (url: string) => (apiFetch as Mock).mock.calls.map((call) => String(call[0])).filter((path) => path === url);

function serve(onTrades: (path: string) => unknown = () => ({ tradeIds: ["t2", "t3"] })) {
  (apiFetch as Mock).mockImplementation(async (path: string) => {
    if (path.startsWith("/api/performance/trades")) return onTrades(path);
    const route = path.split("?")[0];
    const table: Record<string, unknown> = {
      "/api/trades": { trades },
      "/api/trades/metrics": { metrics: { totalTrades: 3, winRate: 1, netPnl: 300, profitFactor: 2, expectancy: 100, averageR: 1, maxDrawdownAmount: 0, equityCurve: [0, 100] } },
      "/api/strategies": { strategies: [{ id: "s1", name: "Range" }] },
      "/api/ideas": { ideas: [] },
      "/api/reviews": { reviews: [] },
      "/api/news": { news: [] }
    };
    if (!(route in table)) throw new Error(`Unexpected request ${path}`);
    return table[route];
  });
}

/** The symbols the trade log lists (its desktop table, one button per row). */
const listed = () =>
  screen
    .queryAllByRole("button")
    .map((button) => button.textContent ?? "")
    .filter((text) => SYMBOLS.includes(text));

function open(query: string, locale: "en" | "fa" = "en") {
  nav.params = new URLSearchParams(query);
  nav.pathname = `/${locale}/journal`;
  return render(<JournalScreen locale={locale} messages={locale === "en" ? en : fa} />);
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.replace.mockReset();
});
afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

describe("the journal without drill-down parameters", () => {
  it("is unchanged: every trade, no chip, no question to the performance route", async () => {
    serve();
    open("");
    await screen.findByRole("button", { name: "Create trade" });
    expect(listed()).toEqual(SYMBOLS);
    expect(screen.queryByText(/^Showing:/)).not.toBeInTheDocument();
    expect(get(TRADES_URL(WEDNESDAY))).toEqual([]);
    expect((apiFetch as Mock).mock.calls.some((call) => String(call[0]).startsWith("/api/performance"))).toBe(false);
  });

  it("ignores parameters that are incomplete or unknown", async () => {
    serve();
    for (const query of ["period=30d&dimension=weekday", "period=1y&dimension=weekday&row=x", "dimension=color&period=all&row=x", "foo=bar"]) {
      const view = open(query);
      await screen.findByRole("button", { name: "Create trade" });
      expect(listed(), query).toEqual(SYMBOLS);
      expect(screen.queryByText(/^Showing:/)).not.toBeInTheDocument();
      view.unmount();
    }
    expect((apiFetch as Mock).mock.calls.some((call) => String(call[0]).startsWith("/api/performance"))).toBe(false);
  });
});

describe("the journal opened from a Performance row", () => {
  it("asks the route for the row's trades and lists only those, with a chip that says what is shown", async () => {
    serve();
    open(WEDNESDAY);
    const chip = await screen.findByText("Showing: Wednesday · last 30 days (2 trades)");
    expect(chip).toBeInTheDocument();
    expect(get(TRADES_URL(WEDNESDAY))).toHaveLength(1);
    expect(listed()).toEqual(["EURUSD", "XAUUSD"]);
  });

  it("names a row of the trader's own words as they wrote it, and counts one trade in the singular", async () => {
    serve(() => ({ tradeIds: ["t1"] }));
    open("period=all&dimension=strategy&row=text%3Arange");
    expect(await screen.findByText("Showing: Range · all time (1 trade)")).toBeInTheDocument();
    expect(listed()).toEqual(["GBPUSD"]);
  });

  it("shows the row's trader-written label as spelled in its trades (a tie goes to the smaller spelling, as on the Performance page)", async () => {
    serve(() => ({ tradeIds: ["t2", "t3"] }));
    open("period=7d&dimension=mistake&row=text%3Alate%20entry");
    expect(await screen.findByText("Showing: Late Entry · last 7 days (2 trades)")).toBeInTheDocument();
    expect(listed()).toEqual(["EURUSD", "XAUUSD"]);
  });

  it("names the key rows with the Performance page's words", async () => {
    serve(() => ({ tradeIds: ["t1", "t2"] }));
    open("period=90d&dimension=side&row=key%3Aside.long");
    expect(await screen.findByText("Showing: Long · last 90 days (2 trades)")).toBeInTheDocument();
  });

  it("falls back to the row's own text when a key is not one it knows, without breaking the page", async () => {
    serve(() => ({ tradeIds: [] }));
    open("period=all&dimension=weekday&row=key%3Aweekday.x");
    expect(await screen.findByText(/^Showing: .* all time \(0 trades\)$/)).toBeInTheDocument();
    expect(listed()).toEqual([]);
  });

  it("keeps the search and the filters working on top of the row's trades", async () => {
    serve();
    open(WEDNESDAY);
    await screen.findByText(/^Showing:/);
    fireEvent.change(screen.getByRole("textbox", { name: "Search symbol, setup, note, mistake" }), { target: { value: "xau" } });
    expect(listed()).toEqual(["XAUUSD"]);
    fireEvent.change(screen.getByRole("textbox", { name: "Search symbol, setup, note, mistake" }), { target: { value: "gbp" } });
    expect(listed()).toEqual([]); // GBPUSD is not one of the row's trades
  });

  it("clears with the chip: the parameters go (router.replace) and every trade is back", async () => {
    serve();
    const view = open(`${WEDNESDAY}&keep=1`);
    await screen.findByText(/^Showing:/);
    fireEvent.click(screen.getByRole("button", { name: "Show all trades" }));
    expect(nav.replace).toHaveBeenCalledWith("/en/journal?keep=1");

    nav.params = new URLSearchParams("keep=1");
    view.rerender(<JournalScreen locale="en" messages={en} />);
    expect(screen.queryByText(/^Showing:/)).not.toBeInTheDocument();
    expect(listed()).toEqual(SYMBOLS);
  });

  it("clears to the bare address when nothing else is in it", async () => {
    serve();
    open(WEDNESDAY);
    await screen.findByText(/^Showing:/);
    fireEvent.click(screen.getByRole("button", { name: "Show all trades" }));
    expect(nav.replace).toHaveBeenCalledWith("/en/journal");
  });

  it("makes the clear button at least 44 px", async () => {
    serve();
    open(WEDNESDAY);
    await screen.findByText(/^Showing:/);
    expect(screen.getByRole("button", { name: "Show all trades" }).className).toMatch(/size-11|min-h-11/);
  });

  it("says so when the trades could not be loaded, and leaves the whole journal usable", async () => {
    serve(() => {
      throw new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
    });
    open(WEDNESDAY);
    expect(await screen.findByText("Those trades could not be loaded, so every trade is shown.")).toBeInTheDocument();
    expect(listed()).toEqual(SYMBOLS);
    fireEvent.change(screen.getByRole("textbox", { name: "Search symbol, setup, note, mistake" }), { target: { value: "eur" } });
    expect(listed()).toEqual(["EURUSD"]);
    fireEvent.click(screen.getByRole("button", { name: "Show all trades" }));
    expect(nav.replace).toHaveBeenCalledWith("/en/journal");
  });

  it("asks again when the row in the address changes", async () => {
    serve((path) => ({ tradeIds: path.includes("weekday") ? ["t2"] : ["t3"] }));
    const view = open(WEDNESDAY);
    await screen.findByText("Showing: Wednesday · last 30 days (1 trade)");
    expect(listed()).toEqual(["EURUSD"]);

    nav.params = new URLSearchParams("period=30d&dimension=symbol&row=text%3Axauusd");
    view.rerender(<JournalScreen locale="en" messages={en} />);
    expect(await screen.findByText("Showing: XAUUSD · last 30 days (1 trade)")).toBeInTheDocument();
    await waitFor(() => expect(listed()).toEqual(["XAUUSD"]));
  });
});

describe("the journal opened from a Performance row, in Persian", () => {
  it("writes the chip in Persian, with Persian digits and the weekday's Persian name", async () => {
    serve();
    open(WEDNESDAY, "fa");
    const text = await screen.findByText("نمایش: چهارشنبه · ۳۰ روز اخیر (۲ معامله)");
    const chip = text.closest("[role=status]") as HTMLElement;
    expect(screen.getByRole("button", { name: "نمایش همه‌ی معاملات" })).toBeInTheDocument();
    // The chip alone: the rest of the journal has its own Persian tests.
    expect(latinDigitStrings(chip)).toEqual([]);
    expect(englishLeaks(chip)).toEqual([]);
  });

  it("writes the whole-history window and the failure in Persian too", async () => {
    serve(() => {
      throw new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
    });
    open("period=all&dimension=side&row=key%3Aside.short", "fa");
    const text = await screen.findByText("این معامله‌ها بارگذاری نشد؛ همه‌ی معامله‌ها نمایش داده می‌شوند.");
    const chip = text.closest("[role=status]") as HTMLElement;
    expect(latinDigitStrings(chip)).toEqual([]);
    expect(englishLeaks(chip)).toEqual([]);
  });

  it("names the window of all time in Persian", async () => {
    serve(() => ({ tradeIds: ["t1"] }));
    open("period=all&dimension=side&row=key%3Aside.short", "fa");
    expect(await screen.findByText("نمایش: شورت · کل دوران (۱ معامله)")).toBeInTheDocument();
  });
});

describe("rowLabel", () => {
  const labelled = (symbol: string, mistakes: string[] = []) => ({ id: symbol, symbol, session: null, setupType: null, strategy: null, journalEntry: { mistakes } });
  const drill = { period: "all", dimension: "mistake", row: "text:late entry" } as const;

  it("takes the spelling used most, counting a trade once, and falls back to the folded text", () => {
    const rows = [labelled("A", ["Late entry"]), labelled("B", ["late entry", "Late entry"]), labelled("C", ["late entry "]), labelled("D", ["Moved stop"])];
    expect(rowLabel(drill, rows, "en")).toBe("late entry"); // B and C wrote it in lower case, A in sentence case
    expect(rowLabel(drill, [], "en")).toBe("late entry");
    expect(rowLabel({ ...drill, row: "text:moved stop" }, rows, "en")).toBe("Moved stop");
  });
});
