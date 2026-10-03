import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EmptyState } from "@/components/ui/state";

afterEach(cleanup);

// Product audit, 2026-10-01: a page with no data yet must still say what to do next.
describe("EmptyState", () => {
  it("shows the next steps as links, the first one as the main action", () => {
    render(
      <EmptyState
        title="هنوز معامله‌ای نیست"
        description="بعد از ورود معاملات، نتیجه‌ها اینجا دیده می‌شوند."
        actions={[
          { href: "/fa/import", label: "ورود معاملات MT5" },
          { href: "/fa/journal", label: "ثبت دستی" }
        ]}
      />
    );
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/fa/import", "/fa/journal"]);
    expect(links[0].className).toContain("bg-primary");
    expect(links[1].className).not.toContain("bg-primary");
  });

  it("renders two actions that share a target without a duplicate-key warning", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      render(
        <EmptyState
          title="No plans yet"
          description="Plan your next trade first."
          actions={[
            { href: "/en/plans", label: "New plan" },
            { href: "/en/plans", label: "Plan from a template" }
          ]}
        />
      );
      expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["New plan", "Plan from a template"]);
      expect(error.mock.calls.map((call) => String(call[0])).filter((message) => /same key|unique "key"/i.test(message))).toEqual([]);
    } finally {
      error.mockRestore();
    }
  });

  it("gives the main action the same hover as the landing's primary button", () => {
    render(<EmptyState title="Nothing yet" description="Start here." actions={[{ href: "/en/import", label: "Import trades" }]} />);
    const main = screen.getByRole("link", { name: "Import trades" });
    expect(main.className).toContain("hover:bg-primary/90");
    expect(main.className).not.toContain("brightness");
  });

  it("stays a plain message when there is nothing to do", () => {
    render(<EmptyState title="Nothing here" description="No rows match the filter." />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
