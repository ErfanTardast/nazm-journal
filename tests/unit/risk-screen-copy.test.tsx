import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { englishLeaks } from "./support/english-leaks";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api/client";
import { RiskScreen } from "@/features/risk/risk-screen";

const en = getMessages("en");
const fa = getMessages("fa");

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

function calculators(result: Record<string, unknown>) {
  return { positionSize: null, forexLotSize: null, liquidation: null, rewardRisk: null, stopLossDistance: null, warning: "", ...result };
}

describe("the risk desk's page copy describes the plan flow", () => {
  it("English: no longer sends the trader to record the output by hand", () => {
    const { container } = render(<RiskScreen locale="en" messages={en} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/record the output in a trade plan or journal entry/i);
    expect(text).not.toMatch(/before a trade is added to the journal/i);
    expect(text).toContain("save the result into the plan");
    expect(text).toContain("These calculators do not save anything");
    expect(text).toContain("position planner");
  });

  it("Persian: no longer sends the trader to record the output by hand", () => {
    const { container } = render(<RiskScreen locale="fa" messages={fa} />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("خروجی را در پلن یا ژورنال ثبت کنید");
    expect(text).not.toContain("قبل از ثبت معامله در ژورنال، اندازه ریسک");
    expect(text).toContain("نتیجه را در خود پلن ذخیره کنید");
    expect(text).toContain("این ماشین‌حساب‌ها چیزی ذخیره نمی‌کنند");
    // "حجم" belongs to the planner's name and again to the plan being sized, not "calculate one of your plans".
    expect(text).toContain("پایین‌تر در برنامه‌ریز حجم، حجم یکی از پلن‌هایتان را حساب و در همان پلن ذخیره کنید");
    expect(englishLeaks(container)).toEqual([]);
  });

  it("what the page says is true: the calculators only calculate", async () => {
    (apiFetch as Mock).mockResolvedValue({ result: calculators({ positionSize: { riskAmount: 250, stopDistance: 1000, quantity: 0.25, notionalValue: 16250 } }) });
    render(<RiskScreen locale="en" messages={en} />);
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await screen.findByText("Risk Amount");
    // Only the calculation was requested: nothing is written anywhere.
    expect((apiFetch as Mock).mock.calls.map((call) => [call[0], (call[1] as RequestInit).method])).toEqual([["/api/risk/calculators", "POST"]]);
  });
});

describe("the calculator output in Persian has no Latin digits", () => {
  it("writes lots, quantities and ratios in Persian digits", async () => {
    (apiFetch as Mock).mockResolvedValue({
      result: calculators({ positionSize: { riskAmount: 250, stopDistance: 1000, quantity: 0.25, notionalValue: 16250 } })
    });
    const { container } = render(<RiskScreen locale="fa" messages={fa} />);
    fireEvent.click(screen.getByRole("button", { name: "محاسبه" }));
    await waitFor(() => expect(container.textContent).toContain("مقدار ریسک"));
    expect(container.textContent).toContain("۰٫۲۵۰۰");
    expect(container.textContent).not.toContain("0.2500");
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("covers whole numbers and ratios too", async () => {
    (apiFetch as Mock).mockResolvedValue({ result: calculators({ forexLotSize: { riskAmount: 250, standardLots: 1, miniLots: 10, microLots: 100 } }) });
    const { container } = render(<RiskScreen locale="fa" messages={fa} />);
    fireEvent.click(screen.getByText("فارکس", { selector: "button span" }).closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: "محاسبه" }));
    await waitFor(() => expect(container.textContent).toContain("لات استاندارد"));
    expect(container.textContent).not.toMatch(/\d/);

    (apiFetch as Mock).mockResolvedValue({ result: calculators({ rewardRisk: { riskDistance: 1000, rewardDistance: 2500, rewardRiskRatio: 2.5 } }) });
    fireEvent.click(screen.getByText("R:R", { selector: "button span" }).closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: "محاسبه" }));
    await waitFor(() => expect(container.textContent).toContain("۲٫۵۰۰۰"));
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("keeps the English output as it was", async () => {
    (apiFetch as Mock).mockResolvedValue({ result: calculators({ positionSize: { riskAmount: 250, stopDistance: 1000, quantity: 0.25, notionalValue: 16250 } }) });
    const { container } = render(<RiskScreen locale="en" messages={en} />);
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await waitFor(() => expect(container.textContent).toContain("Risk Amount"));
    expect(container.textContent).toContain("0.2500");
  });
});

describe("the calculator fields", () => {
  it("keep numbers left to right on the Persian page", () => {
    const { container } = render(<RiskScreen locale="fa" messages={fa} />);
    const inputs = Array.from(container.querySelectorAll("input[name]"));
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) expect(input).toHaveAttribute("dir", "ltr");
  });
});
