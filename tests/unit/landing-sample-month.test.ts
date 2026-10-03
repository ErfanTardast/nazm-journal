import { describe, expect, it } from "vitest";
import { sampleMonth } from "@/features/landing/sample-month";

// The landing charts all read one illustrative month. Its headline numbers are derived, never typed in, so the hero,
// the histogram and the copy cannot drift apart.
describe("the landing page's sample month", () => {
  it("is thirty trades with a cumulative curve that starts at zero", () => {
    expect(sampleMonth.trades).toHaveLength(30);
    expect(sampleMonth.equity).toHaveLength(31);
    expect(sampleMonth.equity[0]).toBe(0);
  });

  it("derives the month result, the deepest drawdown and rule adherence from the trades", () => {
    expect(sampleMonth.stats.netR).toBeCloseTo(8.7, 5);
    expect(sampleMonth.stats.maxDrawdownR).toBeCloseTo(4.6, 5);
    expect(sampleMonth.stats.adherencePct).toBe(80);
  });

  it("names the mistake that repeats most, with its count and cost", () => {
    expect(sampleMonth.stats.repeated).toEqual({ tag: "late", count: 4, costR: -4 });
  });

  it("pins each kind of mistake once, where it first happens", () => {
    expect(sampleMonth.pins).toEqual([
      { index: 7, tag: "late" },
      { index: 10, tag: "stop" },
      { index: 12, tag: "revenge" }
    ]);
  });

  it("bins every trade exactly once in the R histogram", () => {
    const total = sampleMonth.histogram.reduce((sum, bin) => sum + bin.clean + bin.broken, 0);
    expect(total).toBe(30);
    expect(sampleMonth.histogram.reduce((sum, bin) => sum + bin.broken, 0)).toBe(6);
  });
});
