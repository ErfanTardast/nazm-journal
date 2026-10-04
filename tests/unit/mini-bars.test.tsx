import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MiniBars } from "@/components/ui/charts/mini-bars";

afterEach(cleanup);

/**
 * A bar's height is a percentage, and a percentage only resolves against a parent with a definite height. The bars
 * once sat in a flex column whose height was auto, so every one of them computed to 0 px and the chart looked empty.
 */
const percent = (element: HTMLElement) => Number.parseFloat(element.style.height);
const track = (bar: HTMLElement) => bar.parentElement as HTMLElement;

describe("MiniBars heights", () => {
  it("draws the biggest value at the full height of its track and the others in proportion", () => {
    render(<MiniBars values={[10, 5, 2.5]} />);
    expect(percent(screen.getByTitle("10"))).toBe(100);
    expect(percent(screen.getByTitle("5"))).toBe(50);
    expect(percent(screen.getByTitle("2.5"))).toBe(25);
  });

  it("gives each bar a track with a fixed pixel height, so the percentage has something to resolve against", () => {
    render(<MiniBars values={[10, 5]} />);
    for (const title of ["10", "5"]) {
      const height = track(screen.getByTitle(title)).style.height;
      expect(height, title).toMatch(/^\d+(\.\d+)?px$/);
      expect(Number.parseFloat(height), title).toBeGreaterThan(40);
    }
  });

  it("uses the same track height for every bar, so the bars share one baseline", () => {
    render(<MiniBars data={[{ label: "a", value: 3 }, { label: "", value: 9 }]} />);
    expect(track(screen.getByTitle("3")).style.height).toBe(track(screen.getByTitle("9")).style.height);
  });

  it("draws a single bar at the full height", () => {
    render(<MiniBars values={[7]} />);
    expect(percent(screen.getByTitle("7"))).toBe(100);
  });

  it("draws equal values at the same full height", () => {
    render(<MiniBars values={[4, 4, 4]} />);
    expect(screen.getAllByTitle("4").map(percent)).toEqual([100, 100, 100]);
  });

  it("measures a loss like a gain of the same size", () => {
    render(<MiniBars values={[-8, 4]} />);
    expect(percent(screen.getByTitle("-8"))).toBe(100);
    expect(percent(screen.getByTitle("4"))).toBe(50);
  });

  it("keeps a thin sliver for a zero or tiny value, so the slot does not vanish", () => {
    render(<MiniBars values={[100, 0, 1]} />);
    expect(percent(screen.getByTitle("100"))).toBe(100);
    expect(percent(screen.getByTitle("0"))).toBe(4);
    expect(percent(screen.getByTitle("1"))).toBe(4);
  });

  it("does not divide by zero when every value is zero", () => {
    render(<MiniBars values={[0, 0]} />);
    expect(screen.getAllByTitle("0").map(percent)).toEqual([4, 4]);
  });

  it("titles each bar with the formatted value", () => {
    render(<MiniBars data={[{ label: "0 to 1R", value: 2 }]} valueFormatter={(value) => `${value.toFixed(2)} R`} />);
    expect(screen.getByTitle("2.00 R")).toBeInTheDocument();
    expect(screen.getByText("0 to 1R")).toBeInTheDocument();
  });

  it("says there is no data instead of drawing an empty chart", () => {
    render(<MiniBars values={[]} emptyLabel="Nothing yet" />);
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
  });

  it("is right-to-left safe: no physical left or right in the markup", () => {
    const { container } = render(<MiniBars values={[1, 2, 3]} labels={["a", "b", "c"]} />);
    expect(container.innerHTML).not.toMatch(/\b(?:ml|mr|pl|pr|left|right|text-left|text-right)-/);
  });
});
