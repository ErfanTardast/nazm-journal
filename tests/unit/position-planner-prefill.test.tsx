import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PositionPlanner } from "@/features/risk/position-planner";
import type { PlannerPrefill } from "@/features/risk/plan-sizing";
import { englishLeaks } from "./support/english-leaks";

afterEach(cleanup);

const EURUSD: PlannerPrefill = {
  symbol: "EURUSD",
  direction: "buy",
  balance: "20000",
  risk: "0.5",
  entry: "1.10000",
  stopLoss: "1.09800",
  finalTp: "1.10600",
  positions: "3"
};

describe("PositionPlanner opened from a plan", () => {
  it("starts from the plan's numbers and sizes them", () => {
    render(<PositionPlanner locale="en" prefill={EURUSD} />);
    expect(screen.getByLabelText("Account balance")).toHaveValue("20000");
    expect(screen.getByLabelText("Risk %")).toHaveValue("0.5");
    expect(screen.getByLabelText("Entry")).toHaveValue("1.10000");
    expect(screen.getByLabelText("Stop loss")).toHaveValue("1.09800");
    expect(screen.getByLabelText("Final take profit")).toHaveValue("1.10600");
    // 20 000 x 0.5% = 100 at a 200-per-lot stop: the same 0.50 lots as the standalone example.
    expect(screen.getByText("0.50 lots")).toBeInTheDocument();
  });

  it("starts from the plan's side and symbol", () => {
    render(<PositionPlanner locale="en" prefill={{ ...EURUSD, symbol: "custom", direction: "sell" }} />);
    expect(screen.getByLabelText("Direction")).toHaveValue("sell");
    expect(screen.getByLabelText("Symbol")).toHaveValue("custom");
    expect(screen.getByLabelText("Tick size")).toBeInTheDocument();
  });

  it("leaves a field empty when the plan has no number for it, instead of an example number", () => {
    render(<PositionPlanner locale="en" prefill={{ symbol: "custom", direction: "buy", balance: "", risk: "1", entry: "", stopLoss: "", finalTp: "", positions: "3" }} />);
    for (const label of ["Account balance", "Entry", "Stop loss", "Final take profit"]) {
      expect(screen.getByLabelText(label)).toHaveValue("");
    }
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Balance and risk % must be positive, with risk at most 100%.")).toBeInTheDocument();
  });

  it("leaves the contract spec empty when the plan gives it as empty, and asks for it instead of sizing on an example", () => {
    render(<PositionPlanner locale="en" prefill={{ ...EURUSD, symbol: "custom", digits: "", tickSize: "", tickValue: "", volumeMin: "", volumeMax: "", volumeStep: "" }} />);
    for (const label of ["Price digits", "Tick size", "Tick value (per lot)", "Minimum lot", "Maximum lot", "Lot step"]) {
      expect(screen.getByLabelText(label), label).toHaveValue("");
    }
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Enter a valid symbol specification (tick size, tick value and lot rules).")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Price digits"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Tick size"), { target: { value: "0.00001" } });
    fireEvent.change(screen.getByLabelText("Tick value (per lot)"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Minimum lot"), { target: { value: "0.01" } });
    fireEvent.change(screen.getByLabelText("Maximum lot"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Lot step"), { target: { value: "0.01" } });
    expect(screen.getByText("0.50 lots")).toBeInTheDocument();
  });

  it("keeps the example spec for the standalone planner's own 'custom' choice", () => {
    render(<PositionPlanner locale="en" />);
    fireEvent.change(screen.getByLabelText("Symbol"), { target: { value: "custom" } });
    expect(screen.getByLabelText("Tick size")).toHaveValue("0.00001");
    expect(screen.getByLabelText("Tick value (per lot)")).toHaveValue("1");
    expect(screen.getByText("0.50 lots")).toBeInTheDocument();
  });

  it("explains where a starting value came from, until the trader changes it", () => {
    render(<PositionPlanner locale="en" prefill={EURUSD} hints={{ balance: "From your account settings.", entry: "Midpoint of the plan's entry zone." }} />);
    expect(screen.getByText("From your account settings.")).toBeInTheDocument();
    expect(screen.getByText("Midpoint of the plan's entry zone.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Account balance"), { target: { value: "30000" } });
    expect(screen.queryByText("From your account settings.")).toBeNull();
    expect(screen.getByText("Midpoint of the plan's entry zone.")).toBeInTheDocument();
  });

  it("explains a symbol and a direction the same way", () => {
    render(<PositionPlanner locale="en" prefill={{ ...EURUSD, symbol: "custom" }} hints={{ symbol: "No preset for this symbol.", direction: "Guessed from the bias." }} />);
    expect(screen.getByText("No preset for this symbol.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "sell" } });
    expect(screen.queryByText("Guessed from the bias.")).toBeNull();
    expect(screen.getByText("No preset for this symbol.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Symbol"), { target: { value: "EURUSD" } });
    expect(screen.queryByText("No preset for this symbol.")).toBeNull();
  });

  it("does not overwrite a balance the trader already typed with one that arrives late", () => {
    const { rerender } = render(<PositionPlanner locale="en" prefill={{}} />);
    expect(screen.getByLabelText("Account balance")).toHaveValue("10000");
    fireEvent.change(screen.getByLabelText("Account balance"), { target: { value: "5000" } });
    rerender(<PositionPlanner locale="en" prefill={{ balance: "25000" }} />);
    expect(screen.getByLabelText("Account balance")).toHaveValue("5000");
  });

  it("starts from the account's balance when only that is known", () => {
    const { rerender } = render(<PositionPlanner locale="en" />);
    expect(screen.getByLabelText("Account balance")).toHaveValue("10000");
    rerender(<PositionPlanner locale="en" prefill={{ balance: "20000" }} />);
    expect(screen.getByLabelText("Account balance")).toHaveValue("20000");
    // The rest of the standalone example is untouched.
    expect(screen.getByLabelText("Entry")).toHaveValue("1.10000");
    expect(screen.getByLabelText("Number of positions")).toHaveValue("3");
  });

  it("hands what it worked out to a footer, and keeps it current as the numbers change", () => {
    render(
      <PositionPlanner
        locale="en"
        prefill={EURUSD}
        footer={(snapshot) => (
          <p data-testid="footer">
            {snapshot.symbol}|{snapshot.direction}|{snapshot.balance}|{snapshot.riskPercent}|{snapshot.positions}|{snapshot.result.ok ? snapshot.result.plan.totalVolume : "no result"}
          </p>
        )}
      />
    );
    expect(screen.getByTestId("footer")).toHaveTextContent("EURUSD|buy|20000|0.5|3|0.5");
    fireEvent.change(screen.getByLabelText("Risk %"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Number of positions"), { target: { value: "2" } });
    expect(screen.getByTestId("footer")).toHaveTextContent("EURUSD|buy|20000|1|2|1");
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "sell" } });
    expect(screen.getByTestId("footer")).toHaveTextContent("EURUSD|sell|20000|1|2|no result");
  });

  it("shows no footer area when there is none", () => {
    const { container } = render(<PositionPlanner locale="en" />);
    expect(container.querySelector(".border-t.pt-5")).toBeNull();
  });
});

describe("PositionPlanner in Persian prints no Latin digits or percent signs of its own", () => {
  it("writes the loss percent, R and the leg numbers in Persian digits", () => {
    const { container } = render(<PositionPlanner locale="fa" />);
    expect(container.textContent).toContain("(۱٫۰۰٪)");
    expect(container.textContent).toContain("۳٫۰۰R");
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual(["۱", "۲", "۳"]);
    expect(within(rows[0]).getAllByRole("cell")[3].textContent).toBe("۱٫۰۰");
    expect(container.textContent).not.toMatch(/\d\.\d\d%/);
  });

  it("keeps the English page as it was", () => {
    const { container } = render(<PositionPlanner locale="en" />);
    expect(container.textContent).toContain("(1.00%)");
    expect(container.textContent).toContain("3.00R");
    expect(within(screen.getByRole("table")).getAllByRole("row")[1]).toHaveTextContent(/^1/);
  });

  it("has no English when opened from a plan", () => {
    const { container } = render(<PositionPlanner locale="fa" prefill={{ ...EURUSD, symbol: "custom" }} hints={{ balance: "از موجودی اولیه حساب" }} />);
    expect(englishLeaks(container, [/Symbol > Specification/g, /\b(EUR|GBP|AUD|NZD|XAU|XAG|USD|JPY|CHF|CAD)[A-Z]{0,3}\b/g])).toEqual([]);
  });
});
