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
import { tradePlanCreateSchema } from "@/lib/validation/trading";

const en = getMessages("en");
const fa = getMessages("fa");

type Call = { key: string; body?: Record<string, unknown> };
const calls: Call[] = [];
const posts = (key: string) => calls.filter((call) => call.key === key);

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

const RANGE = {
  id: "strat-range",
  name: "Range fade",
  isActive: true,
  isSample: false,
  allowedMarkets: ["forex"],
  entryRules: ["Wait for the sweep of the range low"],
  exitRules: ["Range midpoint"],
  invalidationRules: ["Close outside the range", "Two closes beyond the high"],
  riskRules: ["Stop for the day after two losses"],
  checklist: ["Waited for the sweep", "Volume confirmed"],
  riskPerTradePct: "0.5000",
  maxDailyLossPct: "2.0000",
  maxOpenPositions: 3
};
const BREAKOUT = {
  id: "strat-breakout",
  name: "Breakout",
  isActive: true,
  isSample: false,
  allowedMarkets: ["crypto", "forex"],
  entryRules: ["Break of the prior high"],
  exitRules: ["Trail under the last low"],
  invalidationRules: [],
  riskRules: [],
  checklist: ["Waited for the sweep"],
  riskPerTradePct: null,
  maxDailyLossPct: null,
  maxOpenPositions: null
};
const TIGHT = { ...RANGE, id: "strat-tight", name: "Tight range", allowedMarkets: ["forex", "stocks"], riskPerTradePct: "0.2500", maxDailyLossPct: null, maxOpenPositions: null, checklist: [], invalidationRules: [] };
const RETIRED = { ...RANGE, id: "strat-retired", name: "Retired idea", isActive: false };
const SAMPLE_STRATEGY = { ...BREAKOUT, id: "strat-sample", name: "Sample breakout", isSample: true };
const SETTINGS = { settings: { locale: "en", riskPerTradePct: 1, maxDailyLossPct: 3, maxWeeklyLossPct: 6, startingBalance: 10000 } };

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
  checklist: { newsChecked: false, riskCalculated: false, strategyMatched: false },
  invalidationRule: null,
  notes: null,
  status: "planned",
  isSample: false,
  sizing: null,
  strategy: null,
  ...overrides
});

function routes(extra: Routes = {}, plans: unknown[] = [], strategies: unknown[] = [RANGE, BREAKOUT, TIGHT, RETIRED, SAMPLE_STRATEGY]): Routes {
  return {
    "GET /api/trade-plans": { tradePlans: plans },
    "GET /api/strategies": { strategies },
    "GET /api/users/me/settings": SETTINGS,
    ...extra
  };
}

const form = (container: HTMLElement) => container.querySelector("form") as HTMLFormElement;
const field = <T extends HTMLElement = HTMLInputElement>(root: HTMLElement, name: string) => {
  const element = root.querySelector<T>(`[name="${name}"]`);
  if (!element) throw new Error(`no field named ${name}`);
  return element;
};
function type(root: HTMLElement, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) fireEvent.change(field(root, name), { target: { value } });
}

async function open(locale: "en" | "fa" = "en", extra: Routes = {}, plans: unknown[] = [], props: { initialStrategyId?: string } = {}, strategies?: unknown[]) {
  serve(routes(extra, plans, strategies));
  const view = render(<TradePlansScreen locale={locale} messages={locale === "fa" ? fa : en} {...props} />);
  await screen.findByRole("button", { name: locale === "fa" ? "ذخیره پلن" : "Save plan" });
  return view;
}

/** Waits until the strategies have arrived (the picker holds more than "no strategy"). */
async function opened(locale: "en" | "fa" = "en", extra: Routes = {}, plans: unknown[] = [], props: { initialStrategyId?: string } = {}) {
  const view = await open(locale, extra, plans, props);
  await screen.findByRole("option", { name: "Range fade" });
  return view;
}

const choose = (container: HTMLElement, id: string) => fireEvent.change(field<HTMLSelectElement>(container, "strategyId"), { target: { value: id } });
const warnings = () => screen.getByRole("status");

describe("the plan form has a strategy picker", () => {
  it("offers 'no strategy' and the user's active strategies, with sample ones marked", async () => {
    const { container } = await opened();
    const select = field<HTMLSelectElement>(container, "strategyId");
    const options = Array.from(select.options).map((option) => option.textContent);
    expect(options).toEqual(["No strategy", "Range fade", "Breakout", "Tight range", "Sample breakout (Sample)"]);
    expect(select.value).toBe("");
    expect(select.closest("label")).toHaveTextContent(/^Strategy/);
  });

  it("is in Persian on the Persian page", async () => {
    const { container } = await opened("fa");
    const options = Array.from(field<HTMLSelectElement>(container, "strategyId").options).map((option) => option.textContent);
    expect(options[0]).toBe("بدون استراتژی");
    expect(options).toContain("Sample breakout (نمونه)");
    expect(field<HTMLSelectElement>(container, "strategyId").closest("label")).toHaveTextContent(/^استراتژی/);
    expect(englishLeaks(container, ["Range fade", "Breakout", "Tight range", "Sample breakout"])).toEqual([]);
  });

  it("preselects the strategy named in the link when it is one of the user's", async () => {
    const { container } = await open("en", {}, [], { initialStrategyId: "strat-range" });
    await waitFor(() => expect(field<HTMLSelectElement>(container, "strategyId").value).toBe("strat-range"));
    expect(screen.getByRole("region", { name: /Range fade/ })).toBeInTheDocument();
  });

  it("ignores an id that is not one of the user's, quietly", async () => {
    const { container } = await open("en", {}, [], { initialStrategyId: "someone-elses-strategy" });
    await screen.findByRole("option", { name: "Breakout" });
    expect(field<HTMLSelectElement>(container, "strategyId").value).toBe("");
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("still preselects an own strategy that is no longer active, so a link from its row works", async () => {
    const { container } = await open("en", {}, [], { initialStrategyId: "strat-retired" });
    await waitFor(() => expect(field<HTMLSelectElement>(container, "strategyId").value).toBe("strat-retired"));
  });

  it("works without any strategy list: only 'no strategy', and no error on screen", async () => {
    serve(routes({
      "GET /api/strategies": () => {
        throw new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
      }
    }));
    const { container } = render(<TradePlansScreen locale="en" messages={en} initialStrategyId="strat-range" />);
    await screen.findByRole("button", { name: "Save plan" });
    await waitFor(() => expect(calls.map((call) => call.key)).toContain("GET /api/strategies"));
    expect(Array.from(field<HTMLSelectElement>(container, "strategyId").options).map((option) => option.textContent)).toEqual(["No strategy"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sends the chosen strategy with the plan, and the market the strategy fixed", async () => {
    const { container } = await opened("en", { "POST /api/trade-plans": { tradePlan: { id: "p" } } });
    choose(container, "strat-range");
    type(form(container), { symbol: "EURUSD", direction: "long", bias: "Range", entryZone: "1.0850" });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));

    await waitFor(() => expect(posts("POST /api/trade-plans")).toHaveLength(1));
    expect(posts("POST /api/trade-plans")[0].body).toMatchObject({ strategyId: "strat-range", market: "forex", symbol: "EURUSD" });
  });

  it("sends no strategyId for a plan without a strategy", async () => {
    const { container } = await opened("en", { "POST /api/trade-plans": { tradePlan: { id: "p" } } });
    type(form(container), { symbol: "ETHUSDT", direction: "long", bias: "Constructive", entryZone: "3000" });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(posts("POST /api/trade-plans")).toHaveLength(1));
    expect(posts("POST /api/trade-plans")[0].body).not.toHaveProperty("strategyId");
  });

  it("names the strategy field when the server refuses the link, in the page language", async () => {
    const refuse = () => {
      throw new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { formErrors: [], fieldErrors: { strategyId: ["Strategy not found"] } });
    };
    const { container } = await opened("en", { "POST /api/trade-plans": refuse });
    choose(container, "strat-range");
    type(form(container), { symbol: "EURUSD", direction: "long", bias: "Range", entryZone: "1.0850" });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please check these fields: Strategy");
    cleanup();

    const persian = await opened("fa", { "POST /api/trade-plans": refuse });
    choose(persian.container, "strat-range");
    type(form(persian.container), { symbol: "EURUSD", direction: "long", bias: "رنج", entryZone: "1.0850" });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره پلن" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("این فیلدها را بررسی کنید: استراتژی");
  });
});

describe("choosing a strategy shows its rules next to the form, read-only", () => {
  it("lists the entry, invalidation and risk rules and the limits", async () => {
    const { container } = await opened();
    choose(container, "strat-range");
    const rules = screen.getByRole("region", { name: /Range fade/ });
    expect(rules).toHaveTextContent("Wait for the sweep of the range low");
    expect(rules).toHaveTextContent("Close outside the range");
    expect(rules).toHaveTextContent("Two closes beyond the high");
    expect(rules).toHaveTextContent("Stop for the day after two losses");
    expect(rules).toHaveTextContent("Risk per trade 0.5%");
    expect(rules).toHaveTextContent("Daily loss 2%");
    expect(rules).toHaveTextContent("Open positions 3");
    // Read-only: nothing in the panel can be typed into.
    expect(rules.querySelector("input, textarea, select")).toBeNull();
    // The note says only what the Strategies page can do: it edits the limits of an existing strategy, not its rules.
    expect(rules).toHaveTextContent("Read-only here. The strategy's limits can be edited on the Strategies page.");
    expect(rules).not.toHaveTextContent("Change the rules");
    expect(form(container).contains(rules) || container.contains(rules)).toBe(true);
  });

  it("is in Persian, with Persian digits", async () => {
    const { container } = await opened("fa");
    choose(container, "strat-range");
    const rules = screen.getByRole("region", { name: /Range fade/ });
    expect(rules).toHaveTextContent("قوانین ورود");
    expect(rules).toHaveTextContent("در این صفحه فقط خواندنی است. سقف‌های استراتژی را می‌توانید در صفحه استراتژی‌ها ویرایش کنید.");
    expect(rules).not.toHaveTextContent("برای تغییر قوانین");
    expect(rules).toHaveTextContent("ریسک هر معامله ۰٫۵٪");
    expect(rules).toHaveTextContent("پوزیشن باز ۳");
    expect(rules).not.toHaveTextContent("موقعیت");
    expect(englishLeaks(rules, ["Range fade", "Wait for the sweep of the range low", "Close outside the range", "Two closes beyond the high", "Stop for the day after two losses"])).toEqual([]);
  });

  it("goes away with 'no strategy'", async () => {
    const { container } = await opened();
    choose(container, "strat-range");
    choose(container, "");
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("says when the strategy has no limits and no rules of a kind, without empty headings", async () => {
    const { container } = await opened();
    choose(container, "strat-breakout");
    const rules = screen.getByRole("region", { name: /Breakout/ });
    expect(rules).toHaveTextContent("Break of the prior high");
    expect(rules).not.toHaveTextContent("Invalidation rules");
    expect(rules).not.toHaveTextContent("Risk rules");
    expect(rules).toHaveTextContent("No limits set");
  });
});

describe("choosing a strategy sets the market only when it allows exactly one", () => {
  it("one market: the market follows", async () => {
    const { container } = await opened();
    expect(field<HTMLSelectElement>(container, "market").value).toBe("crypto");
    choose(container, "strat-range");
    expect(field<HTMLSelectElement>(container, "market").value).toBe("forex");
  });

  it("several markets: the market stays what it was", async () => {
    const { container } = await opened();
    choose(container, "strat-range");
    choose(container, "strat-breakout");
    expect(field<HTMLSelectElement>(container, "market").value).toBe("forex");
  });
});

describe("choosing a strategy fills the risk % from its limit, never over what was typed", () => {
  it("fills an empty field", async () => {
    const { container } = await opened();
    choose(container, "strat-range");
    expect(field(container, "riskPercent").value).toBe("0.5");
  });

  it("writes it with Persian digits on the Persian page", async () => {
    const { container } = await opened("fa");
    choose(container, "strat-range");
    expect(field(container, "riskPercent").value).toBe("۰٫۵");
  });

  it("sends what the Persian page shows, and the server's schema reads it as the same number", async () => {
    const { container } = await opened("fa", { "POST /api/trade-plans": { tradePlan: { id: "p" } } });
    choose(container, "strat-range");
    type(form(container), { symbol: "EURUSD", direction: "long", bias: "رنج", entryZone: "1.0850" });
    expect(field(container, "riskPercent").value).toBe("۰٫۵");
    fireEvent.click(screen.getByRole("button", { name: "ذخیره پلن" }));

    await waitFor(() => expect(posts("POST /api/trade-plans")).toHaveLength(1));
    const body = posts("POST /api/trade-plans")[0].body;
    expect(body?.riskPercent).toBe("۰٫۵");
    expect(tradePlanCreateSchema.parse(body).riskPercent).toBe(0.5);
    expect(tradePlanCreateSchema.parse(body).strategyId).toBe("strat-range");
  });

  it("does the same for Persian digits the trader typed", async () => {
    const { container } = await opened("fa", { "POST /api/trade-plans": { tradePlan: { id: "p" } } });
    type(form(container), { symbol: "EURUSD", direction: "short", bias: "رنج", entryZone: "1.0850", riskPercent: "۱٫۲۵" });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره پلن" }));

    await waitFor(() => expect(posts("POST /api/trade-plans")).toHaveLength(1));
    expect(tradePlanCreateSchema.parse(posts("POST /api/trade-plans")[0].body).riskPercent).toBe(1.25);
  });

  it("leaves a typed value alone", async () => {
    const { container } = await opened();
    type(form(container), { riskPercent: "2" });
    choose(container, "strat-range");
    expect(field(container, "riskPercent").value).toBe("2");
  });

  it("changes a value it filled when another strategy is chosen, and clears it for 'no strategy'", async () => {
    const { container } = await opened();
    choose(container, "strat-range");
    choose(container, "strat-tight");
    expect(field(container, "riskPercent").value).toBe("0.25");
    choose(container, "strat-breakout");
    expect(field(container, "riskPercent").value).toBe("");
    choose(container, "strat-range");
    choose(container, "");
    expect(field(container, "riskPercent").value).toBe("");
  });

  it("keeps a value the trader edited after it was filled", async () => {
    const { container } = await opened();
    choose(container, "strat-range");
    type(form(container), { riskPercent: "0.4" });
    choose(container, "strat-tight");
    expect(field(container, "riskPercent").value).toBe("0.4");
    choose(container, "");
    expect(field(container, "riskPercent").value).toBe("0.4");
  });
});

describe("the strategy's invalidation rules are one-click suggestions", () => {
  const suggestion = (name: string) => screen.getByRole("button", { name });

  it("puts a rule into an empty invalidation field", async () => {
    const { container } = await opened();
    choose(container, "strat-range");
    fireEvent.click(suggestion("Close outside the range"));
    expect(field<HTMLTextAreaElement>(container, "invalidationRule").value).toBe("Close outside the range");
  });

  it("adds the next rule on a new line and does not add the same rule twice", async () => {
    const { container } = await opened();
    choose(container, "strat-range");
    fireEvent.click(suggestion("Close outside the range"));
    fireEvent.click(suggestion("Two closes beyond the high"));
    fireEvent.click(suggestion("Close outside the range"));
    expect(field<HTMLTextAreaElement>(container, "invalidationRule").value).toBe("Close outside the range\nTwo closes beyond the high");
  });

  it("keeps what the trader typed and adds the rule after it", async () => {
    const { container } = await opened();
    type(form(container), { invalidationRule: "A close below 2900" });
    choose(container, "strat-range");
    fireEvent.click(suggestion("Two closes beyond the high"));
    expect(field<HTMLTextAreaElement>(container, "invalidationRule").value).toBe("A close below 2900\nTwo closes beyond the high");
  });

  it("offers none for a strategy without invalidation rules, and none without a strategy", async () => {
    const { container } = await opened();
    expect(screen.queryByText("From the strategy:")).toBeNull();
    choose(container, "strat-breakout");
    expect(screen.queryByText("From the strategy:")).toBeNull();
  });

  it("is sent with the plan", async () => {
    const { container } = await opened("en", { "POST /api/trade-plans": { tradePlan: { id: "p" } } });
    choose(container, "strat-range");
    fireEvent.click(suggestion("Close outside the range"));
    type(form(container), { symbol: "EURUSD", direction: "long", bias: "Range", entryZone: "1.0850" });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(posts("POST /api/trade-plans")).toHaveLength(1));
    expect(posts("POST /api/trade-plans")[0].body?.invalidationRule).toBe("Close outside the range");
  });
});

describe("the strategy's checklist becomes tick boxes in the plan's checklist", () => {
  it("adds one tick box per item, next to the three built-in ones", async () => {
    const { container } = await opened();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    choose(container, "strat-range");
    expect(screen.getByRole("checkbox", { name: "Waited for the sweep" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Volume confirmed" })).not.toBeChecked();
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
  });

  it("stores each item as a boolean under its own key, beside the built-in keys and the direction", async () => {
    const { container } = await opened("en", { "POST /api/trade-plans": { tradePlan: { id: "p" } } });
    choose(container, "strat-range");
    fireEvent.click(screen.getByRole("checkbox", { name: "Waited for the sweep" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Strategy / playbook matched" }));
    type(form(container), { symbol: "EURUSD", direction: "short", bias: "Range", entryZone: "1.0850" });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));

    await waitFor(() => expect(posts("POST /api/trade-plans")).toHaveLength(1));
    const checklist = posts("POST /api/trade-plans")[0].body?.checklist as Record<string, unknown>;
    expect(checklist).toEqual({
      newsChecked: false,
      riskCalculated: false,
      strategyMatched: true,
      "strategy:Waited for the sweep": true,
      "strategy:Volume confirmed": false,
      direction: "short"
    });
    for (const [key, value] of Object.entries(checklist)) if (key !== "direction") expect(typeof value, key).toBe("boolean");
  });

  it("does not ask a question twice: an item the form already has as a built-in tick box is not added again", async () => {
    const twice = { ...RANGE, id: "strat-twice", name: "Asks twice", checklist: ["News context checked", "risk amount calculated", "Volume confirmed"] };
    const { container } = await open("en", { "POST /api/trade-plans": { tradePlan: { id: "p" } } }, [], {}, [twice]);
    await screen.findByRole("option", { name: "Asks twice" });
    choose(container, "strat-twice");
    expect(screen.getAllByRole("checkbox").map((box) => box.closest("label")?.textContent)).toEqual(["News context checked", "Risk amount calculated", "Strategy / playbook matched", "Volume confirmed"]);

    type(form(container), { symbol: "EURUSD", direction: "long", bias: "Range", entryZone: "1.0850" });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(posts("POST /api/trade-plans")).toHaveLength(1));
    expect(Object.keys(posts("POST /api/trade-plans")[0].body?.checklist as object).sort()).toEqual(["direction", "newsChecked", "riskCalculated", "strategy:Volume confirmed", "strategyMatched"]);
  });

  it("does the same in Persian, against the Persian built-in labels", async () => {
    const twice = { ...RANGE, id: "strat-twice", name: "Asks twice", checklist: ["زمینه خبری بررسی شد", "حجم تأیید شد"] };
    const { container } = await open("fa", {}, [], {}, [twice]);
    await screen.findByRole("option", { name: "Asks twice" });
    choose(container, "strat-twice");
    expect(screen.getAllByRole("checkbox").map((box) => box.closest("label")?.textContent)).toEqual(["زمینه خبری بررسی شد", "مبلغ ریسک محاسبه شد", "استراتژی / پلی‌بوک تطبیق داده شد", "حجم تأیید شد"]);
  });

  it("drops the items of a strategy that is no longer chosen", async () => {
    const { container } = await opened("en", { "POST /api/trade-plans": { tradePlan: { id: "p" } } });
    choose(container, "strat-range");
    fireEvent.click(screen.getByRole("checkbox", { name: "Volume confirmed" }));
    choose(container, "strat-breakout");
    expect(screen.queryByRole("checkbox", { name: "Volume confirmed" })).toBeNull();
    type(form(container), { symbol: "BTCUSDT", direction: "long", bias: "Break", entryZone: "65000" });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));

    await waitFor(() => expect(posts("POST /api/trade-plans")).toHaveLength(1));
    expect(Object.keys(posts("POST /api/trade-plans")[0].body?.checklist as object).sort()).toEqual(["direction", "newsChecked", "riskCalculated", "strategy:Waited for the sweep", "strategyMatched"]);
  });

  it("keeps a plan with an unticked strategy item incomplete, on the card, as an unticked built-in item would", async () => {
    const ticked = { newsChecked: true, riskCalculated: true, strategyMatched: true, direction: "long" };
    serve(routes({}, [
      plan({ id: "a", symbol: "AAAUSD", invalidationRule: "x", riskPercent: 0.5, checklist: { ...ticked, "strategy:Volume confirmed": false } }),
      plan({ id: "b", symbol: "BBBUSD", invalidationRule: "x", riskPercent: 0.5, checklist: { ...ticked, "strategy:Volume confirmed": true } })
    ]));
    render(<TradePlansScreen locale="en" messages={en} />);
    await screen.findByText("AAAUSD");
    const [first, second] = ["AAAUSD", "BBBUSD"].map((symbol) => screen.getByText(symbol).closest("div.rounded-md") as HTMLElement);
    expect(first).toHaveTextContent("Incomplete");
    expect(first).toHaveTextContent("Missing: all checklist items ticked");
    expect(second).toHaveTextContent("Complete");
  });

  it("clears the tick boxes of the strategy after a plan is saved", async () => {
    const { container } = await opened("en", { "POST /api/trade-plans": { tradePlan: { id: "p" } } });
    choose(container, "strat-range");
    type(form(container), { symbol: "EURUSD", direction: "long", bias: "Range", entryZone: "1.0850" });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(posts("POST /api/trade-plans")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: "Volume confirmed" })).toBeNull());
    expect(field<HTMLSelectElement>(container, "strategyId").value).toBe("");
    expect(field(container, "riskPercent").value).toBe("");
  });
});

describe("a limit violation is visible before the plan is saved", () => {
  it("has a status region that screen readers announce, empty while nothing is over a limit", async () => {
    await opened();
    const region = warnings();
    expect(region).toBeEmptyDOMElement();
    expect(region.getAttribute("aria-live")).not.toBe("off");
  });

  it("states both numbers and the strategy's name for a strategy limit (English)", async () => {
    const { container } = await opened();
    choose(container, "strat-range");
    type(form(container), { riskPercent: "1" });
    expect(warnings()).toHaveTextContent(`This plan's risk is 1%; the limit of strategy "Range fade" is 0.5%.`);
  });

  it("says it in Persian on the Persian page, with the audit's wording", async () => {
    const { container } = await opened("fa");
    choose(container, "strat-range");
    type(form(container), { riskPercent: "1" });
    expect(warnings()).toHaveTextContent("ریسک این پلن ۱٪ است؛ سقف استراتژی «Range fade» ۰٫۵٪ است.");
    expect(englishLeaks(warnings(), ["Range fade"])).toEqual([]);
  });

  it("reads Persian digits typed into the risk field", async () => {
    const { container } = await opened("fa");
    choose(container, "strat-range");
    type(form(container), { riskPercent: "۲٫۵" });
    expect(warnings()).toHaveTextContent("ریسک این پلن ۲٫۵٪ است؛ سقف استراتژی «Range fade» ۰٫۵٪ است.");
  });

  it("follows what is typed: gone again when the risk is back within the limit", async () => {
    const { container } = await opened();
    choose(container, "strat-range");
    type(form(container), { riskPercent: "1" });
    expect(warnings()).not.toBeEmptyDOMElement();
    type(form(container), { riskPercent: "0.5" });
    expect(warnings()).toBeEmptyDOMElement();
  });

  it("lists every limit that is passed", async () => {
    const { container } = await opened();
    choose(container, "strat-range");
    type(form(container), { riskPercent: "2.5" });
    const items = within(warnings()).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      `This plan's risk is 2.5%; the limit of strategy "Range fade" is 0.5%.`,
      `This plan's risk is 2.5%; the daily loss limit of strategy "Range fade" is 2%.`
    ]);
  });

  it("uses the limits in the account settings when there is no strategy, and says so", async () => {
    const { container } = await opened();
    type(form(container), { riskPercent: "2" });
    expect(warnings()).toHaveTextContent("This plan's risk is 2%; the risk per trade limit in your settings is 1%.");
    expect(warnings()).not.toHaveTextContent("daily loss");
  });

  it("lets the strategy's limit win over the settings", async () => {
    const { container } = await opened();
    choose(container, "strat-tight");
    type(form(container), { riskPercent: "0.5" });
    expect(warnings()).toHaveTextContent(`the limit of strategy "Tight range" is 0.25%`);
    expect(warnings()).not.toHaveTextContent("in your settings");
  });

  it("is a warning only: the plan can still be saved", async () => {
    const { container } = await opened("en", { "POST /api/trade-plans": { tradePlan: { id: "p" } } });
    choose(container, "strat-range");
    type(form(container), { symbol: "EURUSD", direction: "long", bias: "Range", entryZone: "1.0850", riskPercent: "5" });
    expect(warnings()).toHaveTextContent("You can still save the plan");
    const save = screen.getByRole("button", { name: "Save plan" });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(posts("POST /api/trade-plans")).toHaveLength(1));
    expect(posts("POST /api/trade-plans")[0].body?.riskPercent).toBe("5");
  });

  it("sits next to the Save button, inside the form", async () => {
    const { container } = await opened();
    expect(form(container).contains(warnings())).toBe(true);
    expect(warnings().compareDocumentPosition(screen.getByRole("button", { name: "Save plan" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("counts the plans that are planned or active, not closed, canceled or sample ones", async () => {
    const plans = [
      plan({ id: "p1", status: "planned" }),
      plan({ id: "p2", status: "active" }),
      plan({ id: "p3", status: "closed" }),
      plan({ id: "p4", status: "canceled" }),
      plan({ id: "p5", status: "planned", isSample: true })
    ];
    // Three allowed, two open besides this one: no warning (the sample plan and the closed ones do not count).
    const first = await opened("en", {}, plans);
    await screen.findByText("Planning board");
    choose(first.container, "strat-range");
    expect(warnings()).toBeEmptyDOMElement();
    cleanup();

    // Two allowed, two open: this plan would be the third.
    const two = { ...RANGE, maxOpenPositions: 2 };
    serve(routes({}, plans, [two]));
    const view = render(<TradePlansScreen locale="en" messages={en} />);
    await screen.findByText("Planning board");
    await screen.findByRole("option", { name: "Range fade" });
    choose(view.container, "strat-range");
    expect(warnings()).toHaveTextContent(`With this plan you would have 3 planned or active plans; the open positions limit of strategy "Range fade" is 2.`);
  });

  it("says nothing about open positions until the plans have loaded", async () => {
    serve(routes({ "GET /api/trade-plans": () => new Promise(() => undefined) }, [], [{ ...RANGE, maxOpenPositions: 1 }]));
    const { container } = render(<TradePlansScreen locale="en" messages={en} />);
    await screen.findByRole("option", { name: "Range fade" });
    choose(container, "strat-range");
    expect(warnings()).toBeEmptyDOMElement();
  });

  it("shows no warning and no error when the settings cannot be read", async () => {
    const { container } = await open("en", {
      "GET /api/users/me/settings": () => {
        throw new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
      }
    });
    await screen.findByRole("option", { name: "Breakout" });
    type(form(container), { riskPercent: "50" });
    expect(warnings()).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).toBeNull();
    // The strategy's own limit still applies.
    choose(container, "strat-range");
    expect(warnings()).toHaveTextContent(`the limit of strategy "Range fade" is 0.5%`);
  });

  it("shows no warning for a risk that is empty or not a number", async () => {
    const { container } = await opened();
    choose(container, "strat-breakout");
    type(form(container), { riskPercent: "abc" });
    expect(warnings()).toBeEmptyDOMElement();
  });
});
