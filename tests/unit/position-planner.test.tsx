import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PositionPlanner } from "@/features/risk/position-planner";

afterEach(cleanup);

describe("PositionPlanner", () => {
  it("plans the default EURUSD example: total lots, legs and TP ladder", () => {
    render(<PositionPlanner locale="en" />);
    expect(screen.getByText("0.50 lots")).toBeInTheDocument();
    const legs = screen.getByRole("table");
    expect(within(legs).getAllByRole("row")).toHaveLength(4); // header + 3 legs
    expect(within(legs).getAllByText("0.17")).toHaveLength(2);
    expect(within(legs).getByText("0.16")).toBeInTheDocument();
    expect(within(legs).getByText("1.10600")).toBeInTheDocument();
    expect(screen.getByText(/never places orders/i)).toBeInTheDocument();
  });

  it("recomputes as inputs change", () => {
    render(<PositionPlanner locale="en" />);
    fireEvent.change(screen.getByLabelText("Commission per lot"), { target: { value: "7" } });
    expect(screen.getByText("0.48 lots")).toBeInTheDocument();
  });

  it("reads Persian digits and the Persian decimal mark typed into the fields", () => {
    render(<PositionPlanner locale="en" />);
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "۱٫۱۰۰۰۰" } });
    fireEvent.change(screen.getByLabelText("Commission per lot"), { target: { value: "۷" } });
    expect(screen.getByText("0.48 lots")).toBeInTheDocument();
  });

  it("explains inverted geometry instead of showing a plan", () => {
    render(<PositionPlanner locale="en" />);
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "sell" } });
    expect(screen.getByText(/SELL needs Final TP < Entry < Stop Loss/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("asks for the broker's own spec when Custom is chosen", () => {
    render(<PositionPlanner locale="en" />);
    fireEvent.change(screen.getByLabelText("Symbol"), { target: { value: "custom" } });
    expect(screen.getByLabelText("Tick size")).toBeInTheDocument();
    expect(screen.getByLabelText("Tick value (per lot)")).toBeInTheDocument();
  });

  it("renders in Persian", () => {
    render(<PositionPlanner locale="fa" />);
    expect(screen.getByText("برنامه‌ریز حجم پوزیشن")).toBeInTheDocument();
  });
});

// A stranger has no "MT5 risk panel": the intro says what the planner does itself.
describe("PositionPlanner intro", () => {
  it("does not point at a tool the reader does not have (English)", () => {
    const { container } = render(<PositionPlanner locale="en" />);
    expect(container.textContent).not.toMatch(/risk panel/i);
    expect(container.textContent).not.toMatch(/same math/i);
    expect(screen.getByText(/rounded down to the lot step and checked against the minimum and maximum lot/)).toBeInTheDocument();
  });

  it("does not point at a tool the reader does not have (Persian)", () => {
    const { container } = render(<PositionPlanner locale="fa" />);
    expect(container.textContent).not.toContain("پنل ریسک");
    expect(container.textContent).not.toContain("همان محاسبه");
    expect(screen.getByText(/رو به پایین گرد می‌شود و با حداقل و حداکثر لات بررسی می‌شود/)).toBeInTheDocument();
  });

  // The sentence is only true if the maths does it: a 190-tick stop sizes 100 / 190 = 0.5263 lots, which is 0.52, never 0.53.
  it("keeps the promise: the volume is rounded down to the lot step", () => {
    render(<PositionPlanner locale="en" />);
    fireEvent.change(screen.getByLabelText("Stop loss"), { target: { value: "1.09810" } });
    expect(screen.getByText("0.52 lots")).toBeInTheDocument();
    expect(screen.queryByText("0.53 lots")).toBeNull();
  });
});
