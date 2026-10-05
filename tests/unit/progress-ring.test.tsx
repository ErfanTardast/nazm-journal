import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProgressRing } from "@/components/ui/progress-ring";
import { latinDigitStrings } from "./support/latin-digits";

afterEach(cleanup);

describe("ProgressRing", () => {
  it("keeps its default output: Latin digits and an English label", () => {
    render(<ProgressRing value={0.8} />);
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "80 percent complete");
  });

  it("writes the percent in Persian digits for locale fa, in the label too", () => {
    const { container } = render(<ProgressRing value={0.8} locale="fa" />);
    expect(screen.getByText("۸۰٪")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "۸۰٪ تکمیل شده");
    expect(latinDigitStrings(container)).toEqual([]);
  });

  it("keeps a label the caller gives", () => {
    render(<ProgressRing value={0.6} locale="fa" label="امتیاز آمادگی" />);
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "امتیاز آمادگی");
    expect(screen.getByText("۶۰٪")).toBeInTheDocument();
  });

  it("clamps the value into 0 to 100%", () => {
    const { rerender } = render(<ProgressRing value={1.7} locale="fa" />);
    expect(screen.getByText("۱۰۰٪")).toBeInTheDocument();
    rerender(<ProgressRing value={-1} locale="fa" />);
    expect(screen.getByText("۰٪")).toBeInTheDocument();
  });
});
