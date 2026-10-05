import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { RHistogram } from "@/components/ui/charts/r-histogram";
import { englishLeaks } from "./support/english-leaks";
import { latinDigitStrings } from "./support/latin-digits";
import { histogram } from "./support/performance-report";

afterEach(cleanup);

const COUNTS = [0, 2, 11, 5, 9, 3, 0];
/** A narrow column breaks a label before its last edge, so the label holds a no-break space there. */
const NBSP = String.fromCharCode(0xa0);
const heightOf = (container: HTMLElement, key: string) => Number.parseFloat((container.querySelector(`[data-bucket="${key}"]`) as HTMLElement).style.height);

describe("RHistogram", () => {
  it("shows the seven buckets, each with its label and a visible count", () => {
    render(<RHistogram histogram={histogram(COUNTS, 0)} locale="en" />);

    const items = within(screen.getByRole("list", { name: "Entries by result in R" })).getAllByRole("listitem");
    expect(items.map((item) => (item.textContent ?? "").replaceAll(NBSP, " "))).toEqual([
      "0Below -2R",
      "2-2R to -1R",
      "11-1R to 0",
      "50 to +1R",
      "9+1R to +2R",
      "3+2R to +3R",
      "0+3R or more"
    ]);
  });

  it("gives every bucket its sign in words, and loss and profit their own colours", () => {
    const { container } = render(<RHistogram histogram={histogram(COUNTS, 0)} locale="en" />);

    const keys = ["lt_-2", "-2_-1", "-1_0", "0_1", "1_2", "2_3", "ge_3"];
    keys.forEach((key, index) => {
      const bar = container.querySelector(`[data-bucket="${key}"]`) as HTMLElement;
      expect(bar.className).toContain(index < 3 ? "bg-destructive" : "bg-success");
    });
    expect(screen.getByLabelText(/^Below -2R: 0 entries$/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^0 to \+1R: 5 entries$/)).toBeInTheDocument();
  });

  it("makes the bar heights follow the counts, the largest one full height", () => {
    const { container } = render(<RHistogram histogram={histogram(COUNTS, 0)} locale="en" />);

    expect(heightOf(container, "-1_0")).toBe(100);
    expect(heightOf(container, "1_2")).toBeCloseTo((9 / 11) * 100, 0);
    expect(heightOf(container, "0_1")).toBeCloseTo((5 / 11) * 100, 0);
    expect(heightOf(container, "-2_-1")).toBeCloseTo((2 / 11) * 100, 0);
    expect(heightOf(container, "lt_-2")).toBe(0);
    expect(heightOf(container, "ge_3")).toBe(0);
  });

  it("gives a single non-empty bucket the full height", () => {
    const { container } = render(<RHistogram histogram={histogram([0, 0, 0, 0, 4, 0, 0], 0)} locale="en" />);

    expect(heightOf(container, "1_2")).toBe(100);
    expect(heightOf(container, "0_1")).toBe(0);
  });

  it("keeps a tiny bucket visible next to a large one", () => {
    const { container } = render(<RHistogram histogram={histogram([0, 0, 1, 0, 400, 0, 0], 0)} locale="en" />);

    expect(heightOf(container, "-1_0")).toBeGreaterThanOrEqual(3);
  });

  it("says how many trades have no R, only when some do not", () => {
    const { unmount } = render(<RHistogram histogram={histogram(COUNTS, 3)} locale="en" />);
    expect(screen.getByText(/3 trades without R \(no stop\)/)).toBeInTheDocument();
    unmount();

    render(<RHistogram histogram={histogram(COUNTS, 0)} locale="en" />);
    expect(screen.queryByText(/without R/)).not.toBeInTheDocument();
  });

  it("puts the negative buckets on the left in both languages", () => {
    for (const locale of ["en", "fa"] as const) {
      const { container } = render(<RHistogram histogram={histogram(COUNTS, 0)} locale={locale} />);
      expect(container.firstElementChild).toHaveAttribute("dir", "ltr");
      cleanup();
    }
  });

  it("writes the labels and counts in Persian, with Persian digits only", () => {
    const { container } = render(<RHistogram histogram={histogram(COUNTS, 3)} locale="fa" />);

    const labels = Array.from(container.querySelectorAll("li")).map((item) => item.textContent ?? "");
    expect(labels[0]).toContain("کمتر از");
    expect(labels[2]).toContain("تا");
    expect(labels[2]).toContain("۱۱");
    expect(labels[6]).toContain("یا بیشتر");
    expect(latinDigitStrings(container)).toEqual([]);
    expect(englishLeaks(container, [/R/g])).toEqual([]);
    expect(container.querySelector("li span[dir]")).toHaveAttribute("dir", "rtl");
  });

  it("shows an empty sentence when no entry has an R", () => {
    const { container } = render(<RHistogram histogram={histogram([0, 0, 0, 0, 0, 0, 0], 4)} locale="en" />);

    expect(screen.getByText("No entry with an R in this period.")).toBeInTheDocument();
    expect(screen.getByText(/4 trades without R \(no stop\)/)).toBeInTheDocument();
    expect(container.querySelector("[data-bucket]")).toBeNull();
  });
});
