import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api/client";
import { JournalScreen } from "@/features/journal/journal-screen";

const en = getMessages("en");
const fa = getMessages("fa");

const journalRoutes = {
  "GET /api/trades": { trades: [] },
  "GET /api/trades/metrics": {
    metrics: { totalTrades: 0, winRate: 0, netPnl: 0, profitFactor: 0, expectancy: 0, averageR: 0, maxDrawdownAmount: 0, equityCurve: [] }
  },
  "GET /api/strategies": { strategies: [] },
  "GET /api/ideas": { ideas: [] },
  "GET /api/reviews": { reviews: [] },
  "GET /api/news?locale=en": { news: [] },
  "GET /api/news?locale=fa": { news: [] },
  "POST /api/trades": { trade: { id: "t1" } }
};

type Call = { key: string; body?: Record<string, unknown> };
const calls: Call[] = [];
const posted = () => calls.filter((call) => call.key === "POST /api/trades");

// A journal that already has a trade: the filter panel and its Refresh button only exist then.
const existingTrade = {
  id: "t0",
  strategyId: null,
  symbol: "BTCUSDT",
  market: "crypto",
  side: "long",
  status: "open",
  entryPrice: 65000,
  exitPrice: null,
  stopLoss: null,
  takeProfit: null,
  quantity: 0.1,
  riskAmount: null,
  riskPercent: null,
  rMultiple: null,
  realizedPnl: null,
  fees: 0,
  session: null,
  setupType: null,
  confidenceScore: null,
  preTradeNotes: null,
  postTradeNotes: null,
  lessonsLearned: null,
  outcome: null,
  ruleFollowed: "unknown",
  openedAt: "2026-09-29T10:00:00Z",
  closedAt: null,
  strategy: null,
  journalEntry: null
};

function serve(trades: unknown[] = []) {
  calls.length = 0;
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (!(key in journalRoutes)) throw new Error(`Unexpected request ${key}`);
    if (key === "GET /api/trades") return { trades };
    return journalRoutes[key as keyof typeof journalRoutes];
  });
}

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

async function openFullForm(messages = en, trades: unknown[] = []) {
  serve(trades);
  render(<JournalScreen locale={messages === fa ? "fa" : "en"} messages={messages} />);
  const create = await screen.findByRole("button", { name: messages === fa ? "ثبت معامله" : "Create trade" });
  return create.closest("form") as HTMLFormElement;
}

const input = (form: HTMLFormElement, name: string) => form.elements.namedItem(name) as HTMLInputElement;
const choose = (form: HTMLFormElement, status: string) => fireEvent.change(input(form, "status"), { target: { value: status } });
const type = (form: HTMLFormElement, values: Record<string, string>) => {
  for (const [name, value] of Object.entries(values)) fireEvent.change(input(form, name), { target: { value } });
};

function localToday() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// A closed trade without an exit price or close time is counted nowhere in the results and looks lost.
describe("journal full form: closing a trade", () => {
  it("keeps exit price and close time optional while the trade is open", async () => {
    const form = await openFullForm();
    expect(input(form, "exitPrice")).not.toBeRequired();
    expect(input(form, "closedAt")).not.toBeRequired();
    expect(input(form, "closedAt").value).toBe("");
  });

  it("requires exit price and close time once the status is closed, and fills the close time with now", async () => {
    const form = await openFullForm();
    choose(form, "closed");

    expect(input(form, "exitPrice")).toBeRequired();
    expect(input(form, "closedAt")).toBeRequired();
    expect(input(form, "closedAt").value.startsWith(localToday())).toBe(true);
  });

  it("marks both fields as required in the label too", async () => {
    const form = await openFullForm();
    const labelOf = (name: string) => input(form, name).closest("label") as HTMLLabelElement;
    expect(labelOf("exitPrice").textContent).not.toContain("Required");
    expect(labelOf("closedAt").textContent).not.toContain("Required");

    choose(form, "closed");
    expect(labelOf("exitPrice").textContent).toContain("Required");
    expect(labelOf("closedAt").textContent).toContain("Required");
  });

  it("keeps a close time the trader typed when the status is switched around, and drops the automatic one", async () => {
    const form = await openFullForm();
    choose(form, "closed");
    choose(form, "open");
    expect(input(form, "exitPrice")).not.toBeRequired();
    expect(input(form, "closedAt")).not.toBeRequired();
    expect(input(form, "closedAt").value).toBe("");

    choose(form, "closed");
    type(form, { closedAt: "2026-09-29T12:00" });
    choose(form, "open");
    expect(input(form, "closedAt").value).toBe("2026-09-29T12:00");
  });

  it("does not save a closed trade without an exit price", async () => {
    const form = await openFullForm();
    choose(form, "closed");
    type(form, { symbol: "ETHUSDT", entryPrice: "3000", quantity: "1", openedAt: "2026-09-29T10:00" });
    fireEvent.click(screen.getByRole("button", { name: "Create trade" }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(posted()).toHaveLength(0);
  });

  it("saves a closed trade with the exit price and the default close time as an explicit instant", async () => {
    const form = await openFullForm();
    choose(form, "closed");
    type(form, { symbol: "ETHUSDT", entryPrice: "3000", exitPrice: "3100", quantity: "1", openedAt: "2026-09-29T10:00" });
    fireEvent.click(screen.getByRole("button", { name: "Create trade" }));

    await waitFor(() => expect(posted()).toHaveLength(1));
    const body = posted()[0].body!;
    expect(body.status).toBe("closed");
    expect(body.exitPrice).toBe("3100");
    expect(typeof body.closedAt).toBe("string");
    expect(body.closedAt).toMatch(/Z$/);
    expect(Math.abs(new Date(String(body.closedAt)).getTime() - Date.now())).toBeLessThan(5 * 60 * 1000);
  });

  it("goes back to an open trade after a save, so the next one is not forced to carry an exit", async () => {
    const form = await openFullForm();
    choose(form, "closed");
    type(form, { symbol: "ETHUSDT", entryPrice: "3000", exitPrice: "3100", quantity: "1", openedAt: "2026-09-29T10:00" });
    fireEvent.click(screen.getByRole("button", { name: "Create trade" }));

    await waitFor(() => expect(posted()).toHaveLength(1));
    // The screen reloads the journal after a save, which mounts a fresh form: look it up again.
    const next = await waitFor(() => {
      const created = screen.getByRole("button", { name: "Create trade" }).closest("form") as HTMLFormElement;
      expect(created).not.toBe(form);
      return created;
    });
    expect(input(next, "status").value).toBe("open");
    expect(input(next, "exitPrice")).not.toBeRequired();
    expect(input(next, "closedAt")).not.toBeRequired();
    expect(input(next, "closedAt").value).toBe("");
  });

  it("goes back to open when the form is reset", async () => {
    const form = await openFullForm();
    choose(form, "closed");
    fireEvent.click(screen.getByRole("button", { name: "Reset form" }));

    await waitFor(() => expect(input(form, "exitPrice")).not.toBeRequired());
    expect(input(form, "status").value).toBe("open");
    expect(input(form, "closedAt").value).toBe("");
  });

  // Refresh unmounts the form and mounts a blank one; the status and close time kept in the screen must not outlive it.
  it("goes back to open, with no close time, when the journal is refreshed", async () => {
    const form = await openFullForm(en, [existingTrade]);
    choose(form, "closed");
    expect(input(form, "closedAt").value).not.toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    const next = await waitFor(() => {
      const created = screen.getByRole("button", { name: "Create trade" }).closest("form") as HTMLFormElement;
      expect(created).not.toBe(form);
      return created;
    });
    expect(input(next, "status").value).toBe("open");
    expect(input(next, "exitPrice")).not.toBeRequired();
    expect(input(next, "closedAt")).not.toBeRequired();
    expect(input(next, "closedAt").value).toBe("");
  });

  // The quick entry asks for no exit price or close time, so what it saves is an open trade, not a lost closed one.
  it("records a quick entry as an open trade, with no exit price and no close time", async () => {
    await openFullForm();
    const quick = screen.getByRole("button", { name: "Quick save" }).closest("form") as HTMLFormElement;
    type(quick, { symbol: "ETHUSDT", entryPrice: "3000" });
    fireEvent.click(screen.getByRole("button", { name: "Quick save" }));

    await waitFor(() => expect(posted()).toHaveLength(1));
    const body = posted()[0].body!;
    expect(body.status).toBe("open");
    expect(body).not.toHaveProperty("exitPrice");
    expect(body).not.toHaveProperty("closedAt");
  });

  it("works the same on the Persian page", async () => {
    const form = await openFullForm(fa);
    expect(input(form, "exitPrice")).not.toBeRequired();
    choose(form, "closed");
    expect(input(form, "exitPrice")).toBeRequired();
    expect(input(form, "closedAt")).toBeRequired();
  });
});
