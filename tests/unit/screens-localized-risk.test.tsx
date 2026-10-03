import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { englishLeaks } from "./support/english-leaks";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { PositionPlanner } from "@/features/risk/position-planner";
import { RiskScreen } from "@/features/risk/risk-screen";

const en = getMessages("en");
const fa = getMessages("fa");
const ARABIC_SCRIPT = /[؀-ۿ]/;

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

const GENERIC_WARNING = "These calculators support planning and discipline only. They do not recommend buying, selling, or placing orders.";
const LIQUIDATION_WARNING = "This is an educational estimate. Trading venues use different maintenance margin formulas.";
const HIGH_LEVERAGE_WARNING = "High leverage can cause liquidation during normal volatility. This is an estimate for planning, not execution advice.";

function calculators(result: Record<string, unknown>) {
  return { positionSize: null, forexLotSize: null, liquidation: null, rewardRisk: null, stopLossDistance: null, warning: GENERIC_WARNING, ...result };
}

function pick(name: RegExp | string) {
  return screen.getByRole("button", { name });
}

const TABS_FA = ["اندازه پوزیشن", "فارکس", "لیکوییدیشن", "R:R", "حد ضرر"];

describe("RiskScreen in Persian", () => {
  it("has no English heading, description, calculator tab, field or guardrail", () => {
    const { container } = render(<RiskScreen locale="fa" messages={fa} />);
    expect(englishLeaks(container)).toEqual([]);
    expect(container.textContent).toMatch(ARABIC_SCRIPT);
  });

  it("has no English in any calculator form", () => {
    const { container } = render(<RiskScreen locale="fa" messages={fa} />);
    for (const label of TABS_FA) {
      fireEvent.click(screen.getByText(label, { selector: "button span" }).closest("button")!);
      expect(englishLeaks(container)).toEqual([]);
    }
  });

  it("has no English in the calculator output, including the server's warning", async () => {
    (apiFetch as Mock).mockResolvedValue({
      result: calculators({ positionSize: { riskAmount: 250, stopDistance: 1000, quantity: 0.25, notionalValue: 16250 } })
    });
    const { container } = render(<RiskScreen locale="fa" messages={fa} />);
    fireEvent.click(pick("محاسبه"));
    await waitFor(() => expect(container.textContent).toContain("مقدار ریسک"));
    expect(englishLeaks(container)).toEqual([]);
  });

  it("labels every calculator's result keys in Persian", async () => {
    const results: Record<string, Record<string, unknown>> = {
      forexLotSize: { riskAmount: 250, standardLots: 1, miniLots: 10, microLots: 100 },
      liquidation: { liquidationPrice: 58500, distance: 6500, distancePercent: 0.1, warning: HIGH_LEVERAGE_WARNING },
      rewardRisk: { riskDistance: 1000, rewardDistance: 2000, rewardRiskRatio: 2 },
      stopLossDistance: { distance: 1000, distancePercent: 0.015 }
    };
    const { container } = render(<RiskScreen locale="fa" messages={fa} />);
    for (const [key, label] of [["forexLotSize", "فارکس"], ["liquidation", "لیکوییدیشن"], ["rewardRisk", "R:R"], ["stopLossDistance", "حد ضرر"]] as const) {
      (apiFetch as Mock).mockResolvedValue({ result: calculators({ [key]: results[key] }) });
      fireEvent.click(screen.getByText(label, { selector: "button span" }).closest("button")!);
      fireEvent.click(pick("محاسبه"));
      await waitFor(() => expect(container.textContent).toMatch(/فاصله|لات|قیمت لیکوییدیشن/));
      expect(englishLeaks(container)).toEqual([]);
    }
  });

  it("shows the liquidation estimate's own warning in Persian", async () => {
    (apiFetch as Mock).mockResolvedValue({
      result: calculators({ liquidation: { liquidationPrice: 58500, distance: 6500, distancePercent: 0.1, warning: LIQUIDATION_WARNING } })
    });
    const { container } = render(<RiskScreen locale="fa" messages={fa} />);
    fireEvent.click(screen.getByText("لیکوییدیشن", { selector: "button span" }).closest("button")!);
    fireEvent.click(pick("محاسبه"));
    await waitFor(() => expect(container.textContent).toContain("برآورد آموزشی"));
    expect(container.textContent).not.toContain("educational estimate");
    expect(englishLeaks(container)).toEqual([]);
  });

  it("keeps the English warnings on the English page", async () => {
    (apiFetch as Mock).mockResolvedValue({ result: calculators({ positionSize: { riskAmount: 250, stopDistance: 1000, quantity: 0.25, notionalValue: 16250 } }) });
    render(<RiskScreen locale="en" messages={en} />);
    fireEvent.click(pick("Calculate"));
    expect(await screen.findByText(GENERIC_WARNING)).toBeInTheDocument();
    expect(screen.getByText("Risk Amount")).toBeInTheDocument();
  });
});

describe("RiskScreen explains a rejected calculation", () => {
  function reject(error: unknown) {
    (apiFetch as Mock).mockRejectedValue(error);
  }

  it("says in Persian that the stop loss must differ from the entry price (nested calculator error)", async () => {
    reject(new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { formErrors: [], fieldErrors: { positionSize: ["Stop loss must be different from the entry price"] } }));
    const { container } = render(<RiskScreen locale="fa" messages={fa} />);
    fireEvent.click(pick("محاسبه"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/validation/i);
    expect(alert.textContent).toContain("حد ضرر");
    expect(alert.textContent).toContain("قیمت ورود");
    expect(englishLeaks(alert)).toEqual([]);
    expect(englishLeaks(container)).toEqual([]);
  });

  it("recognises the same rule when the server names the field itself", async () => {
    reject(new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: { stopLoss: ["Stop loss must be different from the entry price"] } }));
    render(<RiskScreen locale="fa" messages={fa} />);
    fireEvent.click(pick("محاسبه"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("حد ضرر");
    expect(alert.textContent).toContain("قیمت ورود");
  });

  it("names the rejected field in Persian for other validation failures", async () => {
    reject(new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: { accountBalance: ["Too small: expected number to be >0"] } }));
    render(<RiskScreen locale="fa" messages={fa} />);
    fireEvent.click(pick("محاسبه"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("موجودی حساب");
    expect(englishLeaks(alert)).toEqual([]);
  });

  it("falls back to a Persian sentence when only the calculator is named", async () => {
    reject(new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: { forexLotSize: ["Too small"] } }));
    render(<RiskScreen locale="fa" messages={fa} />);
    fireEvent.click(screen.getByText("فارکس", { selector: "button span" }).closest("button")!);
    fireEvent.click(pick("محاسبه"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(ARABIC_SCRIPT);
    expect(englishLeaks(alert)).toEqual([]);
  });

  it("explains the same rule in English on the English page", async () => {
    reject(new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: { positionSize: ["Stop loss must be different from the entry price"] } }));
    render(<RiskScreen locale="en" messages={en} />);
    fireEvent.click(pick("Calculate"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toBe("Request validation failed");
    expect(alert.textContent).toMatch(/stop loss must be different from the entry price/i);
  });

  it("shows a Persian line when the calculation fails on the server", async () => {
    reject(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    render(<RiskScreen locale="fa" messages={fa} />);
    fireEvent.click(pick("محاسبه"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(ARABIC_SCRIPT);
    expect(englishLeaks(alert)).toEqual([]);
  });

  it("clears the message when the calculator is changed", async () => {
    reject(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    render(<RiskScreen locale="fa" messages={fa} />);
    fireEvent.click(pick("محاسبه"));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByText("فارکس", { selector: "button span" }).closest("button")!);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("PositionPlanner in Persian", () => {
  const allowed = [/Symbol > Specification/g, /\b(EUR|GBP|AUD|NZD|XAU|XAG|USD|JPY|CHF|CAD)[A-Z]{0,3}\b/g];

  it("has no English label, option or note", () => {
    const { container } = render(<PositionPlanner locale="fa" />);
    expect(englishLeaks(container, allowed)).toEqual([]);
  });

  it("has no English in the sell geometry message or the custom spec fields", () => {
    const { container } = render(<PositionPlanner locale="fa" />);
    fireEvent.change(screen.getByLabelText("جهت"), { target: { value: "sell" } });
    expect(englishLeaks(container, allowed)).toEqual([]);
    fireEvent.change(screen.getByLabelText("نماد"), { target: { value: "custom" } });
    expect(englishLeaks(container, allowed)).toEqual([]);
  });
});

// Glossary: a plan is پلن. برنامه‌ریزی (the activity) and برنامه‌ریز (the planner tool) keep their word.
describe("the risk desk calls a plan پلن", () => {
  const PLAN_AS_PROGRAM = /برنامه(?!‌ریز)/;

  it("RiskScreen", () => {
    const { container } = render(<RiskScreen locale="fa" messages={fa} />);
    expect(container.textContent).not.toMatch(PLAN_AS_PROGRAM);
    expect(container.textContent).toContain("قوانین پلن رعایت شده یا نه");
  });

  it("PositionPlanner", () => {
    const { container } = render(<PositionPlanner locale="fa" />);
    expect(container.textContent).not.toMatch(PLAN_AS_PROGRAM);
    expect(screen.getByText("زیان در حد ضرر برای این پلن")).toBeInTheDocument();
  });
});
