import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EquityDrawdownChart } from "@/components/ui/charts/equity-drawdown-chart";
import { dayKey } from "@/lib/calculations/performance/time";
import { formatShortDay } from "@/lib/i18n/format";
import { englishLeaks } from "./support/english-leaks";
import { latinDigitStrings } from "./support/latin-digits";
import { equityPoints } from "./support/performance-report";

afterEach(cleanup);

const ZONE = "Asia/Tehran";
const labelOf = (container: HTMLElement, which: "first" | "last") => container.querySelector(`[data-chart-label="${which}"]`)?.textContent ?? "";

describe("EquityDrawdownChart", () => {
  it("keeps time running left to right in both languages", () => {
    for (const locale of ["en", "fa"] as const) {
      render(<EquityDrawdownChart points={equityPoints(24)} locale={locale} timeZone={ZONE} />);
      expect(screen.getByRole("img")).toHaveAttribute("dir", "ltr");
      cleanup();
    }
  });

  it("writes every tick label as HTML outside the SVG, so none is scaled down on a phone", () => {
    const { container } = render(<EquityDrawdownChart points={equityPoints(24)} locale="en" timeZone={ZONE} />);

    expect(container.querySelectorAll("svg text")).toHaveLength(0);
    const labels = Array.from(container.querySelectorAll("[data-chart-label], [data-chart-tick]"));
    expect(labels.length).toBeGreaterThanOrEqual(5);
    for (const label of labels) {
      expect(label.closest("svg")).toBeNull();
      expect(label.className).toMatch(/text-\[11px\]|text-xs/);
    }
  });

  it("labels the first and the last point with their day and trade number", () => {
    const points = equityPoints(30);
    const { container } = render(<EquityDrawdownChart points={points} locale="en" timeZone={ZONE} />);

    expect(labelOf(container, "first")).toBe(`${formatShortDay(dayKey(points[0].at, ZONE), "en")} Trade 1`);
    expect(labelOf(container, "last")).toBe(`${formatShortDay(dayKey(points[29].at, ZONE), "en")} Trade 30`);
  });

  it("uses the Persian calendar and Persian digits for the labels on the Persian page", () => {
    const points = equityPoints(30);
    const { container } = render(<EquityDrawdownChart points={points} locale="fa" timeZone={ZONE} />);

    expect(labelOf(container, "first")).toBe(`${formatShortDay(dayKey(points[0].at, ZONE), "fa")} معامله‌ی ۱`);
    expect(labelOf(container, "last")).toBe(`${formatShortDay(dayKey(points[29].at, ZONE), "fa")} معامله‌ی ۳۰`);
  });

  it("gives screen readers a summary in the page language: trades, last equity, deepest drawdown", () => {
    const points = equityPoints(24);
    const last = points[23].equity;
    const deepest = Math.max(...points.map((point) => point.drawdown));
    const { container } = render(<EquityDrawdownChart points={points} locale="en" timeZone={ZONE} />);

    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toContain("Equity curve and drawdown");
    expect(label).toContain("24 closed trades");
    expect(label).toContain(`$${last.toFixed(2)}`);
    expect(label).toContain(`$${deepest.toFixed(2)}`);
    expect(container.textContent).toContain("24 closed trades");
  });

  it("writes the same summary in Persian, with Persian digits only", () => {
    const { container } = render(<EquityDrawdownChart points={equityPoints(24)} locale="fa" timeZone={ZONE} />);

    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toMatch(/[؀-ۿ]/);
    expect(label).toContain("۲۴");
    expect(latinDigitStrings(container)).toEqual([]);
    expect(englishLeaks(container)).toEqual([]);
  });

  it("draws the drawdown area only when the curve fell below a high", () => {
    const falling = render(<EquityDrawdownChart points={equityPoints(24)} locale="en" timeZone={ZONE} />);
    expect(falling.container.querySelector('[data-chart-part="drawdown-area"]')).not.toBeNull();
    cleanup();

    const rising = equityPoints(10).map((point, index) => ({ ...point, equity: (index + 1) * 10, drawdown: 0 }));
    const { container } = render(<EquityDrawdownChart points={rising} locale="en" timeZone={ZONE} />);
    expect(container.querySelector('[data-chart-part="drawdown-area"]')).toBeNull();
    expect(container.querySelector('[data-chart-part="equity-line"]')).not.toBeNull();
  });

  it("draws the curve from the left edge to the right edge, in the order of the trades", () => {
    const { container } = render(<EquityDrawdownChart points={equityPoints(5)} locale="fa" timeZone={ZONE} />);

    const coordinates = (container.querySelector('[data-chart-part="equity-line"]')?.getAttribute("points") ?? "")
      .split(" ")
      .map((pair) => Number(pair.split(",")[0]));
    expect(coordinates).toHaveLength(5);
    expect(coordinates[0]).toBe(0);
    expect(coordinates[4]).toBe(100);
    expect([...coordinates].sort((a, b) => a - b)).toEqual(coordinates);
  });

  it.each([0, 1])("shows the empty box with its sentence for %i points", (count) => {
    const { container } = render(<EquityDrawdownChart points={equityPoints(count)} locale="en" timeZone={ZONE} />);

    expect(screen.getByText(/Two or more closed trades with a money value are needed to draw the curve/)).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("says the empty sentence in Persian", () => {
    render(<EquityDrawdownChart points={[]} locale="fa" timeZone={ZONE} />);

    expect(screen.getByText(/دو معامله‌ی بسته یا بیشتر/)).toBeInTheDocument();
  });
});
