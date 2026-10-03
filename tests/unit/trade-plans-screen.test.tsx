import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const posts = (key: string) => calls.filter((call) => call.key === key);

function serve(routes: Record<string, unknown | (() => unknown)>) {
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
  strategy: null,
  ...overrides
});

function form(container: HTMLElement) {
  return container.querySelector("form") as HTMLFormElement;
}

function type(target: HTMLFormElement, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    const field = target.elements.namedItem(name) as HTMLInputElement;
    fireEvent.change(field, { target: { value } });
  }
}

describe("plan form errors are shown, not swallowed", () => {
  it("names the fields the server rejected", async () => {
    serve({
      "GET /api/trade-plans": { tradePlans: [] },
      "POST /api/trade-plans": () => {
        throw new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: { bias: ["Too small"], entryZone: ["Too small"] } });
      }
    });
    const { container } = render(<TradePlansScreen locale="en" messages={en} />);
    const save = await screen.findByRole("button", { name: "Save plan" });
    type(form(container), { symbol: "ETHUSDT", direction: "long", bias: "x", entryZone: "3000" });
    fireEvent.click(save);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Bias/);
    expect(alert).toHaveTextContent(/Entry zone/);
  });

  it("shows a failed load", async () => {
    serve({
      "GET /api/trade-plans": () => {
        throw new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
      }
    });
    render(<TradePlansScreen locale="en" messages={en} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again in a moment.");
  });

  it("shows a failed conversion", async () => {
    serve({
      "GET /api/trade-plans": { tradePlans: [plan({ checklist: { direction: "long" } })] },
      "POST /api/trade-plans/plan-1/convert": () => {
        throw new ApiClientError("This plan was already converted to a trade", 409, "CONFLICT");
      }
    });
    const { container } = render(<TradePlansScreen locale="en" messages={en} />);
    fireEvent.click(await screen.findByRole("button", { name: "Convert to trade" }));
    const convert = container.querySelectorAll("form")[1] as HTMLFormElement;
    type(convert, { entryPrice: "65000", quantity: "0.1" });
    fireEvent.click(screen.getByRole("button", { name: "Record trade" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This plan was already converted to a trade.");
  });
});

// The server's error text is English whatever the page language; the screen picks its own copy by the error code.
describe("API errors are shown in the page language", () => {
  const FA_ONLY = /^[^A-Za-z]+$/;

  async function failSave(locale: "fa" | "en", error: unknown) {
    serve({
      "GET /api/trade-plans": { tradePlans: [] },
      "POST /api/trade-plans": () => {
        throw error;
      }
    });
    const { container } = render(<TradePlansScreen locale={locale} messages={locale === "fa" ? fa : en} />);
    const save = await screen.findByRole("button", { name: locale === "fa" ? "ذخیره پلن" : "Save plan" });
    type(form(container), { symbol: "ETHUSDT", direction: "long", bias: "Constructive", entryZone: "3000" });
    fireEvent.click(save);
    return screen.findByRole("alert");
  }

  it.each([
    ["409 already converted", new ApiClientError("This plan was already converted to a trade", 409, "CONFLICT"), "این پلن قبلاً به معامله تبدیل شده است.", "This plan was already converted to a trade."],
    ["429 rate limit", new ApiClientError("Too many requests. Please try again later.", 429, "RATE_LIMITED"), "تعداد تلاش‌ها بیش از حد مجاز است. یک دقیقه صبر کنید و دوباره امتحان کنید.", "Too many attempts. Wait a minute and try again."],
    ["500 server error", new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"), "مشکلی پیش آمد. کمی بعد دوباره تلاش کنید.", "Something went wrong. Please try again in a moment."],
    ["422 without field errors", new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { formErrors: [], fieldErrors: {} }), "برخی فیلدها معتبر نیستند. آن‌ها را بررسی کنید و دوباره تلاش کنید.", "Some fields are not valid. Check them and try again."],
    ["404 plan gone", new ApiClientError("Trade plan not found", 404, "NOT_FOUND"), "این پلن دیگر وجود ندارد. صفحه را دوباره بارگذاری کنید.", "This plan no longer exists. Reload the page."],
    ["dropped connection", new TypeError("Failed to fetch"), "اتصال به سرور برقرار نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.", "Could not reach the server. Check your connection and try again."],
    ["a plain Error", new Error("Cannot read properties of undefined"), "مشکلی پیش آمد. کمی بعد دوباره تلاش کنید.", "Something went wrong. Please try again in a moment."]
  ])("%s", async (_name, error, persian, english) => {
    const alertFa = await failSave("fa", error);
    expect(alertFa).toHaveTextContent(persian);
    expect(alertFa.textContent).toMatch(FA_ONLY);
    cleanup();
    (apiFetch as Mock).mockReset();

    const alertEn = await failSave("en", error);
    expect(alertEn).toHaveTextContent(english);
    expect((error as Error).message).not.toBe(alertEn.textContent);
  });

  it("names the rejected fields in Persian, joined with the Persian comma", async () => {
    serve({
      "GET /api/trade-plans": { tradePlans: [] },
      "POST /api/trade-plans": () => {
        throw new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: { bias: ["Too small"], entryZone: ["Too small"] } });
      }
    });
    const { container } = render(<TradePlansScreen locale="fa" messages={fa} />);
    const save = await screen.findByRole("button", { name: "ذخیره پلن" });
    type(form(container), { symbol: "ETHUSDT", direction: "long", bias: "x", entryZone: "3000" });
    fireEvent.click(save);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("این فیلدها را بررسی کنید: دیدگاه، ناحیه ورود");
  });
});

describe("plan form required fields", () => {
  it("marks symbol, direction, bias and entry zone as required", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [] } });
    const { container } = render(<TradePlansScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "Save plan" });
    const f = form(container);
    for (const name of ["symbol", "direction", "bias", "entryZone"]) {
      expect((f.elements.namedItem(name) as HTMLInputElement).required, name).toBe(true);
    }
    expect(screen.getByText("Symbol *")).toBeInTheDocument();
    expect(screen.getByText("Direction *")).toBeInTheDocument();
  });

  it("does not post an empty plan, and does not guess a direction", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [] }, "POST /api/trade-plans": { tradePlan: { id: "p" } } });
    const { container } = render(<TradePlansScreen locale="en" messages={en} />);
    fireEvent.click(await screen.findByRole("button", { name: "Save plan" }));
    expect((form(container).elements.namedItem("direction") as HTMLSelectElement).value).toBe("");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(posts("POST /api/trade-plans")).toHaveLength(0);
  });

  it("sends the chosen direction with the plan and keeps the checklist flags", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [] }, "POST /api/trade-plans": { tradePlan: { id: "p" } } });
    const { container } = render(<TradePlansScreen locale="en" messages={en} />);
    const save = await screen.findByRole("button", { name: "Save plan" });
    type(form(container), { symbol: "ETHUSDT", direction: "short", bias: "نزولی زیر حمایت", entryZone: "3000-3050" });
    fireEvent.click(save);

    await waitFor(() => expect(posts("POST /api/trade-plans")).toHaveLength(1));
    expect(posts("POST /api/trade-plans")[0].body?.checklist).toEqual({ newsChecked: false, riskCalculated: false, strategyMatched: false, direction: "short" });
  });
});

// A plan only counts as complete with an invalidation rule, a risk amount or % and every checklist box ticked.
describe("plan form: the invalidation rule is in the section that is open from the start", () => {
  it("sits next to the risk fields, not in the collapsed notes section", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [] } });
    const { container } = render(<TradePlansScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "Save plan" });

    const invalidation = form(container).elements.namedItem("invalidationRule") as HTMLTextAreaElement;
    const section = invalidation.closest("details") as HTMLDetailsElement;
    expect(section).toHaveAttribute("open");
    expect(section.contains(form(container).elements.namedItem("riskAmount") as HTMLElement)).toBe(true);
    // The notes section stays collapsed and keeps the other free-text fields.
    const collapsed = (form(container).elements.namedItem("notes") as HTMLTextAreaElement).closest("details") as HTMLDetailsElement;
    expect(collapsed).not.toHaveAttribute("open");
    expect(collapsed.contains(invalidation)).toBe(false);
  });

  it("is still sent with the plan", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [] }, "POST /api/trade-plans": { tradePlan: { id: "p" } } });
    const { container } = render(<TradePlansScreen locale="en" messages={en} />);
    const save = await screen.findByRole("button", { name: "Save plan" });
    type(form(container), { symbol: "ETHUSDT", direction: "long", bias: "Constructive", entryZone: "3000", invalidationRule: "A close below 2900" });
    fireEvent.click(save);

    await waitFor(() => expect(posts("POST /api/trade-plans")).toHaveLength(1));
    expect(posts("POST /api/trade-plans")[0].body?.invalidationRule).toBe("A close below 2900");
  });
});

describe("an incomplete plan says what is missing", () => {
  const ticked = { newsChecked: true, riskCalculated: true, strategyMatched: true, direction: "long" };

  it("lists the invalidation rule, the risk and the checklist when none of them is there", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [plan()] } });
    render(<TradePlansScreen locale="en" messages={en} />);
    await screen.findByText("BTCUSDT");
    const missing = screen.getByText(/^Missing:/);
    expect(missing).toHaveTextContent("Missing: invalidation rule, risk amount or risk %, all checklist items ticked");
  });

  it("lists only what is still missing", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [plan({ invalidationRule: "A close below 2900", riskPercent: 0.5, checklist: { ...ticked, riskCalculated: false } })] } });
    render(<TradePlansScreen locale="en" messages={en} />);
    await screen.findByText("BTCUSDT");
    expect(screen.getByText(/^Missing:/)).toHaveTextContent("Missing: all checklist items ticked");
    expect(screen.queryByText(/invalidation rule,/)).toBeNull();
  });

  it("says nothing is missing on a complete plan", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [plan({ invalidationRule: "A close below 2900", riskAmount: 100, checklist: ticked })] } });
    render(<TradePlansScreen locale="en" messages={en} />);
    await screen.findByText("BTCUSDT");
    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.queryByText(/^Missing:/)).toBeNull();
  });

  it("speaks Persian on the Persian page", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [plan()] } });
    render(<TradePlansScreen locale="fa" messages={fa} />);
    await screen.findByText("BTCUSDT");
    const missing = screen.getByText(/^کم دارد:/);
    expect(missing).toHaveTextContent("کم دارد: قانون ابطال، مبلغ یا درصد ریسک، تیک همه موارد چک‌لیست");
    expect(missing.textContent).toMatch(/^[^A-Za-z]+$/);
  });
});

describe("plan form language", () => {
  it("is Persian on the Persian page", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [plan({ bias: "نزولی زیر حمایت", invalidationRule: "بسته شدن بالای مقاومت", checklist: { direction: "short" } })] } });
    const { container } = render(<TradePlansScreen locale="fa" messages={fa} />);
    await screen.findByRole("button", { name: "ذخیره پلن" });

    expect(screen.getByText("نماد *")).toBeInTheDocument();
    expect(screen.getByText("جهت *")).toBeInTheDocument();
    expect(screen.getByText("ناحیه ورود *")).toBeInTheDocument();
    for (const english of ["Market", "Symbol", "Bias", "Entry zone", "Stop loss", "Take profit", "Risk amount", "Invalidation:"]) {
      expect(container.textContent, english).not.toContain(english);
    }
    // The plan card: status, market and direction badges and the invalidation line, all in Persian.
    expect(container.textContent).toContain("برنامه‌ریزی‌شده");
    expect(container.textContent).toContain("کریپتو");
    expect(container.textContent).toContain("شورت");
    expect(container.textContent).not.toMatch(/\bplanned\b|\bcrypto\b/);
  });
});

describe("converting a plan", () => {
  it("lets the trader pick Long or Short for an older plan, starting from the side the bias wording suggests", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [plan({ bias: "نزولی زیر حمایت", checklist: {} })] } });
    const { container } = render(<TradePlansScreen locale="fa" messages={fa} />);
    fireEvent.click(await screen.findByRole("button", { name: "تبدیل به معامله" }));

    const direction = (container.querySelectorAll("form")[1] as HTMLFormElement).elements.namedItem("direction") as HTMLSelectElement;
    expect(direction.value).toBe("short");
    expect(direction).toBeRequired();
    expect(Array.from(direction.options).map((option) => option.value)).toEqual(["long", "short"]);
    expect(Array.from(direction.options).map((option) => option.textContent)).toEqual(["لانگ", "شورت"]);
    expect(screen.getByText("سمت معامله *")).toBeInTheDocument();
  });

  it("starts an older plan with a bullish bias at Long", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [plan({ bias: "Constructive above 65k", checklist: {} })] } });
    const { container } = render(<TradePlansScreen locale="en" messages={en} />);
    fireEvent.click(await screen.findByRole("button", { name: "Convert to trade" }));
    expect(((container.querySelectorAll("form")[1] as HTMLFormElement).elements.namedItem("direction") as HTMLSelectElement).value).toBe("long");
  });

  it("saves the picked direction into the older plan's checklist before converting it", async () => {
    serve({
      "GET /api/trade-plans": { tradePlans: [plan({ bias: "Bearish below 60k", checklist: { newsChecked: true, riskCalculated: false, strategyMatched: false } })] },
      "PATCH /api/trade-plans": { tradePlan: { id: "plan-1" } },
      "POST /api/trade-plans/plan-1/convert": { trade: { id: "t1" }, planId: "plan-1" }
    });
    const { container } = render(<TradePlansScreen locale="en" messages={en} />);
    fireEvent.click(await screen.findByRole("button", { name: "Convert to trade" }));
    const convert = container.querySelectorAll("form")[1] as HTMLFormElement;
    // The wording says short; the trader says long.
    type(convert, { direction: "long", entryPrice: "65000", quantity: "0.1" });
    fireEvent.click(screen.getByRole("button", { name: "Record trade" }));

    await waitFor(() => expect(posts("POST /api/trade-plans/plan-1/convert")).toHaveLength(1));
    const keys = calls.map((call) => call.key);
    expect(keys.indexOf("PATCH /api/trade-plans")).toBeGreaterThan(-1);
    expect(keys.indexOf("PATCH /api/trade-plans")).toBeLessThan(keys.indexOf("POST /api/trade-plans/plan-1/convert"));
    expect(posts("PATCH /api/trade-plans")[0].body).toEqual({
      id: "plan-1",
      status: "planned",
      checklist: { newsChecked: true, riskCalculated: false, strategyMatched: false, direction: "long" }
    });
    // The convert request itself carries no direction (the schema is strict); the plan does.
    expect(posts("POST /api/trade-plans/plan-1/convert")[0].body).not.toHaveProperty("direction");
  });

  // The update schema fills status "planned" when the body has none, so the PATCH must carry the plan's own status.
  it("keeps an active plan active when it saves the picked direction", async () => {
    serve({
      "GET /api/trade-plans": { tradePlans: [plan({ status: "active", checklist: {} })] },
      "PATCH /api/trade-plans": { tradePlan: { id: "plan-1" } },
      "POST /api/trade-plans/plan-1/convert": { trade: { id: "t1" }, planId: "plan-1" }
    });
    const { container } = render(<TradePlansScreen locale="en" messages={en} />);
    fireEvent.click(await screen.findByRole("button", { name: "Convert to trade" }));
    type(container.querySelectorAll("form")[1] as HTMLFormElement, { direction: "short", entryPrice: "65000", quantity: "0.1" });
    fireEvent.click(screen.getByRole("button", { name: "Record trade" }));

    await waitFor(() => expect(posts("PATCH /api/trade-plans")).toHaveLength(1));
    expect(posts("PATCH /api/trade-plans")[0].body).toMatchObject({ id: "plan-1", status: "active" });
  });

  it("does not convert when the direction could not be saved", async () => {
    serve({
      "GET /api/trade-plans": { tradePlans: [plan({ checklist: {} })] },
      "PATCH /api/trade-plans": () => {
        throw new ApiClientError("Too many requests. Please try again later.", 429, "RATE_LIMITED");
      },
      "POST /api/trade-plans/plan-1/convert": { trade: { id: "t1" }, planId: "plan-1" }
    });
    const { container } = render(<TradePlansScreen locale="en" messages={en} />);
    fireEvent.click(await screen.findByRole("button", { name: "Convert to trade" }));
    type(container.querySelectorAll("form")[1] as HTMLFormElement, { entryPrice: "65000", quantity: "0.1" });
    fireEvent.click(screen.getByRole("button", { name: "Record trade" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts");
    expect(posts("POST /api/trade-plans/plan-1/convert")).toHaveLength(0);
    // The form stays open and usable for another try.
    expect(screen.getByRole("button", { name: "Record trade" })).toBeEnabled();
  });

  it("asks nothing and saves nothing extra for a plan that already has a direction", async () => {
    serve({
      "GET /api/trade-plans": { tradePlans: [plan({ checklist: { direction: "short" } })] },
      "POST /api/trade-plans/plan-1/convert": { trade: { id: "t1" }, planId: "plan-1" }
    });
    const { container } = render(<TradePlansScreen locale="en" messages={en} />);
    fireEvent.click(await screen.findByRole("button", { name: "Convert to trade" }));
    const convert = container.querySelectorAll("form")[1] as HTMLFormElement;
    expect(convert.elements.namedItem("direction")).toBeNull();
    type(convert, { entryPrice: "65000", quantity: "0.1" });
    fireEvent.click(screen.getByRole("button", { name: "Record trade" }));

    await waitFor(() => expect(posts("POST /api/trade-plans/plan-1/convert")).toHaveLength(1));
    expect(posts("PATCH /api/trade-plans")).toHaveLength(0);
  });

  it("uses the plan's chosen direction for the side it shows", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [plan({ bias: "Bearish below 60k", checklist: { direction: "long" } })] } });
    render(<TradePlansScreen locale="en" messages={en} />);
    fireEvent.click(await screen.findByRole("button", { name: "Convert to trade" }));
    expect(screen.getByText(/Trade side: Long/)).toBeInTheDocument();
  });

  it("records the trade once when Record trade is pressed twice", async () => {
    let finish: (value: unknown) => void = () => undefined;
    serve({
      "GET /api/trade-plans": { tradePlans: [plan({ checklist: { direction: "long" } })] },
      "POST /api/trade-plans/plan-1/convert": () => new Promise((resolve) => (finish = resolve))
    });
    const { container } = render(<TradePlansScreen locale="en" messages={en} />);
    fireEvent.click(await screen.findByRole("button", { name: "Convert to trade" }));
    const convert = container.querySelectorAll("form")[1] as HTMLFormElement;
    type(convert, { entryPrice: "65000", quantity: "0.1" });

    const record = screen.getByRole("button", { name: "Record trade" });
    fireEvent.click(record);
    const busy = await screen.findByRole("button", { name: "Converting..." });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    fireEvent.submit(convert);

    expect(posts("POST /api/trade-plans/plan-1/convert")).toHaveLength(1);
    finish({ trade: { id: "t1" }, planId: "plan-1" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Converting..." })).toBeNull());
  });
});

describe("the Persian page calls a plan پلن", () => {
  // "برنامه‌ریزی" (the activity of planning, and the Planned status) keeps its word; a plan itself is never برنامه.
  const PLAN_AS_PROGRAM = /برنامه(?!‌ریز)/;

  it("uses the glossary word in the form, the card, the convert form and the errors", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [plan({ bias: "نزولی زیر حمایت", invalidationRule: "بسته شدن بالای مقاومت", checklist: {} })] } });
    const { container } = render(<TradePlansScreen locale="fa" messages={fa} />);
    fireEvent.click(await screen.findByRole("button", { name: "تبدیل به معامله" }));

    // The page title comes from the shared messages file (pages.plans), which this screen does not own.
    expect(container.textContent!.replace(fa.pages.plans, "")).not.toMatch(PLAN_AS_PROGRAM);
    expect(screen.getByText("پلن جدید")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ذخیره پلن" })).toBeInTheDocument();
  });

  it("reads the older-plan hint as one clear instruction about long or short", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [plan({ checklist: {} })] } });
    render(<TradePlansScreen locale="fa" messages={fa} />);
    fireEvent.click(await screen.findByRole("button", { name: "تبدیل به معامله" }));

    const hint = screen.getByText(/برای این پلن قدیمی/);
    expect(hint).toHaveTextContent("برای این پلن قدیمی جهتی ثبت نشده است. لانگ یا شورت را خودتان انتخاب کنید؛ همین انتخاب در پلن ذخیره می‌شود و معامله با آن ثبت می‌شود.");
    expect(hint.textContent).not.toMatch(PLAN_AS_PROGRAM);
  });

  it("says the same in English, with plan as the noun", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [plan({ checklist: {} })] } });
    render(<TradePlansScreen locale="en" messages={en} />);
    fireEvent.click(await screen.findByRole("button", { name: "Convert to trade" }));
    expect(screen.getByText(/saved before directions existed/)).toBeInTheDocument();
  });

  it.each(["CONFLICT", "NOT_FOUND"] as const)("the %s message names the plan with the glossary word", async (code) => {
    const status = code === "CONFLICT" ? 409 : 404;
    serve({
      "GET /api/trade-plans": { tradePlans: [] },
      "POST /api/trade-plans": () => {
        throw new ApiClientError("Server text", status, code);
      }
    });
    const { container } = render(<TradePlansScreen locale="fa" messages={fa} />);
    const save = await screen.findByRole("button", { name: "ذخیره پلن" });
    type(form(container), { symbol: "ETHUSDT", direction: "long", bias: "Constructive", entryZone: "3000" });
    fireEvent.click(save);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("این پلن");
    expect(alert.textContent).not.toMatch(PLAN_AS_PROGRAM);
  });
});

// Product audit, 2026-10-01 (item 11): an empty page says what it is for and what to do next.
describe("a plans page with no plans says what a plan is for", () => {
  it("English: one sentence that points at the form on the same page, and no loading text once loaded", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [] } });
    const { container } = render(<TradePlansScreen locale="en" messages={en} />);
    expect(await screen.findByText("No plans yet")).toBeInTheDocument();
    expect(container.textContent).toContain("Write down your setup, what would cancel it and how much you risk before you trade: use the New plan form to create your first plan.");
    // The form is right here, so the sentence is the pointer: no link away from the page.
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("New plan")).toBeInTheDocument();
  });

  it("Persian: the same, in Persian, pointing at the form by its title", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [] } });
    const { container } = render(<TradePlansScreen locale="fa" messages={fa} />);
    expect(await screen.findByText("هنوز پلنی ثبت نشده است")).toBeInTheDocument();
    expect(container.textContent).toContain("پیش از هر معامله، سناریو، شرط ابطال و میزان ریسک را بنویسید؛ اولین پلن را با فرم «پلن جدید» بسازید.");
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("پلن جدید")).toBeInTheDocument();
    expect(englishLeaks(container)).toEqual([]);
  });

  it("is not shown when there are plans", async () => {
    serve({ "GET /api/trade-plans": { tradePlans: [plan()] } });
    render(<TradePlansScreen locale="en" messages={en} />);
    await screen.findByText("BTCUSDT");
    expect(screen.queryByText("No plans yet")).toBeNull();
  });

  it("is not shown while the plans are still loading", async () => {
    serve({ "GET /api/trade-plans": () => new Promise(() => undefined) });
    render(<TradePlansScreen locale="en" messages={en} />);
    await screen.findByRole("button", { name: "Save plan" });
    expect(screen.queryByText("No plans yet")).toBeNull();
  });
});

// A first load that fails must not leave the board looking as if it is still loading.
describe("a plans page whose first load failed", () => {
  const failLoad = () => {
    throw new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
  };

  it("English: shows the error and no loading text or empty state", async () => {
    serve({ "GET /api/trade-plans": failLoad });
    const { container } = render(<TradePlansScreen locale="en" messages={en} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again in a moment.");
    expect(container.textContent).not.toContain("Loading");
    expect(screen.queryByText("No plans yet")).toBeNull();
    // The form is still usable.
    expect(screen.getByRole("button", { name: "Save plan" })).toBeInTheDocument();
  });

  it("Persian: shows the error and no loading text or empty state", async () => {
    serve({ "GET /api/trade-plans": failLoad });
    const { container } = render(<TradePlansScreen locale="fa" messages={fa} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(container.textContent).not.toContain("در حال بارگذاری");
    expect(screen.queryByText("هنوز پلنی ثبت نشده است")).toBeNull();
  });

  it("dropped connection: same, and the board comes back after a later load works", async () => {
    let attempt = 0;
    serve({
      "GET /api/trade-plans": () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError("Failed to fetch");
        return { tradePlans: [plan()] };
      },
      "POST /api/trade-plans": {}
    });
    const { container } = render(<TradePlansScreen locale="en" messages={en} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(container.textContent).not.toContain("Loading");

    // Saving a plan reloads the list; once that works the board shows and the error is gone.
    const save = screen.getByRole("button", { name: "Save plan" });
    type(form(container), { symbol: "BTCUSDT", direction: "long", bias: "Bullish", entryZone: "64600" });
    fireEvent.click(save);
    expect(await screen.findByText("BTCUSDT")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
