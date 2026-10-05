import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AnalyticsBreakdown } from "@/components/ui/charts/analytics-breakdown";
import { breakdownLabel } from "@/features/performance/report-labels";
import type { BreakdownLabel, BreakdownRow } from "@/lib/calculations/performance/types";
import { englishLeaks } from "./support/english-leaks";
import { latinDigitStrings } from "./support/latin-digits";
import { breakdownRow, fullBreakdowns } from "./support/performance-report";

afterEach(cleanup);

function renderCard(rows: BreakdownRow[], locale: "en" | "fa" = "en") {
  return render(
    <AnalyticsBreakdown title="Performance by symbol" rows={rows} locale={locale} resolveLabel={(label: BreakdownLabel) => breakdownLabel(label, locale)} />
  );
}
const rowNames = (container: HTMLElement) => Array.from(container.querySelectorAll("[data-row-label]")).map((node) => node.textContent);

describe("AnalyticsBreakdown", () => {
  it("shows five rows, then all of them on request", () => {
    const { container } = renderCard(fullBreakdowns().symbol);
    expect(rowNames(container)).toEqual(["XAUUSD", "EURUSD", "US30", "GBPUSD", "USDJPY"]);

    fireEvent.click(screen.getByRole("button", { name: "Show all (6)" }));
    expect(rowNames(container)).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(rowNames(container)).toHaveLength(5);
  });

  it("has no show-all button when five rows or fewer exist", () => {
    renderCard(fullBreakdowns().market);
    expect(screen.queryByRole("button", { name: /Show all/ })).not.toBeInTheDocument();
  });

  it("puts the worst net result first on request, and back again", () => {
    const { container } = renderCard(fullBreakdowns().symbol);
    const toggle = screen.getByRole("button", { name: "Worst first" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(rowNames(container)).toEqual(["EURUSD", "NAS100", "US30", "GBPUSD", "USDJPY"]);

    fireEvent.click(toggle);
    expect(rowNames(container)[0]).toBe("XAUUSD");
  });

  it("makes both buttons at least 44 px high", () => {
    renderCard(fullBreakdowns().symbol);
    for (const name of ["Show all (6)", "Worst first"]) expect(screen.getByRole("button", { name }).className).toContain("min-h-11");
  });

  it("marks the rows with few trades, in words", () => {
    const { container } = renderCard(fullBreakdowns().symbol);
    expect(within(container.querySelectorAll("li")[2] as HTMLElement).getByText("Few trades")).toBeInTheDocument();
    expect(within(container.querySelectorAll("li")[0] as HTMLElement).queryByText("Few trades")).not.toBeInTheDocument();
  });

  it("adds (by open time) to a session derived from the open time, and only to that row", () => {
    const { container } = render(
      <AnalyticsBreakdown title="Performance by session" rows={fullBreakdowns().session} locale="en" resolveLabel={(label) => breakdownLabel(label, "en")} />
    );
    const items = Array.from(container.querySelectorAll("li"));
    expect(items[0].textContent).not.toContain("(by open time)");
    expect(items[1].textContent).toContain("New York (by open time)");
    expect(items[2].textContent).toContain("(by open time)");
  });

  it("writes the net result with its sign and the numbers the way the page language does", () => {
    const { container } = renderCard(fullBreakdowns().symbol);
    const eurusd = Array.from(container.querySelectorAll("li"))[1];

    expect(eurusd.textContent).toContain("-$28.40");
    expect(eurusd.textContent).toContain("Entries: 8");
    expect(eurusd.textContent).toContain("Win rate: 37.5%");
    expect(eurusd.textContent).toContain("Avg R: -0.10R");
    expect(container.querySelectorAll("li")[0].textContent).toContain("+$262.50");
  });

  it("shows a dash, not a zero, for a win rate or an average R that does not exist", () => {
    const { container } = renderCard([breakdownRow({ kind: "text", text: "XAUUSD" }, { entries: 2, wins: 0, losses: 0, winRate: null, netPnl: 0, averageR: null })]);
    const row = container.querySelector("li") as HTMLElement;
    expect(row.textContent).toContain("Win rate: —");
    expect(row.textContent).toContain("Avg R: —");
  });

  it("says how many entries in a row have no money value", () => {
    const { container } = renderCard([breakdownRow({ kind: "text", text: "XAUUSD" }, { unpriced: 2 })]);
    expect(container.textContent).toContain("2 without a money value");
    cleanup();
    const other = renderCard([breakdownRow({ kind: "text", text: "XAUUSD" })]);
    expect(other.container.textContent).not.toContain("without a money value");
  });

  it("draws losses to the left in red and profits to the right in green, on a left-to-right track in both languages", () => {
    for (const locale of ["en", "fa"] as const) {
      const { container } = renderCard(fullBreakdowns().symbol, locale);
      const tracks = Array.from(container.querySelectorAll("[data-track]"));
      expect(tracks.length).toBe(5);
      for (const track of tracks) expect(track).toHaveAttribute("dir", "ltr");

      const profit = container.querySelector('[data-bar="profit"]') as HTMLElement;
      const loss = container.querySelector('[data-bar="loss"]') as HTMLElement;
      expect(profit.className).toContain("bg-success");
      expect(profit.className).toContain("rounded-e-sm");
      expect(loss.className).toContain("bg-destructive");
      expect(loss.className).toContain("rounded-s-sm");
      expect(profit.className).not.toMatch(/rounded-[lr]-/);
      expect(loss.className).not.toMatch(/rounded-[lr]-/);
      // The loss sits in the first half of the track, the profit in the second.
      expect(Array.from(loss.parentElement!.parentElement!.children).indexOf(loss.parentElement!)).toBe(0);
      expect(Array.from(profit.parentElement!.parentElement!.children).indexOf(profit.parentElement!)).toBe(2);
      cleanup();
    }
  });

  it("scales the bars to the largest net result", () => {
    const { container } = renderCard(fullBreakdowns().symbol);
    const widths = Array.from(container.querySelectorAll("[data-bar]")).map((bar) => Number.parseFloat((bar as HTMLElement).style.width));
    expect(widths[0]).toBe(100);
    expect(widths[1]).toBeCloseTo((28.4 / 262.5) * 100, 0);
  });

  it("writes the Persian page in Persian: marker, suffix, labels, digits", () => {
    const { container } = render(
      <AnalyticsBreakdown title="عملکرد بر اساس سشن" rows={fullBreakdowns().session} locale="fa" resolveLabel={(label) => breakdownLabel(label, "fa")} />
    );

    expect(screen.getByText("معامله کم")).toBeInTheDocument();
    expect(container.textContent).toContain("لندن");
    expect(container.textContent).toContain("نیویورک (از ساعت باز شدن)");
    expect(latinDigitStrings(container)).toEqual([]);
    expect(englishLeaks(container, [/R/g])).toEqual([]);
  });

  it("says what to do when there are no rows", () => {
    renderCard([]);
    expect(screen.getByText("Add more journal entries to populate this review.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("AnalyticsBreakdown row links", () => {
  const hrefOf = (row: BreakdownRow) => `/en/journal?row=${encodeURIComponent(row.id)}`;

  it("has no link unless the page gives it a place to go", () => {
    renderCard(fullBreakdowns().symbol);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("gives each shown row a link that names the row, to where the page says", () => {
    const rows = fullBreakdowns().symbol;
    render(<AnalyticsBreakdown title="Performance by symbol" rows={rows} locale="en" resolveLabel={(label) => breakdownLabel(label, "en")} rowHref={hrefOf} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(5);
    expect(links[0]).toHaveAccessibleName("See these trades: XAUUSD");
    expect(links[0]).toHaveAttribute("href", hrefOf(rows[0]));
    expect(links[1]).toHaveAccessibleName("See these trades: EURUSD");

    fireEvent.click(screen.getByRole("button", { name: "Show all (6)" }));
    expect(screen.getAllByRole("link")).toHaveLength(6);
  });

  it("names a key row by its words, and writes the link in Persian on the Persian page", () => {
    const rows = fullBreakdowns().weekday;
    const { container } = render(
      <AnalyticsBreakdown
        title="عملکرد بر اساس روز هفته"
        rows={rows}
        locale="fa"
        resolveLabel={(label) => breakdownLabel(label, "fa")}
        rowHref={hrefOf}
      />
    );
    const link = screen.getByRole("link", { name: "دیدن این معامله‌ها: " + breakdownLabel({ kind: "key", key: "weekday.3" }, "fa") });
    expect(link).toHaveAttribute("href", hrefOf(rows[1]));
    expect(link).toHaveTextContent("دیدن این معامله‌ها");
    expect(latinDigitStrings(container)).toEqual([]);
    expect(englishLeaks(container, [/R/g])).toEqual([]);
  });

  it("stays out of the way: the link sits on the stats line and is at least 44 px high", () => {
    const { container } = render(
      <AnalyticsBreakdown title="Performance by symbol" rows={fullBreakdowns().market} locale="en" resolveLabel={(label) => breakdownLabel(label, "en")} rowHref={hrefOf} />
    );
    const link = screen.getAllByRole("link")[0];
    expect(link.className).toContain("min-h-11");
    // Not in the line with the label and the net result, which are tight on a 375 px phone.
    expect(container.querySelector("[data-row-label]")?.closest("div")?.contains(link)).toBe(false);
  });
});
