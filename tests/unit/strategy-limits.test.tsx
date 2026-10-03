import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { englishLeaks } from "./support/english-leaks";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { StrategyScreen } from "@/features/strategy/strategy-screen";

const en = getMessages("en");
const fa = getMessages("fa");

type Call = { key: string; body?: Record<string, unknown> };
const calls: Call[] = [];
const sent = (key: string) => calls.filter((call) => call.key === key);

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

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

const strategy = (overrides: Record<string, unknown> = {}) => ({
  id: "strat-1",
  name: "Range fade",
  description: null,
  allowedMarkets: ["forex"],
  isActive: true,
  isSample: false,
  riskPerTradePct: null,
  maxDailyLossPct: null,
  maxOpenPositions: null,
  ...overrides
});

// Prisma decimals reach the browser as text.
const withLimits = strategy({ riskPerTradePct: "0.5000", maxDailyLossPct: "2.0000", maxOpenPositions: 3 });

const base = {
  "GET /api/playbooks/adherence": { playbooks: [] },
  "GET /api/mentor-report?hidePnl=true&locale=fa": { available: false, requiredTier: "elite", report: null },
  "GET /api/mentor-report?hidePnl=true&locale=en": { available: false, requiredTier: "elite", report: null }
};

function field(root: HTMLElement | HTMLFormElement, name: string) {
  const element = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
  if (!element) throw new Error(`no field named ${name}`);
  return element;
}

function type(root: HTMLElement | HTMLFormElement, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) fireEvent.change(field(root, name), { target: { value } });
}

async function renderList(locale: "en" | "fa", strategies: unknown[], extra: Record<string, unknown | ((init?: RequestInit) => unknown)> = {}) {
  serve({ ...base, "GET /api/strategies": { strategies }, ...extra });
  const view = render(<StrategyScreen locale={locale} messages={locale === "fa" ? fa : en} />);
  // A list with rows is a table; an empty one is the empty state.
  if (strategies.length > 0) await screen.findByRole("table");
  else await screen.findByText(locale === "fa" ? "هنوز استراتژی‌ای نیست" : "No strategies yet");
  return view;
}

const createForm = (container: HTMLElement) => container.querySelector("form") as HTMLFormElement;

function fillRequired(container: HTMLElement) {
  type(createForm(container), { name: "Range fade", entryRules: "Wait for the sweep", exitRules: "Exit at the midpoint" });
  fireEvent.click(container.querySelector('input[name="allowedMarkets"][value="forex"]')!);
}

describe("the checklist example on the create form does not repeat the plan form's own tick boxes", () => {
  it.each([
    ["en", "e.g. Waited for the sweep\nVolume confirmed", [/News/i, /Risk/i]],
    ["fa", "مثلاً منتظر جمع‌آوری نقدینگی ماندم\nحجم تأیید شد", [/اخبار/, /ریسک/]]
  ] as const)("suggests two items the plan form does not ask (%s)", async (locale, example, banned) => {
    const { container } = await renderList(locale, []);
    const placeholder = field(createForm(container), "checklist").placeholder;
    expect(placeholder).toBe(example);
    for (const pattern of banned) expect(placeholder).not.toMatch(pattern);
  });
});

describe("the create form has three optional limit fields", () => {
  it("English: labelled, optional, with a hint that says what each one is checked against", async () => {
    const { container } = await renderList("en", []);
    const form = createForm(container);
    for (const name of ["riskPerTradePct", "maxDailyLossPct", "maxOpenPositions"]) {
      const input = field(form, name);
      expect(input.required, name).toBe(false);
      expect(input.closest("label")?.textContent, name).not.toContain("*");
    }
    expect(within(form).getByLabelText(/Risk per trade %/)).toBe(field(form, "riskPerTradePct"));
    expect(within(form).getByLabelText(/Max daily loss %/)).toBe(field(form, "maxDailyLossPct"));
    expect(within(form).getByLabelText(/Max open positions/)).toBe(field(form, "maxOpenPositions"));
    expect(form.textContent).toContain("gets a warning before you save it");
    expect(form.textContent).toContain("planned or active");
  });

  it("Persian: labels and hints are Persian", async () => {
    const { container } = await renderList("fa", []);
    const form = createForm(container);
    expect(within(form).getByLabelText(/درصد ریسک هر معامله/)).toBe(field(form, "riskPerTradePct"));
    expect(within(form).getByLabelText(/حداکثر ضرر روزانه/)).toBe(field(form, "maxDailyLossPct"));
    expect(within(form).getByLabelText(/حداکثر پوزیشن‌های باز/)).toBe(field(form, "maxOpenPositions"));
    expect(englishLeaks(container)).toEqual([]);
  });

  it("sends the limits as typed, Persian digits included, and nothing for a field left empty", async () => {
    const { container } = await renderList("en", [], { "POST /api/strategies": { strategy: { id: "s9" } } });
    fillRequired(container);
    type(createForm(container), { riskPerTradePct: " ۰٫۵ ", maxOpenPositions: "3" });
    fireEvent.click(screen.getByRole("button", { name: "Create strategy" }));

    await waitFor(() => expect(sent("POST /api/strategies")).toHaveLength(1));
    const body = sent("POST /api/strategies")[0].body!;
    expect(body.riskPerTradePct).toBe("۰٫۵");
    expect(body.maxOpenPositions).toBe("3");
    expect(body).not.toHaveProperty("maxDailyLossPct");
  });

  it("sends no limit at all when none was typed", async () => {
    const { container } = await renderList("en", [], { "POST /api/strategies": { strategy: { id: "s9" } } });
    fillRequired(container);
    fireEvent.click(screen.getByRole("button", { name: "Create strategy" }));
    await waitFor(() => expect(sent("POST /api/strategies")).toHaveLength(1));
    const body = sent("POST /api/strategies")[0].body!;
    for (const key of ["riskPerTradePct", "maxDailyLossPct", "maxOpenPositions"]) expect(body, key).not.toHaveProperty(key);
  });

  it.each([
    ["en", "Risk per trade %", "Max open positions"],
    ["fa", "درصد ریسک هر معامله", "حداکثر پوزیشن‌های باز"]
  ] as const)("names a rejected limit by this screen's own label (%s)", async (locale, riskLabel, openLabel) => {
    const { container } = await renderList(locale, [], {
      "POST /api/strategies": () => {
        throw new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: { riskPerTradePct: ["Too big"], maxOpenPositions: ["Invalid"] } });
      }
    });
    fillRequired(container);
    type(createForm(container), { riskPerTradePct: "500", maxOpenPositions: "0" });
    fireEvent.click(screen.getByRole("button", { name: locale === "fa" ? "ساخت استراتژی" : "Create strategy" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(riskLabel);
    expect(alert).toHaveTextContent(openLabel);
    expect(alert.textContent).not.toContain("riskPerTradePct");
    // Still just above the Create button, as before.
    expect(createForm(container).contains(alert)).toBe(true);
  });
});

describe("the list shows a strategy's limits", () => {
  it("English: each limit with its number, read from the decimal text the server sends", async () => {
    await renderList("en", [strategy({ id: "a", name: "Range fade", riskPerTradePct: "0.5000", maxDailyLossPct: "2.0000", maxOpenPositions: 3 }), strategy({ id: "b", name: "Breakout" })]);
    const rows = screen.getAllByRole("row");
    const first = within(rows[1]).getByText(/Risk per trade/).closest("td")!;
    expect(first).toHaveTextContent("Risk per trade 0.5%");
    expect(first).toHaveTextContent("Daily loss 2%");
    expect(first).toHaveTextContent("Open positions 3");
    expect(within(rows[2]).getByText("No limits set")).toBeInTheDocument();
  });

  it("Persian: Persian digits, the decimal mark and the Persian percent sign", async () => {
    const { container } = await renderList("fa", [strategy({ riskPerTradePct: "0.5000", maxDailyLossPct: "2.0000", maxOpenPositions: 3 }), strategy({ id: "b", name: "شکست محدوده" })]);
    const rows = screen.getAllByRole("row");
    const cell = within(rows[1]).getByText(/ریسک هر معامله/).closest("td")!;
    expect(cell).toHaveTextContent("ریسک هر معامله ۰٫۵٪");
    expect(cell).toHaveTextContent("ضرر روزانه ۲٪");
    expect(cell).toHaveTextContent("پوزیشن باز ۳");
    expect(cell).not.toHaveTextContent("موقعیت");
    expect(within(rows[2]).getByText("سقفی تعیین نشده")).toBeInTheDocument();
    expect(englishLeaks(container, ["Range fade"])).toEqual([]);
  });

  it("copes with a strategy the server sends without limit fields", async () => {
    await renderList("en", [{ id: "old", name: "Older", description: null, allowedMarkets: ["crypto"], isActive: true }]);
    expect(screen.getByText("No limits set")).toBeInTheDocument();
  });
});

describe("a sample strategy is marked", () => {
  it("shows a Sample badge in English and نمونه in Persian, and only on the sample row", async () => {
    await renderList("en", [strategy({ id: "a", name: "Sample range fade", isSample: true }), strategy({ id: "b", name: "My own" })]);
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("Sample")).toBeInTheDocument();
    expect(within(rows[2]).queryByText("Sample")).toBeNull();
    cleanup();

    const view = await renderList("fa", [strategy({ id: "a", name: "بازگشت نمونه", isSample: true })]);
    expect(screen.getByText("نمونه")).toBeInTheDocument();
    expect(englishLeaks(view.container)).toEqual([]);
  });
});

describe("plan from this strategy", () => {
  it("links each row to the plans page with the strategy chosen, in the page language", async () => {
    await renderList("en", [strategy({ id: "strat-1" }), strategy({ id: "strat-2", name: "Breakout" })]);
    const links = screen.getAllByRole("link", { name: "Plan from this strategy" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/en/plans?strategy=strat-1", "/en/plans?strategy=strat-2"]);
    cleanup();

    await renderList("fa", [strategy({ id: "strat-1" })]);
    expect(screen.getByRole("link", { name: "ساخت پلن از این استراتژی" })).toHaveAttribute("href", "/fa/plans?strategy=strat-1");
  });
});

describe("editing a strategy's limits in place", () => {
  const openEditor = async (locale: "en" | "fa" = "en", extra: Record<string, unknown | ((init?: RequestInit) => unknown)> = {}) => {
    const view = await renderList(locale, [withLimits], extra);
    fireEvent.click(screen.getByRole("button", { name: locale === "fa" ? "ویرایش سقف‌ها" : "Edit limits" }));
    return view;
  };
  const rowForm = (container: HTMLElement) => container.querySelectorAll("form")[1] as HTMLFormElement;

  it("opens a small form on the row, filled with the current limits (no trailing zeros)", async () => {
    const { container } = await openEditor();
    const form = rowForm(container);
    expect(form.closest("tr")).not.toBeNull();
    expect(field(form, "riskPerTradePct").value).toBe("0.5");
    expect(field(form, "maxDailyLossPct").value).toBe("2");
    expect(field(form, "maxOpenPositions").value).toBe("3");
  });

  it("sends only the field that changed", async () => {
    const { container } = await openEditor("en", { "PATCH /api/strategies": { strategy: { id: "strat-1" } } });
    type(rowForm(container), { riskPerTradePct: "1" });
    fireEvent.click(screen.getByRole("button", { name: "Save limits" }));

    await waitFor(() => expect(sent("PATCH /api/strategies")).toHaveLength(1));
    expect(sent("PATCH /api/strategies")[0].body).toEqual({ id: "strat-1", riskPerTradePct: "1" });
  });

  it("clearing a field sends null for it", async () => {
    const { container } = await openEditor("en", { "PATCH /api/strategies": { strategy: { id: "strat-1" } } });
    type(rowForm(container), { maxDailyLossPct: "   " });
    fireEvent.click(screen.getByRole("button", { name: "Save limits" }));

    await waitFor(() => expect(sent("PATCH /api/strategies")).toHaveLength(1));
    expect(sent("PATCH /api/strategies")[0].body).toEqual({ id: "strat-1", maxDailyLossPct: null });
  });

  it("does not count Persian digits for the same number as a change", async () => {
    const { container } = await openEditor("fa", { "PATCH /api/strategies": { strategy: { id: "strat-1" } } });
    type(rowForm(container), { riskPerTradePct: "۰٫۵", maxOpenPositions: "۴" });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره سقف‌ها" }));

    await waitFor(() => expect(sent("PATCH /api/strategies")).toHaveLength(1));
    expect(sent("PATCH /api/strategies")[0].body).toEqual({ id: "strat-1", maxOpenPositions: "۴" });
  });

  it("sends nothing when nothing changed, and closes the form", async () => {
    const { container } = await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Save limits" }));
    await waitFor(() => expect(container.querySelectorAll("form")).toHaveLength(1));
    expect(sent("PATCH /api/strategies")).toHaveLength(0);
  });

  it("reloads the list and closes the form once the change is saved", async () => {
    let loads = 0;
    const { container } = await openEditor("en", {
      "GET /api/strategies": () => {
        loads += 1;
        return { strategies: [loads === 1 ? withLimits : strategy({ riskPerTradePct: "1.0000", maxDailyLossPct: "2.0000", maxOpenPositions: 3 })] };
      },
      "PATCH /api/strategies": { strategy: { id: "strat-1" } }
    });
    type(rowForm(container), { riskPerTradePct: "1" });
    fireEvent.click(screen.getByRole("button", { name: "Save limits" }));

    await waitFor(() => expect(screen.getByText(/Risk per trade 1%/)).toBeInTheDocument());
    expect(container.querySelectorAll("form")).toHaveLength(1);
  });

  it("names a rejected limit by its label in the form, and keeps the form open", async () => {
    const { container } = await openEditor("en", {
      "PATCH /api/strategies": () => {
        throw new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: { riskPerTradePct: ["Too big"] } });
      }
    });
    type(rowForm(container), { riskPerTradePct: "500" });
    fireEvent.click(screen.getByRole("button", { name: "Save limits" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Risk per trade %");
    expect(rowForm(container).contains(alert)).toBe(true);
    expect(field(rowForm(container), "riskPerTradePct").value).toBe("500");
  });

  it("shows a Persian line when the save fails for another reason", async () => {
    const { container } = await openEditor("fa", {
      "PATCH /api/strategies": () => {
        throw new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
      }
    });
    type(rowForm(container), { riskPerTradePct: "1" });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره سقف‌ها" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("ذخیره سقف‌ها ممکن نشد.");
    expect(englishLeaks(alert)).toEqual([]);
  });

  it("Cancel closes the form without a request", async () => {
    const { container } = await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(sent("PATCH /api/strategies")).toHaveLength(0);
  });

  it("is Persian on the Persian page", async () => {
    const { container } = await openEditor("fa");
    expect(englishLeaks(container, ["Range fade"])).toEqual([]);
    expect(screen.getByRole("button", { name: "لغو" })).toBeInTheDocument();
  });
});
