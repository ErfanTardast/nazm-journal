import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { englishLeaks } from "./support/english-leaks";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { PlanRiskDesk } from "@/features/risk/plan-desk";
import { formatMoney } from "@/lib/i18n/format";

const scrollIntoView = vi.fn();

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
  router.push.mockReset();
  scrollIntoView.mockReset();
});

const SETTINGS = { locale: "en", theme: "dark", timezone: "UTC", riskPerTradePct: 1, maxDailyLossPct: 3, maxWeeklyLossPct: 6, startingBalance: 20000, brokerTimeZone: "UTC" };

function plan(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan_eur1",
    market: "forex",
    symbol: "EURUSD",
    bias: "Constructive above support",
    entryZone: "1.0850 - 1.0870",
    status: "planned",
    stopLoss: "1.08000000",
    takeProfit: "1.09500000",
    riskAmount: null,
    riskPercent: "0.5000",
    checklist: { newsChecked: true, direction: "long" },
    sizing: null,
    strategy: { id: "strat_1", name: "Breakout", riskPerTradePct: "1.0000", maxDailyLossPct: null, maxOpenPositions: null },
    ...overrides
  };
}

type Api = { plans?: unknown[] | Error; settings?: unknown | Error; patch?: (body: Record<string, unknown>) => unknown };

function mockApi(api: Api = {}) {
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return api.patch ? api.patch(JSON.parse(String(init.body))) : { tradePlan: {} };
    if (path === "/api/trade-plans") {
      if (api.plans instanceof Error) throw api.plans;
      return { tradePlans: api.plans ?? [plan()] };
    }
    if (path === "/api/users/me/settings") {
      if (api.settings instanceof Error) throw api.settings;
      return { settings: api.settings ?? SETTINGS };
    }
    throw new Error(`unexpected request to ${path}`);
  });
}

const patches = () => (apiFetch as Mock).mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method === "PATCH");

async function openDesk(locale: "en" | "fa" = "en", planId: string | null = "plan_eur1") {
  const view = render(<PlanRiskDesk locale={locale} planId={planId} />);
  if (planId) await screen.findByLabelText(locale === "fa" ? "موجودی حساب" : "Account balance");
  return view;
}

describe("the risk desk without ?plan=", () => {
  it("shows the planner at once and starts from the account's balance when it arrives", async () => {
    mockApi({ plans: [] });
    render(<PlanRiskDesk locale="en" planId={null} />);
    expect(screen.getByLabelText("Account balance")).toHaveValue("10000");
    await waitFor(() => expect(screen.getByLabelText("Account balance")).toHaveValue("20000"));
    // The rest is the standalone example.
    expect(screen.getByLabelText("Entry")).toHaveValue("1.10000");
    expect(screen.queryByText("Sizing this plan")).toBeNull();
  });

  it("keeps the example balance when the account has none", async () => {
    mockApi({ plans: [], settings: { ...SETTINGS, startingBalance: null } });
    render(<PlanRiskDesk locale="en" planId={null} />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Account balance")).toHaveValue("10000");
  });

  it("keeps working when the requests fail", async () => {
    mockApi({ plans: new TypeError("offline"), settings: new TypeError("offline") });
    render(<PlanRiskDesk locale="en" planId={null} />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Account balance")).toHaveValue("10000");
    expect(screen.getByText("0.50 lots")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lists the open plans in a picker that opens one in the planner", async () => {
    mockApi({
      plans: [plan(), plan({ id: "plan_btc1", symbol: "BTCUSDT", status: "active", checklist: { direction: "short" }, strategy: null, bias: "Weak under resistance" }), plan({ id: "plan_old1", symbol: "GBPUSD", status: "closed" }), plan({ id: "plan_can1", symbol: "USDJPY", status: "canceled" })]
    });
    render(<PlanRiskDesk locale="en" planId={null} />);
    const picker = await screen.findByRole("combobox", { name: "Size one of your plans" });
    const options = within(picker).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["Choose a plan", "EURUSD · Long · Breakout", "BTCUSDT · Short · Weak under resistance"]);
    fireEvent.change(picker, { target: { value: "plan_btc1" } });
    expect(router.push).toHaveBeenCalledWith("/en/risk?plan=plan_btc1");
  });

  it("does not show the picker when there is no open plan", async () => {
    mockApi({ plans: [plan({ status: "closed" })] });
    render(<PlanRiskDesk locale="en" planId={null} />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("combobox", { name: "Size one of your plans" })).toBeNull();
  });

  it("does not scroll or focus anything", async () => {
    mockApi({ plans: [plan()] });
    render(<PlanRiskDesk locale="en" planId={null} />);
    await screen.findByRole("combobox", { name: "Size one of your plans" });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("the risk desk opened from a plan", () => {
  it("waits for the plan, then fills the planner from it", async () => {
    mockApi();
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    expect(screen.queryByLabelText("Account balance")).toBeNull();
    expect(await screen.findByLabelText("Account balance")).toHaveValue("20000");
    expect(screen.getByLabelText("Symbol")).toHaveValue("EURUSD");
    expect(screen.getByLabelText("Direction")).toHaveValue("buy");
    expect(screen.getByLabelText("Risk %")).toHaveValue("0.5");
    expect(screen.getByLabelText("Entry")).toHaveValue("1.086");
    expect(screen.getByLabelText("Stop loss")).toHaveValue("1.08");
    expect(screen.getByLabelText("Final take profit")).toHaveValue("1.095");
    expect(screen.getByText("0.16 lots")).toBeInTheDocument();
  });

  it("says which plan is being sized and links back to the plans", async () => {
    mockApi();
    await openDesk();
    const strip = (await screen.findByText("Sizing this plan")).parentElement!;
    expect(strip).toHaveTextContent("EURUSD");
    expect(strip).toHaveTextContent("Long");
    expect(strip).toHaveTextContent("Breakout");
    expect(within(strip.parentElement!).getByRole("link", { name: "Back to the plan" })).toHaveAttribute("href", "/en/plans");
  });

  it("names a plan with no strategy, and a short plan", async () => {
    mockApi({ plans: [plan({ strategy: null, checklist: { direction: "short" }, stopLoss: "1.09500000", takeProfit: "1.08000000" })] });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    const strip = (await screen.findByText("Sizing this plan")).parentElement!;
    expect(strip).toHaveTextContent("Short");
    expect(strip).toHaveTextContent("No strategy");
    expect(screen.getByLabelText("Direction")).toHaveValue("sell");
  });

  it("scrolls the planner into view and focuses it", async () => {
    mockApi();
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    await screen.findByLabelText("Account balance");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("region", { name: "Position planner for a plan" })).toHaveFocus();
  });

  it("says where the balance and entry came from", async () => {
    mockApi();
    await openDesk();
    expect(await screen.findByText("Taken from the starting balance in your settings.")).toBeInTheDocument();
    expect(screen.getByText("Midpoint of the plan's entry zone (1.0850 - 1.0870).")).toBeInTheDocument();
  });

  it("leaves the balance empty, and says so, when the account has no starting balance", async () => {
    mockApi({ settings: { ...SETTINGS, startingBalance: null } });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    expect(await screen.findByLabelText("Account balance")).toHaveValue("");
    expect(screen.getByText("Set your starting balance in Settings, or type your balance here.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("leaves the entry for the trader when the entry zone is not a price", async () => {
    mockApi({ plans: [plan({ entryZone: "wait for the retest" })] });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    expect(await screen.findByLabelText("Entry")).toHaveValue("");
    expect(screen.getByText(/wait for the retest/)).toBeInTheDocument();
  });

  it("uses the symbol 'custom' for a symbol with no preset and says so", async () => {
    mockApi({ plans: [plan({ symbol: "BTCUSDT", entryZone: "64600-65100", stopLoss: 63750, takeProfit: 67000 })] });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    expect(await screen.findByLabelText("Symbol")).toHaveValue("custom");
    expect(screen.getByLabelText("Entry")).toHaveValue("64850");
    expect(screen.getByText("BTCUSDT has no preset here: enter its contract spec below.")).toBeInTheDocument();
  });

  it("does not size a plan whose symbol has no preset until the trader types the contract spec", async () => {
    mockApi({ plans: [plan({ symbol: "EURGBP", entryZone: "0.8500-0.8520", stopLoss: "0.84500000", takeProfit: "0.86500000" })] });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    expect(await screen.findByLabelText("Symbol")).toHaveValue("custom");
    expect(screen.getByLabelText("Entry")).toHaveValue("0.851");
    const spec: [string, string][] = [
      ["Price digits", "5"],
      ["Tick size", "0.00001"],
      ["Tick value (per lot)", "1.3"],
      ["Minimum lot", "0.01"],
      ["Maximum lot", "100"],
      ["Lot step", "0.01"]
    ];
    // Nothing is made up: no example spec, so no result and nothing to save.
    for (const [label] of spec) expect(screen.getByLabelText(label), label).toHaveValue("");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Enter a valid symbol specification (tick size, tick value and lot rules).")).toBeInTheDocument();
    expect(screen.getByText("EURGBP has no preset here: enter its contract spec below.")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save to plan" });
    expect(save).toBeDisabled();
    // Until the whole spec is typed it stays so.
    for (const [label, value] of spec.slice(0, -1)) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      expect(save).toBeDisabled();
    }
    fireEvent.change(screen.getByLabelText("Lot step"), { target: { value: "0.01" } });
    expect(save).toBeEnabled();
    expect(screen.getByRole("table")).toBeInTheDocument();
    fireEvent.click(save);
    await screen.findByText(/^Saved to the plan/);
    expect(JSON.parse(String((patches()[0][1] as RequestInit).body)).sizing.symbol).toBe("custom");
  });

  it("says where a single-price entry zone was taken from", async () => {
    mockApi({ plans: [plan({ entryZone: "1.0850" })] });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    expect(await screen.findByLabelText("Entry")).toHaveValue("1.085");
    expect(screen.getByText("Taken from the plan's entry zone (1.0850).")).toBeInTheDocument();
  });

  it("does not turn a time in the entry zone into an entry price", async () => {
    mockApi({ plans: [plan({ entryZone: "London open 8 am" })] });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    expect(await screen.findByLabelText("Entry")).toHaveValue("");
    expect(screen.getByText(/London open 8 am/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("button", { name: "Save to plan" })).toBeDisabled();
  });

  it("does not use an entry zone that lies outside the plan's stop and target, and says why", async () => {
    mockApi({ plans: [plan({ entryZone: "1.2000" })] });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    expect(await screen.findByLabelText("Entry")).toHaveValue("");
    expect(screen.getByText("The plan's entry zone (1.2000) does not fit the plan's stop loss and take profit, so it was not used. Type the price you will size from.")).toBeInTheDocument();
  });

  it("takes the risk % from the strategy's limit when the plan has none, then from the account", async () => {
    mockApi({ plans: [plan({ riskPercent: null })] });
    const first = render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    expect(await screen.findByLabelText("Risk %")).toHaveValue("1");
    expect(screen.getByText("Taken from the risk limit of the strategy.")).toBeInTheDocument();
    first.unmount();
    mockApi({ plans: [plan({ riskPercent: null, strategy: null })], settings: { ...SETTINGS, riskPerTradePct: 0.8 } });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    expect(await screen.findByLabelText("Risk %")).toHaveValue("0.8");
    expect(screen.getByText("Taken from your default risk per trade in Settings.")).toBeInTheDocument();
  });

  it("asks the trader to check the direction of an older plan", async () => {
    mockApi({ plans: [plan({ checklist: {}, bias: "Bearish below the range", stopLoss: "1.09500000", takeProfit: "1.08000000" })] });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    expect(await screen.findByLabelText("Direction")).toHaveValue("sell");
    expect(screen.getByText("This plan has no saved direction: it is guessed from the bias. Check it.")).toBeInTheDocument();
  });

  it("starts again from the last saved sizing", async () => {
    const sizing = {
      symbol: "EURUSD",
      direction: "buy",
      balance: 15000,
      riskPercent: 0.5,
      entry: 1.0855,
      stopLoss: 1.08,
      finalTp: 1.095,
      totalVolume: 0.12,
      riskMoney: 75,
      lossAtStop: 72,
      finalRr: 1.7,
      legs: [
        { volume: 0.06, takeProfit: 1.09, rr: 0.8 },
        { volume: 0.06, takeProfit: 1.095, rr: 1.7 }
      ],
      sizedAt: "2026-10-01T10:00:00.000Z"
    };
    mockApi({ plans: [plan({ sizing })] });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    expect(await screen.findByLabelText("Account balance")).toHaveValue("15000");
    expect(screen.getByLabelText("Entry")).toHaveValue("1.0855");
    expect(screen.getByLabelText("Number of positions")).toHaveValue("2");
    expect(screen.getByText(/Last sized/)).toBeInTheDocument();
  });
});

describe("the risk desk when the plan cannot be sized", () => {
  it("says when the plan is not found, and the planner still works on its own", async () => {
    mockApi({ plans: [plan({ id: "plan_other" })] });
    render(<PlanRiskDesk locale="en" planId="plan_gone" />);
    expect(await screen.findByText(/That plan was not found/)).toBeInTheDocument();
    expect(screen.getByLabelText("Entry")).toHaveValue("1.10000");
    expect(screen.queryByText("Sizing this plan")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save to plan" })).toBeNull();
    // The open plans are still on offer.
    expect(screen.getByRole("combobox", { name: "Size one of your plans" })).toBeInTheDocument();
  });

  it("says when the plan is closed, or canceled", async () => {
    mockApi({ plans: [plan({ status: "closed" })] });
    const first = render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    expect(await screen.findByText(/That plan is closed/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save to plan" })).toBeNull();
    first.unmount();
    mockApi({ plans: [plan({ status: "canceled" })] });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    expect(await screen.findByText(/That plan is canceled/)).toBeInTheDocument();
  });

  it("says so when the plans could not be loaded", async () => {
    mockApi({ plans: new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR") });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    const notice = await screen.findByText(/could not be loaded/);
    expect(notice.textContent).not.toMatch(/Unexpected server error/);
    expect(screen.getByLabelText("Entry")).toHaveValue("1.10000");
  });

  it("says so when there is no connection", async () => {
    mockApi({ plans: new TypeError("Failed to fetch") });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument();
    expect(screen.getByLabelText("Entry")).toHaveValue("1.10000");
  });

  it("asks to sign in on a 401", async () => {
    mockApi({ plans: new ApiClientError("Authentication required", 401, "UNAUTHORIZED") });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    expect(await screen.findByText("Sign in to size a plan")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Entry")).toHaveValue("1.10000");
  });

  it("still scrolls to the planner so the notice is seen", async () => {
    mockApi({ plans: [] });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    await screen.findByText(/That plan was not found/);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});

describe("moving the desk from one plan to another", () => {
  const other = () => plan({ id: "plan_eur2", symbol: "GBPUSD", entryZone: "1.2700", stopLoss: "1.26000000", takeProfit: "1.29000000", riskPercent: "0.25000000", strategy: null });

  it("refills from the new plan, saves into the new plan, and goes back to the example without one", async () => {
    mockApi({ plans: [plan(), other()] });
    const { rerender } = render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    expect(await screen.findByLabelText("Stop loss")).toHaveValue("1.08");
    expect(screen.getByLabelText("Symbol")).toHaveValue("EURUSD");

    rerender(<PlanRiskDesk locale="en" planId="plan_eur2" />);
    await waitFor(() => expect(screen.getByLabelText("Symbol")).toHaveValue("GBPUSD"));
    expect(screen.getByLabelText("Entry")).toHaveValue("1.27");
    expect(screen.getByLabelText("Stop loss")).toHaveValue("1.26");
    expect(screen.getByLabelText("Final take profit")).toHaveValue("1.29");
    expect(screen.getByLabelText("Risk %")).toHaveValue("0.25");
    expect(screen.getByText("No strategy", { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save to plan" }));
    await screen.findByText(/^Saved to the plan/);
    expect(JSON.parse(String((patches()[0][1] as RequestInit).body)).id).toBe("plan_eur2");

    rerender(<PlanRiskDesk locale="en" planId={null} />);
    await waitFor(() => expect(screen.getByLabelText("Entry")).toHaveValue("1.10000"));
    expect(screen.queryByRole("button", { name: "Save to plan" })).toBeNull();
    expect(screen.queryByText("Sizing this plan")).toBeNull();
    expect(screen.queryByText(/^Saved to the plan/)).toBeNull();
  });

  it("starts the next plan clean: nothing typed for one plan, no old save line and no old error carries over", async () => {
    mockApi({ plans: [plan(), other()], patch: () => Promise.reject(new TypeError("Failed to fetch")) });
    const { rerender } = render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    fireEvent.change(await screen.findByLabelText("Risk %"), { target: { value: "0.4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to plan" }));
    await screen.findByRole("alert");
    rerender(<PlanRiskDesk locale="en" planId="plan_eur2" />);
    await waitFor(() => expect(screen.getByLabelText("Symbol")).toHaveValue("GBPUSD"));
    expect(screen.getByLabelText("Risk %")).toHaveValue("0.25");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Save to plan" })).toBeEnabled();
  });
});

describe("limits and warnings", () => {
  it("lists the limits that apply and where each comes from", async () => {
    mockApi({ plans: [plan({ strategy: { id: "s", name: "Breakout", riskPerTradePct: "1.0000", maxDailyLossPct: null, maxOpenPositions: 4 } })] });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    const limits = (await screen.findByText("Limits for this plan")).parentElement!;
    expect(within(limits).getByText("Risk per trade: at most 1% (strategy “Breakout”)")).toBeInTheDocument();
    expect(within(limits).getByText("Daily loss: at most 3% (your account settings)")).toBeInTheDocument();
    expect(within(limits).getByText("Open positions: at most 4 (strategy “Breakout”)")).toBeInTheDocument();
    expect(within(limits).getByText(/this plan's own positions/)).toBeInTheDocument();
  });

  it("says when no limit applies", async () => {
    mockApi({ plans: [plan({ strategy: null })], settings: { ...SETTINGS, riskPerTradePct: null, maxDailyLossPct: null } });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    expect(await screen.findByText(/No risk limit applies to this plan/)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Risk limit warnings" })).toBeEmptyDOMElement();
  });

  it("keeps a region ready for warnings, and is quiet inside the limits", async () => {
    mockApi();
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    const region = await screen.findByRole("status", { name: "Risk limit warnings" });
    expect(region).toHaveTextContent("These numbers are inside every limit above.");
    expect(region).not.toHaveTextContent("above the");
  });

  it("warns, with both numbers, as soon as the risk % passes the strategy's limit, and stops when it is back inside", async () => {
    mockApi();
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    const region = await screen.findByRole("status", { name: "Risk limit warnings" });
    fireEvent.change(screen.getByLabelText("Risk %"), { target: { value: "1.5" } });
    expect(region).toHaveTextContent("Risk per trade is 1.5%, above the 1% limit (strategy “Breakout”).");
    expect(region).toHaveTextContent("A warning only: you can still save.");
    expect(region).not.toHaveTextContent("inside every limit");
    fireEvent.change(screen.getByLabelText("Risk %"), { target: { value: "1" } });
    expect(region).not.toHaveTextContent("above the");
    expect(region).toHaveTextContent("inside every limit");
  });

  it("warns about a risk above the account's daily loss limit", async () => {
    mockApi({ plans: [plan({ strategy: null })], settings: { ...SETTINGS, riskPerTradePct: 5, maxDailyLossPct: 3 } });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    const region = await screen.findByRole("status", { name: "Risk limit warnings" });
    fireEvent.change(screen.getByLabelText("Risk %"), { target: { value: "4" } });
    expect(region).toHaveTextContent("This trade risks 4% of the account, above the 3% daily loss limit (your account settings).");
  });

  it("counts the plan's own positions against the open-positions limit", async () => {
    mockApi({ plans: [plan({ strategy: { id: "s", name: "Breakout", riskPerTradePct: null, maxDailyLossPct: null, maxOpenPositions: 2 } })] });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    const region = await screen.findByRole("status", { name: "Risk limit warnings" });
    expect(region).toHaveTextContent("This plan opens 3 positions, above the limit of 2 open positions (strategy “Breakout”).");
    fireEvent.change(screen.getByLabelText("Number of positions"), { target: { value: "2" } });
    expect(region).not.toHaveTextContent("above the limit of 2");
  });

  it("never blocks the save when a limit is passed", async () => {
    mockApi();
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    const region = await screen.findByRole("status", { name: "Risk limit warnings" });
    fireEvent.change(screen.getByLabelText("Risk %"), { target: { value: "2" } });
    expect(region).toHaveTextContent("above the 1% limit");
    expect(screen.getByRole("button", { name: "Save to plan" })).toBeEnabled();
  });

  it("warns when the planner's direction is not the plan's, in the planner's own words, and says what it takes to save", async () => {
    mockApi();
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    const region = await screen.findByRole("status", { name: "Risk limit warnings" });
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "sell" } });
    expect(region).toHaveTextContent("“Sell” is selected here, but this plan is a Long. Set the same direction here, or change it on the plan, to save.");
    expect(screen.getByRole("button", { name: "Save to plan" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "buy" } });
    expect(region).not.toHaveTextContent("is selected here");
    expect(screen.getByRole("button", { name: "Save to plan" })).toBeEnabled();
  });

  // "You can still save" is only said while it is true.
  it("does not promise a save next to a limit warning while the save is not possible", async () => {
    mockApi();
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    const region = await screen.findByRole("status", { name: "Risk limit warnings" });
    fireEvent.change(screen.getByLabelText("Risk %"), { target: { value: "2" } });
    expect(region).toHaveTextContent("A warning only: you can still save.");

    // The other direction than the plan's: the limit warning stays, the promise goes.
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "sell" } });
    expect(region).toHaveTextContent("above the 1% limit");
    expect(region).not.toHaveTextContent("you can still save");
    expect(screen.getByRole("button", { name: "Save to plan" })).toBeDisabled();

    // No valid result at all (risk over 100%).
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "buy" } });
    fireEvent.change(screen.getByLabelText("Risk %"), { target: { value: "150" } });
    expect(region).not.toHaveTextContent("you can still save");
    expect(screen.getByRole("button", { name: "Save to plan" })).toBeDisabled();
  });

  it("does not let a sell with valid sell numbers be saved into a long plan", async () => {
    mockApi();
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    const save = await screen.findByRole("button", { name: "Save to plan" });
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "sell" } });
    fireEvent.change(screen.getByLabelText("Stop loss"), { target: { value: "1.095" } });
    fireEvent.change(screen.getByLabelText("Final take profit"), { target: { value: "1.08" } });
    // The sizing itself is fine (there is a result)...
    expect(screen.getByRole("table")).toBeInTheDocument();
    // ...but it would leave the plan contradicting itself, so it cannot be saved.
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(patches()).toHaveLength(0);
  });
});

describe("saving the result into the plan", () => {
  it("is only possible with a valid result", async () => {
    mockApi();
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    const button = await screen.findByRole("button", { name: "Save to plan" });
    expect(button).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "sell" } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "buy" } });
    expect(button).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Stop loss"), { target: { value: "" } });
    expect(button).toBeDisabled();
  });

  it("sends one PATCH naming the status it loaded and exactly the numbers on screen", async () => {
    mockApi();
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Save to plan" }));
    await screen.findByText("Saved to the plan: 0.16 lots in total, a $96.00 loss at the stop.");
    expect(patches()).toHaveLength(1);
    const [path, init] = patches()[0] as [string, RequestInit];
    expect(path).toBe("/api/trade-plans");
    expect(JSON.parse(String(init.body))).toEqual({
      id: "plan_eur1",
      expectedStatus: "planned",
      stopLoss: 1.08,
      takeProfit: 1.095,
      riskPercent: 0.5,
      riskAmount: 96,
      sizing: {
        symbol: "EURUSD",
        direction: "buy",
        balance: 20000,
        riskPercent: 0.5,
        entry: 1.086,
        stopLoss: 1.08,
        finalTp: 1.095,
        totalVolume: 0.16,
        riskMoney: 100,
        lossAtStop: 96,
        finalRr: 1.5,
        legs: [
          { volume: 0.06, takeProfit: 1.089, rr: 0.5 },
          { volume: 0.05, takeProfit: 1.092, rr: 1 },
          { volume: 0.05, takeProfit: 1.095, rr: 1.5 }
        ],
        sizedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      },
      checklist: { newsChecked: true, direction: "long", riskCalculated: true }
    });
  });

  it("sends what is typed now, not what the plan started with", async () => {
    mockApi({ plans: [plan({ status: "active" })] });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    fireEvent.change(await screen.findByLabelText("Risk %"), { target: { value: "0.25" } });
    fireEvent.change(screen.getByLabelText("Number of positions"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to plan" }));
    await screen.findByText(/^Saved to the plan/);
    const body = JSON.parse(String((patches()[0][1] as RequestInit).body));
    expect(body.expectedStatus).toBe("active");
    // The desk never writes a status: it only names the one it loaded.
    expect(body).not.toHaveProperty("status");
    expect(body.riskPercent).toBe(0.25);
    expect(body.sizing.riskPercent).toBe(0.25);
    expect(body.sizing.legs).toHaveLength(1);
  });

  it("shows a status line and a link back to the plan, and hides them when the numbers change", async () => {
    mockApi();
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Save to plan" }));
    const status = await screen.findByText("Saved to the plan: 0.16 lots in total, a $96.00 loss at the stop.");
    expect(status.closest("[role=status]")).not.toBeNull();
    expect(screen.getAllByRole("link", { name: "Back to the plan" })).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Risk %"), { target: { value: "0.4" } });
    expect(screen.queryByText(/^Saved to the plan/)).toBeNull();
    expect(screen.getAllByRole("link", { name: "Back to the plan" })).toHaveLength(1);
  });

  it("cannot be pressed twice while a save is running", async () => {
    let release: (value: unknown) => void = () => {};
    mockApi({ patch: () => new Promise((resolve) => (release = resolve)) });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    const button = await screen.findByRole("button", { name: "Save to plan" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(patches()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    await act(async () => release({ tradePlan: {} }));
    await screen.findByText(/^Saved to the plan/);
    expect(screen.getByRole("button", { name: "Save to plan" })).toBeEnabled();
    expect(patches()).toHaveLength(1);
  });

  it("does not leak the server's text, and says in plain words what happened", async () => {
    const cases: [ApiClientError | TypeError, RegExp][] = [
      [new ApiClientError("Trade plan was converted already (server text)", 409, "CONFLICT"), /changed somewhere else since this page loaded/],
      [new ApiClientError("Trade plan not found (server text)", 404, "NOT_FOUND"), /no longer exists/],
      [new ApiClientError("Too many requests (server text)", 429, "RATE_LIMITED"), /Too many attempts/],
      [new ApiClientError("Authentication required (server text)", 401, "UNAUTHORIZED"), /Sign in again/],
      [new ApiClientError("Request validation failed (server text)", 422, "VALIDATION_ERROR", { fieldErrors: { sizing: ["Invalid input"] } }), /Some values are not valid/],
      [new ApiClientError("Unexpected server error (server text)", 500, "INTERNAL_SERVER_ERROR"), /could not be saved/],
      [new ApiClientError("Teapot (server text)", 418, "TEAPOT"), /could not be saved/],
      [new TypeError("Failed to fetch"), /Could not reach the server/]
    ];
    for (const [error, expected] of cases) {
      mockApi({ patch: () => Promise.reject(error) });
      const view = render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
      fireEvent.click(await screen.findByRole("button", { name: "Save to plan" }));
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toMatch(expected);
      expect(alert.textContent).not.toMatch(/server text|Failed to fetch/);
      expect(screen.queryByText(/^Saved to the plan/)).toBeNull();
      view.unmount();
    }
  });

  it("stores money as the planner prints it, also for a half cent", async () => {
    mockApi();
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    fireEvent.change(await screen.findByLabelText("Account balance"), { target: { value: "5075" } });
    fireEvent.change(screen.getByLabelText("Risk %"), { target: { value: "0.7" } });
    // 5075 x 0.7% = 35.525: the card rounds the half up.
    const budget = screen.getByText("Risk budget").parentElement!;
    expect(budget).toHaveTextContent("$35.53");
    fireEvent.click(screen.getByRole("button", { name: "Save to plan" }));
    await screen.findByText(/^Saved to the plan/);
    const body = JSON.parse(String((patches()[0][1] as RequestInit).body));
    expect(formatMoney(body.sizing.riskMoney, "en")).toBe("$35.53");
    expect(body.sizing.riskMoney).toBe(35.53);
    const loss = screen.getByText("Loss at stop for this plan").parentElement!;
    expect(loss).toHaveTextContent(formatMoney(body.sizing.lossAtStop, "en"));
    expect(loss).toHaveTextContent(formatMoney(body.riskAmount, "en"));
    expect(body.riskAmount).toBe(body.sizing.lossAtStop);
  });

  it("says when a price was saved rounded to the symbol's tick, with the prices as saved", async () => {
    mockApi({ plans: [plan({ symbol: "XAUUSD", entryZone: "2650", stopLoss: "2640.12500000", takeProfit: "2670.00000000" })] });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    await screen.findByRole("button", { name: "Save to plan" });
    const note = screen.getByText(/rounded to the symbol's tick size/);
    fireEvent.click(screen.getByRole("button", { name: "Save to plan" }));
    await screen.findByText(/^Saved to the plan/);
    const body = JSON.parse(String((patches()[0][1] as RequestInit).body));
    expect(body.stopLoss).not.toBe(2640.125);
    expect(note.textContent).toContain(`stop loss ${body.stopLoss}`);
    expect(note.textContent).toContain(`entry ${body.sizing.entry}`);
    expect(note.textContent).toContain(`take profit ${body.takeProfit}`);
  });

  it("stays quiet about tick rounding when the prices are already on the tick", async () => {
    mockApi();
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    await screen.findByRole("button", { name: "Save to plan" });
    expect(screen.queryByText(/rounded to the symbol's tick size/)).toBeNull();
  });

  it("stops offering the save once the plan was converted in another tab", async () => {
    mockApi({ patch: () => Promise.reject(new ApiClientError("Trade plan converted", 409, "CONFLICT")) });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Save to plan" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Save to plan" })).toBeDisabled();
    expect(patches()).toHaveLength(1);
  });

  it("stops offering the save once the plan is gone", async () => {
    mockApi({ patch: () => Promise.reject(new ApiClientError("Trade plan not found", 404, "NOT_FOUND")) });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Save to plan" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/no longer exists/);
    expect(screen.getByRole("button", { name: "Save to plan" })).toBeDisabled();
    expect(patches()).toHaveLength(1);
  });

  it("lets the trader try again after a failure that may pass", async () => {
    let calls = 0;
    mockApi({
      patch: () => {
        calls += 1;
        if (calls === 1) throw new TypeError("Failed to fetch");
        return { tradePlan: {} };
      }
    });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Save to plan" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Save to plan" }));
    await screen.findByText(/^Saved to the plan/);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says what a plan can store when the planner has more positions than that", async () => {
    mockApi({ settings: { ...SETTINGS, startingBalance: 10_000_000 } });
    render(<PlanRiskDesk locale="en" planId="plan_eur1" />);
    fireEvent.change(await screen.findByLabelText("Number of positions"), { target: { value: "21" } });
    expect(screen.getByRole("button", { name: "Save to plan" })).toBeDisabled();
    expect(screen.getByText("A plan can store at most 20 positions.")).toBeInTheDocument();
  });
});

describe("the risk desk in Persian", () => {
  const allowed = [/Symbol > Specification/g, /\b(EUR|GBP|AUD|NZD|XAU|XAG|USD|JPY|CHF|CAD)[A-Z]{0,3}\b/g, /\bBreakout\b/g, /\bBTCUSDT\b/g];

  it("has no English while sizing a plan, with warnings, and after saving", async () => {
    mockApi({ plans: [plan({ strategy: { id: "s", name: "Breakout", riskPerTradePct: "1.0000", maxDailyLossPct: null, maxOpenPositions: 2 } }), plan({ id: "plan_btc1", symbol: "BTCUSDT", strategy: null })] });
    const { container } = render(<PlanRiskDesk locale="fa" planId="plan_eur1" />);
    fireEvent.click(await screen.findByRole("button", { name: "ذخیره در پلن" }));
    await screen.findByText(/^در پلن ذخیره شد/);
    fireEvent.change(screen.getByLabelText("درصد ریسک"), { target: { value: "1.5" } });
    expect(englishLeaks(container, allowed)).toEqual([]);
    expect(container.textContent).not.toMatch(/برنامه(?!‌ریز)/);
    expect(container.textContent).toContain("پلن");
    const region = screen.getByRole("status", { name: "هشدارهای سقف ریسک" });
    expect(region).toHaveTextContent("ریسک هر معامله ۱٫۵٪ است و از سقف ۱٪ (استراتژی «Breakout») بیشتر است.");
    expect(region).toHaveTextContent("این پلن ۳ پوزیشن باز می‌کند و از سقف ۲ پوزیشن باز (استراتژی «Breakout») بیشتر است.");
  });

  it("words the limits, the notices and the picker in Persian", async () => {
    mockApi({ plans: [plan()] });
    const { container } = render(<PlanRiskDesk locale="fa" planId="plan_missing" />);
    expect(await screen.findByText(/این پلن پیدا نشد/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "تعیین حجم برای یکی از پلن‌هایتان" })).toBeInTheDocument();
    expect(englishLeaks(container, allowed)).toEqual([]);
    expect(container.textContent).not.toMatch(/برنامه(?!‌ریز)/);
  });

  it("writes the saved lots and the loss in Persian digits only", async () => {
    mockApi();
    render(<PlanRiskDesk locale="fa" planId="plan_eur1" />);
    fireEvent.click(await screen.findByRole("button", { name: "ذخیره در پلن" }));
    const line = await screen.findByText(/^در پلن ذخیره شد/);
    expect(line.textContent).not.toMatch(/\d/);
    expect(line.textContent).toContain("۰٫۱۶ لات");
    expect(line.textContent).toContain("۹۶٫۰۰");
  });

  it("says a mismatched direction in the planner's own words and holds the save back", async () => {
    mockApi();
    render(<PlanRiskDesk locale="fa" planId="plan_eur1" />);
    const region = await screen.findByRole("status", { name: "هشدارهای سقف ریسک" });
    fireEvent.change(screen.getByLabelText("جهت"), { target: { value: "sell" } });
    expect(region).toHaveTextContent("اینجا «فروش» انتخاب شده، ولی این پلن لانگ است. برای ذخیره، جهت را همین‌جا یا روی پلن یکی کنید.");
    expect(screen.getByRole("button", { name: "ذخیره در پلن" })).toBeDisabled();
  });

  it("names the time of the last sizing as a plain label, not wedged into a sentence", async () => {
    const sizing = {
      symbol: "EURUSD",
      direction: "buy",
      balance: 15000,
      riskPercent: 0.5,
      entry: 1.0855,
      stopLoss: 1.08,
      finalTp: 1.095,
      totalVolume: 0.12,
      riskMoney: 75,
      lossAtStop: 72,
      finalRr: 1.7,
      legs: [{ volume: 0.12, takeProfit: 1.095, rr: 1.7 }],
      sizedAt: "2026-10-01T10:00:00.000Z"
    };
    mockApi({ plans: [plan({ sizing })] });
    render(<PlanRiskDesk locale="fa" planId="plan_eur1" />);
    expect(await screen.findByText(/^آخرین محاسبه حجم: /)).toBeInTheDocument();
  });

  it("says where a single-price zone, and a zone outside the stop and target, came from, in Persian", async () => {
    mockApi({ plans: [plan({ entryZone: "۱٫۰۸۵۰" })] });
    const first = render(<PlanRiskDesk locale="fa" planId="plan_eur1" />);
    expect(await screen.findByLabelText("ورود")).toHaveValue("1.085");
    expect(screen.getByText("از ناحیه ورود پلن (۱٫۰۸۵۰) برداشته شد.")).toBeInTheDocument();
    first.unmount();
    mockApi({ plans: [plan({ entryZone: "۱٫۲۰۰۰" })] });
    const { container } = render(<PlanRiskDesk locale="fa" planId="plan_eur1" />);
    expect(await screen.findByLabelText("ورود")).toHaveValue("");
    expect(screen.getByText(/با حد ضرر و حد سود پلن جور نیست/)).toBeInTheDocument();
    expect(englishLeaks(container, allowed)).toEqual([]);
  });

  it("links to the Persian plans page", async () => {
    mockApi();
    render(<PlanRiskDesk locale="fa" planId="plan_eur1" />);
    const link = await screen.findByRole("link", { name: "بازگشت به پلن" });
    expect(link).toHaveAttribute("href", "/fa/plans");
  });

  it("keeps the picker's navigation in the page language", async () => {
    mockApi({ plans: [plan()] });
    render(<PlanRiskDesk locale="fa" planId={null} />);
    const picker = await screen.findByRole("combobox", { name: "تعیین حجم برای یکی از پلن‌هایتان" });
    fireEvent.change(picker, { target: { value: "plan_eur1" } });
    expect(router.push).toHaveBeenCalledWith("/fa/risk?plan=plan_eur1");
  });
});
