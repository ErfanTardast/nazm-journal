import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

const nav = vi.hoisted(() => ({ path: "/fa/journal" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(async () => ({})) }));

import { AppShell } from "@/components/layout/app-shell";

const fa = getMessages("fa");

afterEach(() => {
  cleanup();
  nav.path = "/fa/journal";
});

function shell() {
  return <AppShell locale="fa" messages={fa} canAccessAdmin={false} user={{ name: "Sara Sample", email: "sara@example.com" }}><p>page</p></AppShell>;
}

/** The phone header's "More" disclosure (its summary carries an aria-label; the sidebar's does not). */
function mobileMore() {
  const summary = document.querySelector(`summary[aria-label="${fa.nav.more}"]`) as HTMLElement;
  return { summary, details: summary.closest("details") as HTMLDetailsElement };
}

function openMobileMore() {
  const { summary, details } = mobileMore();
  fireEvent.click(summary);
  expect(details.open).toBe(true);
  return details;
}

// On a phone every secondary page (Strategies, Risk, Import, Settings...) is only reachable through this menu.
describe("mobile More menu", () => {
  it("opens from the header button", () => {
    render(shell());
    expect(mobileMore().details.open).toBe(false);
    openMobileMore();
  });

  it("closes after a destination is chosen", () => {
    render(shell());
    const details = openMobileMore();
    fireEvent.click(within(details).getByRole("link", { name: fa.nav.strategies }));
    expect(details.open).toBe(false);
  });

  it("closes when the route changes", () => {
    const { rerender } = render(shell());
    const details = openMobileMore();
    nav.path = "/fa/strategies";
    rerender(shell());
    expect(details.open).toBe(false);
  });

  it("does not pop open again when the visitor comes back to the page it was opened on", () => {
    const { rerender } = render(shell());
    const details = openMobileMore();
    nav.path = "/fa/strategies"; // e.g. the browser's Back/Forward, which never touches the menu
    rerender(shell());
    expect(details.open).toBe(false);
    nav.path = "/fa/journal";
    rerender(shell());
    expect(details.open).toBe(false);
  });

  it("stays open while the visitor keeps using it on the same page", () => {
    const { rerender } = render(shell());
    const details = openMobileMore();
    rerender(shell());
    expect(details.open).toBe(true);
  });

  it("closes on Escape", () => {
    render(shell());
    const details = openMobileMore();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(details.open).toBe(false);
  });

  it("returns focus to the More button when Escape closes the menu", () => {
    render(shell());
    const { summary } = mobileMore();
    const details = openMobileMore();
    // Focus was inside the menu (a keyboard user tabbed to a link) when Escape was pressed.
    const link = within(details).getByRole("link", { name: fa.nav.strategies });
    link.focus();
    expect(document.activeElement).toBe(link);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });

  it("does not steal focus when the menu is closed by tapping elsewhere", () => {
    render(shell());
    const { summary } = mobileMore();
    openMobileMore();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    fireEvent.pointerDown(outside);
    expect(document.activeElement).toBe(outside);
    expect(document.activeElement).not.toBe(summary);
    outside.remove();
  });

  it("closes when tapping outside it, but not when tapping inside", () => {
    render(shell());
    const details = openMobileMore();
    fireEvent.pointerDown(within(details).getByRole("navigation"));
    expect(details.open).toBe(true);
    fireEvent.pointerDown(document.body);
    expect(details.open).toBe(false);
  });

  it("can be reopened after closing, even on the same page", () => {
    render(shell());
    const details = openMobileMore();
    fireEvent.click(within(details).getByRole("link", { name: fa.nav.risk }));
    expect(details.open).toBe(false);
    openMobileMore();
    fireEvent.click(mobileMore().summary);
    expect(details.open).toBe(false);
  });
});

// Audit round 3: the panel was `absolute end-0` under a button that is not at the screen edge, so at 375px about 106px
// of it ran off-screen (RTL: off the edge where the page cannot scroll). It is anchored to the screen instead.
describe("mobile More menu placement", () => {
  const panel = () => mobileMore().details.querySelector(":scope > div") as HTMLElement;
  const classes = () => panel().className.split(/\s+/);
  /** The arbitrary value inside `max-h-[...]`, e.g. `min(70vh,calc(100dvh-9.5rem-env(safe-area-inset-bottom)))`. */
  const maxHeight = () => classes().find((name) => name.startsWith("max-h-["))?.slice("max-h-[".length, -1) ?? "";

  it("spans the screen with a 16px gutter instead of hanging off the button", () => {
    render(shell());
    expect(classes()).toEqual(expect.arrayContaining(["fixed", "inset-x-4", "top-16", "mx-auto", "max-w-[21rem]"]));
    // Anything positioned from the button (absolute, end-0, a width tied to the viewport) is what clipped it.
    expect(classes()).not.toContain("absolute");
    expect(classes()).not.toContain("end-0");
    expect(classes().some((name) => name.startsWith("w-["))).toBe(false);
  });

  it("scrolls inside itself when the menu is taller than the screen", () => {
    render(shell());
    expect(classes()).toContain("overflow-y-auto");
    expect(maxHeight()).toMatch(/^min\(70vh,/);
  });

  // Review of round 4: the panel lives inside the header's stacking context (sticky, z-20, backdrop blur) and the
  // bottom bar is z-30, so the bar paints over any part of the panel it overlaps. At 600x375 (phone landscape) the
  // panel ended 24px below the top of the bar. So its height is capped to end above the bar instead of out-stacking it.
  it("ends above the bottom bar, whatever the screen height", () => {
    render(shell());
    const height = maxHeight();
    expect(height).toContain("100dvh");
    expect(height).toContain("env(safe-area-inset-bottom)");
    const reserved = Number(height.match(/100dvh-([\d.]+)rem/)?.[1]);
    // Room the panel must leave: its own top offset (top-16 = 4rem) plus the bar. The bar is a 3.5rem link row
    // (min-h-14) with 0.5rem of padding above it (pt-2) and 0.5rem below it, plus its 1px border (under 0.1rem).
    // If the bar's classes change, this sum has to be rechecked, so the classes it is built from are asserted too.
    const bar = document.querySelector("nav.fixed.bottom-0") as HTMLElement;
    expect(bar.className.split(/\s+/)).toContain("pt-2");
    expect(bar.className).toContain("pb-[calc(0.5rem+env(safe-area-inset-bottom))]");
    expect(bar.querySelector("a")?.className.split(/\s+/)).toContain("min-h-14");
    expect(classes()).toContain("top-16");
    expect(reserved).toBeGreaterThanOrEqual(4 + 3.5 + 0.5 + 0.5 + 0.1);
  });

  it("sits above the page content", () => {
    render(shell());
    expect(classes()).toContain("z-50");
  });

  it("relies on the header's backdrop blur as the containing block, so the gutter is measured from the header edges", () => {
    render(shell());
    const header = mobileMore().details.closest("header") as HTMLElement;
    expect(header.className).toContain("backdrop-blur");
    // The header spans the whole width: no max-width or horizontal margin on it, only the page gutter inside it.
    expect(header.className).not.toMatch(/\bmax-w-/);
    expect(header.className).not.toMatch(/\bm[xs]-/);
  });
});

// The desktop sidebar no longer hides pages behind a collapsed "More": tests/unit/app-shell-public.test.tsx covers its groups.
