import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

const nav = vi.hoisted(() => ({ path: "/en/performance" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "@/lib/api/client";
import { AppShell } from "@/components/layout/app-shell";
import { announceSampleChange, announceSampleRemoved } from "@/features/sample/sample-workspace-client";

const en = getMessages("en");
const user = { name: "Sara Sample", email: "sara@example.com" };

const server = { active: true };
function serve() {
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    if (path !== "/api/sample-workspace") return {};
    if (init?.method === "DELETE") {
      server.active = false;
      return { active: false, removed: { trades: 30, strategies: 2, plans: 2, reviews: 2 } };
    }
    return { active: server.active, loadedAt: server.active ? "2026-10-02T09:30:00.000Z" : null, canLoad: true };
  });
}

const mounts = vi.hoisted(() => ({ count: 0 }));
/** A page that holds its own data, like the performance and journal screens: it is fetched when the page mounts. */
function Page() {
  useEffect(() => {
    mounts.count += 1;
  }, []);
  return <p>page content</p>;
}

const shell = (signedIn = true) => (
  <AppShell locale="en" messages={en} canAccessAdmin={false} user={signedIn ? user : null}>
    <Page />
  </AppShell>
);

const askedAboutSample = () => (apiFetch as Mock).mock.calls.filter(([path]) => path === "/api/sample-workspace").length;

beforeEach(() => {
  server.active = true;
  mounts.count = 0;
  nav.path = "/en/performance";
  serve();
});

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

describe("the sample data label in the workspace shell", () => {
  it("shows above the page content, on a signed-in page, while sample data is loaded", async () => {
    render(shell());
    const strip = await screen.findByRole("region", { name: "Sample data notice" });
    const page = screen.getByText("page content");

    expect(strip.compareDocumentPosition(page) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("main")).toContainElement(strip);
  });

  it("is in the page's language", async () => {
    render(
      <AppShell locale="fa" messages={getMessages("fa")} canAccessAdmin={false} user={user}>
        <Page />
      </AppShell>
    );
    expect(await screen.findByRole("button", { name: "حذف داده نمونه" })).toBeInTheDocument();
  });

  it("adds nothing to a page of an account without sample data", async () => {
    server.active = false;
    const { container } = render(shell());
    await waitFor(() => expect(askedAboutSample()).toBe(1));
    await act(async () => {});

    expect(screen.queryByRole("region", { name: "Sample data notice" })).toBeNull();
    expect(container.querySelector('[aria-label="Sample data notice"]')).toBeNull();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("is not asked for, and not shown, on the public site (no signed-in user)", async () => {
    render(shell(false));
    await act(async () => {});

    expect(askedAboutSample()).toBe(0);
    expect(screen.queryByRole("region", { name: "Sample data notice" })).toBeNull();
  });

  it("does not remount the page on an ordinary page change", async () => {
    const { rerender } = render(shell());
    await screen.findByRole("region", { name: "Sample data notice" });
    expect(mounts.count).toBe(1);

    nav.path = "/en/journal";
    rerender(shell());
    await waitFor(() => expect(askedAboutSample()).toBe(2));

    expect(mounts.count).toBe(1);
  });

  it("remounts the page after the sample data is removed, so a page that holds its own data shows what is left", async () => {
    render(shell());
    fireEvent.click(await screen.findByRole("button", { name: "Remove sample data" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Sample data removed.");
    await waitFor(() => expect(mounts.count).toBe(2));
  });

  describe("the mark in the sticky header", () => {
    // The strip scrolls away with the page; the header does not, so the header carries a small "Sample data" mark.
    const header = (container: HTMLElement) => container.querySelector("header") as HTMLElement;
    const marks = (container: HTMLElement) => [...header(container).querySelectorAll("[data-sample-mark]")];
    // The header hears about the strip one render after the strip shows, so wait for it.
    const markShown = (container: HTMLElement) => waitFor(() => expect(marks(container).length).toBeGreaterThan(0));

    it("is in the header while sample data is loaded, and the strip itself is not", async () => {
      const { container } = render(shell());
      const strip = await screen.findByRole("region", { name: "Sample data notice" });
      await markShown(container);

      for (const mark of marks(container)) expect(mark).toHaveTextContent("Sample data");
      expect(header(container)).not.toContainElement(strip);
    });

    it("is in the page's language", async () => {
      const { container } = render(
        <AppShell locale="fa" messages={getMessages("fa")} canAccessAdmin={false} user={user}>
          <Page />
        </AppShell>
      );
      await screen.findByRole("button", { name: "حذف داده نمونه" });
      await markShown(container);

      for (const mark of marks(container)) expect(mark).toHaveTextContent("داده نمونه");
    });

    it("is not in the header of an account without sample data", async () => {
      server.active = false;
      const { container } = render(shell());
      await waitFor(() => expect(askedAboutSample()).toBe(1));
      await act(async () => {});

      expect(marks(container)).toHaveLength(0);
    });

    it("goes when the sample data is removed", async () => {
      const { container } = render(shell());
      fireEvent.click(await screen.findByRole("button", { name: "Remove sample data" }));
      await markShown(container);
      fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Sample data removed."));

      await waitFor(() => expect(marks(container)).toHaveLength(0));
    });

    it("goes at once when the first real trade removes it, and the strip says why", async () => {
      const { container } = render(shell());
      await screen.findByRole("button", { name: "Remove sample data" });
      await markShown(container);

      await act(async () => {
        announceSampleRemoved();
      });

      expect(marks(container)).toHaveLength(0);
      expect(screen.getByRole("status")).toHaveTextContent("because you saved your first real trade");
      // The page that saved the trade is not remounted: it has loaded its own list.
      expect(mounts.count).toBe(1);
    });

    it("keeps the subtitle line on a wide screen, where the mark has room beside the language switch", async () => {
      const { container } = render(shell());
      await screen.findByRole("region", { name: "Sample data notice" });
      await markShown(container);

      // On a phone the mark takes the subtitle's place (it hides there); from the md breakpoint up it sits at the right.
      const phone = marks(container).find((mark) => mark.className.includes("md:hidden"));
      const wide = marks(container).find((mark) => mark.className.includes("md:inline-flex"));
      expect(phone).toBeDefined();
      expect(wide).toBeDefined();
      expect(wide?.className).toContain("hidden");
      expect(within(header(container)).getByText(en.app.subtitle).className).toContain("max-md:hidden");
    });
  });

  it("remounts the page after sample data is loaded from it", async () => {
    server.active = false;
    render(shell());
    await waitFor(() => expect(askedAboutSample()).toBe(1));
    expect(mounts.count).toBe(1);

    server.active = true;
    let handled = false;
    await act(async () => {
      handled = announceSampleChange();
    });

    expect(handled).toBe(true);
    await waitFor(() => expect(mounts.count).toBe(2));
    expect(await screen.findByRole("button", { name: "Remove sample data" })).toBeInTheDocument();
  });
});
