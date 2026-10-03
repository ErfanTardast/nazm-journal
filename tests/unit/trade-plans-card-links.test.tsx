import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { englishLeaks } from "./support/english-leaks";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { TradePlansScreen } from "@/features/trade-plans/trade-plans-screen";

const en = getMessages("en");
const fa = getMessages("fa");

type Call = { key: string; body?: Record<string, unknown> };
const calls: Call[] = [];
const sent = (key: string) => calls.filter((call) => call.key === key);

type Routes = Record<string, unknown | (() => unknown)>;
function serve(routes: Routes) {
  calls.length = 0;
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (!(key in routes)) throw new Error(`Unexpected request ${key}`);
    const handler = routes[key];
    return typeof handler === "function" ? await (handler as () => unknown)() : handler;
  });
}

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

const RANGE = { id: "strat-range", name: "Range fade", isActive: true, isSample: false, allowedMarkets: ["forex"], entryRules: [], exitRules: [], invalidationRules: [], riskRules: [], checklist: [] };
const RETIRED = { ...RANGE, id: "strat-retired", name: "Retired idea", isActive: false };
const SAMPLE = { ...RANGE, id: "strat-sample", name: "Sample breakout", isSample: true };

// Latin text the tests feed into the Persian page themselves: strategy names and the plan's own bias wording.
const LATIN_DATA = ["Range fade", "Retired idea", "Sample breakout", "Bullish above 65k"];

const SIZING = {
  symbol: "EURUSD",
  direction: "buy" as const,
  balance: 10000,
  riskPercent: 1,
  entry: 1.1,
  stopLoss: 1.098,
  finalTp: 1.106,
  totalVolume: 0.48,
  riskMoney: 100,
  lossAtStop: 96,
  finalRr: 3,
  legs: [
    { volume: 0.16, takeProfit: 1.102, rr: 1 },
    { volume: 0.16, takeProfit: 1.104, rr: 2 },
    { volume: 0.16, takeProfit: 1.106, rr: 3 }
  ],
  sizedAt: "2026-10-02T08:00:00.000Z"
};

const plan = (overrides: Record<string, unknown> = {}) => ({
  id: "plan-1",
  strategyId: null,
  market: "crypto",
  symbol: "BTCUSDT",
  bias: "Bullish above 65k",
  entryZone: "64600-65100",
  stopLoss: null,
  takeProfit: null,
  riskAmount: null,
  riskPercent: null,
  checklist: { newsChecked: false, riskCalculated: false, strategyMatched: false, direction: "long" },
  invalidationRule: null,
  notes: null,
  status: "planned",
  isSample: false,
  sizing: null,
  strategy: null,
  ...overrides
});

async function show(locale: "en" | "fa", plans: unknown[], extra: Routes = {}, strategies: unknown[] = [RANGE, RETIRED, SAMPLE]) {
  serve({
    "GET /api/trade-plans": { tradePlans: plans },
    "GET /api/strategies": { strategies },
    "GET /api/users/me/settings": { settings: { riskPerTradePct: 1, maxDailyLossPct: 3 } },
    ...extra
  });
  const view = render(<TradePlansScreen locale={locale} messages={locale === "fa" ? fa : en} />);
  await screen.findByText(plans.length ? String((plans[0] as { symbol: string }).symbol) : "No plans yet");
  return view;
}

const card = (symbol = "BTCUSDT") => screen.getByText(symbol).closest("div.rounded-md") as HTMLElement;

describe("the plan card names the strategy", () => {
  it("shows the strategy's name and no missing-playbook badge", async () => {
    await show("en", [plan({ strategyId: "strat-range", strategy: RANGE })]);
    expect(card()).toHaveTextContent("Strategy: Range fade");
    expect(within(card()).queryByText("No playbook")).toBeNull();
  });

  it("keeps the missing-playbook badge for a plan without a strategy", async () => {
    await show("en", [plan()]);
    expect(within(card()).getByText("No playbook")).toBeInTheDocument();
    expect(card()).not.toHaveTextContent("Strategy:");
  });

  it("says it in Persian", async () => {
    const { container } = await show("fa", [plan({ strategyId: "strat-range", strategy: RANGE })]);
    expect(card()).toHaveTextContent("استراتژی: Range fade");
    expect(englishLeaks(container, LATIN_DATA)).toEqual([]);
  });
});

describe("a sample plan", () => {
  it("is marked Sample (نمونه in Persian) and offers no Convert button", async () => {
    await show("en", [plan({ isSample: true })]);
    expect(within(card()).getByText("Sample")).toBeInTheDocument();
    expect(within(card()).queryByRole("button", { name: "Convert to trade" })).toBeNull();
    cleanup();

    await show("fa", [plan({ isSample: true })]);
    expect(within(card()).getByText("نمونه")).toBeInTheDocument();
    expect(within(card()).queryByRole("button", { name: "تبدیل به معامله" })).toBeNull();
  });

  it("can still be sized in the risk desk", async () => {
    await show("en", [plan({ isSample: true })]);
    expect(within(card()).getByRole("link", { name: "Size it in the risk desk" })).toHaveAttribute("href", "/en/risk?plan=plan-1");
  });

  it("a plan of the user's own has the Convert button and no Sample badge", async () => {
    await show("en", [plan()]);
    expect(within(card()).getByRole("button", { name: "Convert to trade" })).toBeInTheDocument();
    expect(within(card()).queryByText("Sample")).toBeNull();
  });
});

describe("the saved sizing is shown on the card", () => {
  it("English: total lots, number of legs and the loss at the stop, numbers left to right", async () => {
    await show("en", [plan({ sizing: SIZING })]);
    const text = card();
    expect(text).toHaveTextContent("Sized in the risk desk");
    expect(text).toHaveTextContent("Total lots 0.48");
    expect(text).toHaveTextContent("Legs 3");
    expect(text).toHaveTextContent("Loss at the stop 96.00");
    for (const number of ["0.48", "3", "96.00"]) expect(within(text).getByText(number).getAttribute("dir"), number).toBe("ltr");
  });

  it("Persian: Persian words, numbers still left to right", async () => {
    const { container } = await show("fa", [plan({ sizing: SIZING })]);
    const text = card();
    expect(text).toHaveTextContent("محاسبه‌شده در ماشین‌حساب ریسک");
    expect(text).toHaveTextContent("حجم کل (لات) 0.48");
    expect(text).toHaveTextContent("تعداد بخش‌ها 3");
    expect(text).toHaveTextContent("زیان در حد ضرر 96.00");
    expect(within(text).getByText("0.48").getAttribute("dir")).toBe("ltr");
    expect(englishLeaks(container, LATIN_DATA)).toEqual([]);
  });

  it("is not there for a plan that was never sized", async () => {
    await show("en", [plan()]);
    expect(card()).not.toHaveTextContent("Sized in the risk desk");
  });

  it("keeps the lots to three decimals without trailing zeros", async () => {
    await show("en", [plan({ sizing: { ...SIZING, totalVolume: 0.125, lossAtStop: 99.5 } })]);
    expect(card()).toHaveTextContent("Total lots 0.125");
    expect(card()).toHaveTextContent("Loss at the stop 99.50");
  });
});

describe("a link from an open plan to the risk desk", () => {
  it("is there for a planned and an active plan, in the page language", async () => {
    await show("en", [plan({ id: "p-a", symbol: "AAAUSD", status: "planned" }), plan({ id: "p-b", symbol: "BBBUSD", status: "active" })]);
    expect(within(card("AAAUSD")).getByRole("link", { name: "Size it in the risk desk" })).toHaveAttribute("href", "/en/risk?plan=p-a");
    expect(within(card("BBBUSD")).getByRole("link", { name: "Size it in the risk desk" })).toHaveAttribute("href", "/en/risk?plan=p-b");
    cleanup();

    await show("fa", [plan()]);
    expect(within(card()).getByRole("link", { name: "محاسبه اندازه پوزیشن در ماشین‌حساب ریسک" })).toHaveAttribute("href", "/fa/risk?plan=plan-1");
  });

  it("is not there for a closed or a canceled plan", async () => {
    await show("en", [plan({ id: "p-a", symbol: "AAAUSD", status: "closed" }), plan({ id: "p-b", symbol: "BBBUSD", status: "canceled" })]);
    expect(screen.queryByRole("link", { name: "Size it in the risk desk" })).toBeNull();
  });
});

describe("a plan without a strategy can get one from the card", () => {
  const picker = () => screen.getByRole("combobox", { name: "Strategy for BTCUSDT" }) as HTMLSelectElement;

  it("offers a picker of the active strategies, and nothing is sent until one is chosen", async () => {
    await show("en", [plan()]);
    fireEvent.click(within(card()).getByRole("button", { name: "Attach a strategy" }));
    expect(Array.from(picker().options).map((option) => option.textContent)).toEqual(["Choose a strategy", "Range fade", "Sample breakout (Sample)"]);
    expect(within(card()).getByRole("button", { name: "Attach" })).toBeDisabled();
    expect(sent("PATCH /api/trade-plans")).toHaveLength(0);
  });

  it("PATCHes the strategy with the plan's own status, then shows it on the card", async () => {
    let loads = 0;
    await show("en", [plan({ status: "active" })], {
      "GET /api/trade-plans": () => {
        loads += 1;
        return { tradePlans: [loads === 1 ? plan({ status: "active" }) : plan({ status: "active", strategyId: "strat-range", strategy: RANGE })] };
      },
      "PATCH /api/trade-plans": { tradePlan: { id: "plan-1" } }
    });
    fireEvent.click(within(card()).getByRole("button", { name: "Attach a strategy" }));
    fireEvent.change(picker(), { target: { value: "strat-range" } });
    fireEvent.click(within(card()).getByRole("button", { name: "Attach" }));

    await waitFor(() => expect(sent("PATCH /api/trade-plans")).toHaveLength(1));
    // Only the link changes: the status goes along so the update cannot be read as a change of it.
    expect(sent("PATCH /api/trade-plans")[0].body).toEqual({ id: "plan-1", status: "active", strategyId: "strat-range" });
    await waitFor(() => expect(card()).toHaveTextContent("Strategy: Range fade"));
    expect(within(card()).queryByText("No playbook")).toBeNull();
    expect(within(card()).queryByRole("button", { name: "Attach a strategy" })).toBeNull();
  });

  it("names the strategy field when the server refuses it, in the page language", async () => {
    await show("fa", [plan()], {
      "PATCH /api/trade-plans": () => {
        throw new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { formErrors: [], fieldErrors: { strategyId: ["Strategy not found"] } });
      }
    });
    fireEvent.click(within(card()).getByRole("button", { name: "افزودن استراتژی" }));
    fireEvent.change(screen.getByRole("combobox", { name: "استراتژی برای BTCUSDT" }), { target: { value: "strat-range" } });
    fireEvent.click(within(card()).getByRole("button", { name: "افزودن" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("این فیلدها را بررسی کنید: استراتژی");
  });

  it("Cancel closes the picker without a request", async () => {
    await show("en", [plan()]);
    fireEvent.click(within(card()).getByRole("button", { name: "Attach a strategy" }));
    fireEvent.click(within(card()).getByRole("button", { name: "Cancel" }));
    expect(within(card()).getByRole("button", { name: "Attach a strategy" })).toBeInTheDocument();
    expect(sent("PATCH /api/trade-plans")).toHaveLength(0);
  });

  it("points at the Strategies page when there is no strategy to attach", async () => {
    await show("en", [plan()], {}, []);
    await waitFor(() => expect(within(card()).getByRole("link", { name: "Create a strategy" })).toHaveAttribute("href", "/en/strategies"));
    expect(within(card()).queryByRole("button", { name: "Attach a strategy" })).toBeNull();
  });

  it("is not offered when the plan has a strategy, or is closed or canceled", async () => {
    await show("en", [
      plan({ id: "p-a", symbol: "AAAUSD", strategyId: "strat-range", strategy: RANGE }),
      plan({ id: "p-b", symbol: "BBBUSD", status: "closed" }),
      plan({ id: "p-c", symbol: "CCCUSD", status: "canceled" })
    ]);
    // Let the strategy list arrive first: the control would be offered by now if it were going to be.
    await waitFor(() => expect(calls.map((call) => call.key)).toContain("GET /api/strategies"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("button", { name: "Attach a strategy" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Create a strategy" })).toBeNull();
  });

  it("is Persian on the Persian page", async () => {
    const { container } = await show("fa", [plan()]);
    fireEvent.click(within(card()).getByRole("button", { name: "افزودن استراتژی" }));
    expect(screen.getByRole("combobox", { name: "استراتژی برای BTCUSDT" })).toBeInTheDocument();
    expect(englishLeaks(container, LATIN_DATA)).toEqual([]);
  });
});
