import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { BehaviourPanel } from "@/features/performance/behaviour-panel";
import { englishLeaks } from "./support/english-leaks";
import { latinDigitStrings } from "./support/latin-digits";
import { emptyReport, fullReport } from "./support/performance-report";

afterEach(cleanup);

function renderPanel(locale: "en" | "fa", report = fullReport()) {
  return render(<BehaviourPanel behaviour={report.behaviour} summary={report.summary} locale={locale} />);
}
const block = (name: string | RegExp) => within(screen.getByRole("heading", { name }).closest("section") as HTMLElement);

describe("BehaviourPanel with data", () => {
  it("compares rule adherence with the results, and says how much of it was reviewed", () => {
    renderPanel("en");
    const adherence = block("Rule adherence against result");

    expect(adherence.getByText("70.83%")).toBeInTheDocument();
    expect(adherence.getByText("24 of 30 entries reviewed")).toBeInTheDocument();
    const rows = adherence.getAllByRole("listitem").map((row) => row.textContent);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toBe("FollowedEntries: 17Net P&L: +$410.40Avg R: 0.62R");
    expect(rows[1]).toBe("MixedEntries: 4Net P&L: -$52.15Avg R: -0.31R");
    expect(rows[2]).toBe("BrokenEntries: 3Net P&L: -$82.74Avg R: -0.90R");
  });

  it("counts re-entries within the window after a loss, and how many carried more risk", () => {
    renderPanel("en");
    const reentry = block("Re-entry within 30 minutes after a loss");

    expect(reentry.getByText("5 entries")).toBeInTheDocument();
    expect(reentry.getByText(/2 of them carried more risk than usual \(above 1\.2 times your median risk in this period\)/)).toBeInTheDocument();
    expect(reentry.getByText(/Net result -\$88\.30/)).toBeInTheDocument();
  });

  it("takes the window from the report, not from a constant", () => {
    const report = fullReport();
    report.behaviour.reentry = { ...report.behaviour.reentry, windowMinutes: 45 };
    renderPanel("en", report);

    expect(screen.getByRole("heading", { name: "Re-entry within 45 minutes after a loss" })).toBeInTheDocument();
  });

  it("shows results by order in the day, with the busiest day", () => {
    renderPanel("en");
    const order = block("Results by order in the day");

    const rows = order.getAllByRole("listitem").map((row) => row.textContent);
    expect(rows).toEqual([
      "FirstEntries: 14Win rate: 64.29%Net P&L: +$240.60Avg R: 0.51R",
      "SecondEntries: 9Win rate: 44.44%Net P&L: +$30.20Avg R: 0.08R",
      "Third and laterEntries: 7Win rate: 28.57%Net P&L: -$45.10Avg R: -0.25R"
    ]);
    expect(order.getByText("Busiest day: Sep 19 (4 entries)")).toBeInTheDocument();
  });

  it("shows how trades ended against stop and target, and what the winners that closed early reached", () => {
    renderPanel("en");
    const exits = block("How trades ended against stop and target");

    const rows = exits.getAllByRole("listitem").map((row) => row.textContent);
    expect(rows).toEqual([
      "At target2",
      "In profit before target9",
      "At stop8",
      "Loss larger than 1R2",
      "In loss before stop3",
      "Breakeven1",
      "No stop or target5"
    ]);
    expect(exits.getByText("Winners closed before the target: 2.40R planned on average, 1.30R reached.")).toBeInTheDocument();
    expect(exits.getByText(/within 0\.1R/)).toBeInTheDocument();
  });

  it("writes everything in Persian, with Persian digits and the glossary's words", () => {
    const { container } = renderPanel("fa");

    expect(screen.getByRole("heading", { name: "پایبندی به قوانین در برابر نتیجه" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ورود دوباره تا ۳۰ دقیقه پس از یک ضرر" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "نتیجه بر اساس نوبت معامله در روز" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "پایان معامله نسبت به حد ضرر و حد سود" })).toBeInTheDocument();
    for (const word of ["رعایت شد", "بخشی رعایت شد", "شکسته شد", "در حد سود", "با سود، پیش از حد سود", "در حد ضرر", "زیانی بیشتر از ۱R", "با زیان، پیش از حد ضرر", "سربه‌سر", "بدون حد ضرر یا حد سود"]) {
      expect(container.textContent).toContain(word);
    }
    expect(container.textContent).toContain("با ریسکی بیشتر از ۱٫۲ برابر ریسک معمول شما");
    expect(container.textContent).toContain("۲۴ از ۳۰ ورود مرور شده");
    expect(latinDigitStrings(container)).toEqual([]);
    expect(englishLeaks(container, [/R/g])).toEqual([]);
  });
});

describe("BehaviourPanel without data", () => {
  it("says what is missing in each block, instead of zeros", () => {
    renderPanel("en", emptyReport("30d", { source: "own" }));

    expect(block("Rule adherence against result").getByText(/No entry has a rule review yet/)).toBeInTheDocument();
    expect(block("Re-entry within 30 minutes after a loss").getByText("No entry in this period was opened within 30 minutes after a loss.")).toBeInTheDocument();
    expect(block("Results by order in the day").getByText("No entries to compare in this period.")).toBeInTheDocument();
    expect(block("How trades ended against stop and target").getByText("No closed entry to sort in this period.")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("says each zero state in Persian", () => {
    const { container } = renderPanel("fa", emptyReport("30d", { source: "own" }));

    expect(block("پایبندی به قوانین در برابر نتیجه").getByText(/هنوز هیچ ورودی مرور قوانین ندارد/)).toBeInTheDocument();
    expect(block(/^ورود دوباره/).getByText("در این بازه هیچ ورودی تا ۳۰ دقیقه پس از یک ضرر باز نشد.")).toBeInTheDocument();
    expect(block(/^نتیجه بر اساس نوبت/).getByText("در این بازه ورودی‌ای برای مقایسه نیست.")).toBeInTheDocument();
    expect(block(/^پایان معامله/).getByText("در این بازه ورود بسته‌ای برای دسته‌بندی نیست.")).toBeInTheDocument();
    expect(latinDigitStrings(container)).toEqual([]);
  });

  it("fills only the blocks that have data", () => {
    const report = fullReport();
    report.behaviour.reentry = { ...emptyReport().behaviour.reentry };
    renderPanel("en", report);

    expect(block("Re-entry within 30 minutes after a loss").getByText(/No entry in this period was opened/)).toBeInTheDocument();
    expect(block("Results by order in the day").getByText("Busiest day: Sep 19 (4 entries)")).toBeInTheDocument();
  });

  it("does not claim a rate when no entry was reviewed", () => {
    const report = fullReport();
    report.summary = { ...report.summary, adherence: { followed: 0, mixed: 0, broken: 0, unknown: 30, rate: null } };
    renderPanel("en", report);

    expect(block("Rule adherence against result").getByText(/No entry has a rule review yet/)).toBeInTheDocument();
    expect(screen.queryByText(/entries reviewed/)).not.toBeInTheDocument();
  });
});

describe("BehaviourPanel wording and layout", () => {
  it.each(["en", "fa"] as const)("describes what happened and gives no advice, signal or prediction (%s)", (locale) => {
    for (const report of [fullReport(), emptyReport("30d", { source: "own" })]) {
      const { container, unmount } = renderPanel(locale, report);
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/\bshould\b|\bmust\b|signal|recommend|\bwill\b|revenge|overtrad/i);
      expect(text).not.toMatch(/باید|سیگنال|توصیه|انتقام/);
      unmount();
    }
  });

  it("stacks on a phone: one column below the breakpoint, children allowed to shrink", () => {
    const { container } = renderPanel("en");

    const grids = Array.from(container.querySelectorAll(".grid"));
    expect(grids.length).toBeGreaterThan(0);
    for (const grid of grids) {
      expect(grid.className).toContain("grid-cols-1");
      for (const child of Array.from(grid.children)) expect(child.className).toContain("min-w-0");
    }
  });
});
