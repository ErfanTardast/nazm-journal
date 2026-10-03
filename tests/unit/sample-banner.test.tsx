import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { productScopeForbiddenPatterns } from "@/lib/ai/guard";
import { englishLeaks } from "./support/english-leaks";

const nav = vi.hoisted(() => ({ path: "/en/journal" }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useRouter: () => router }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "@/lib/api/client";
import { SampleBanner } from "@/features/sample/sample-banner";
import { announceSampleChange, announceSampleRemoved } from "@/features/sample/sample-workspace-client";

const loaded = { active: true, loadedAt: "2026-10-02T09:30:00.000Z", canLoad: true };
const empty = { active: false, loadedAt: null, canLoad: true };
/** What the server says once the person has a trade of their own: sample data is gone and cannot be loaded again. */
const gaveWayToTrade = { active: false, loadedAt: null, canLoad: false };
const removed = { active: false, removed: { trades: 30, strategies: 2, plans: 2, reviews: 2 } };

/** What the server says to GET and DELETE; change `server.state` between calls. */
const server = { state: loaded as unknown, deleteResult: removed as unknown };

function serve() {
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    if (path !== "/api/sample-workspace") throw new Error(`Unexpected request ${path}`);
    if (init?.method === "DELETE") {
      if (server.deleteResult instanceof Error) throw server.deleteResult;
      server.state = empty;
      return server.deleteResult;
    }
    if (server.state instanceof Error) throw server.state;
    return server.state;
  });
}

const calls = (method: string) => (apiFetch as Mock).mock.calls.filter(([, init]) => (init?.method ?? "GET") === method).length;

beforeEach(() => {
  server.state = loaded;
  server.deleteResult = removed;
  nav.path = "/en/journal";
  serve();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  (apiFetch as Mock).mockReset();
  router.refresh.mockReset();
});

describe("while there is no sample data to label", () => {
  it("renders nothing when no sample data is loaded", async () => {
    server.state = empty;
    const { container } = render(<SampleBanner locale="en" />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/sample-workspace"));
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while it is still asking", () => {
    (apiFetch as Mock).mockImplementation(() => new Promise(() => {}));
    const { container } = render(<SampleBanner locale="en" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing, and does not throw, when the request fails", async () => {
    server.state = Object.assign(new Error("Unexpected server error"), { status: 500, code: "INTERNAL_SERVER_ERROR" });
    const { container } = render(<SampleBanner locale="en" />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an answer it does not understand", async () => {
    server.state = {};
    const { container } = render(<SampleBanner locale="en" />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the strip while sample data is loaded", () => {
  it("says it is sample data, not the person's trades, and that the first real trade removes it", async () => {
    render(<SampleBanner locale="en" />);
    const strip = await screen.findByRole("region", { name: "Sample data notice" });

    expect(within(strip).getByText("Sample data")).toBeInTheDocument();
    expect(strip.textContent).toContain("Sample data is loaded.");
    expect(strip.textContent).toContain("are samples, not your own");
    expect(strip.textContent).toContain("removed automatically");
    expect(strip.textContent).toContain("record or import your first real trade");
  });

  it("says nothing that is false on a page that shows no sample rows (Settings, the risk desk, Import)", async () => {
    render(<SampleBanner locale="en" />);
    const strip = await screen.findByRole("region", { name: "Sample data notice" });

    // It names what is sample (trades, strategies, plans and reviews), not "this page".
    expect(strip.textContent).not.toMatch(/this page|this is sample data/i);
    expect(strip.textContent).toContain("trades, strategies, plans and reviews");
  });

  it("has a Remove button at least 44px tall", async () => {
    render(<SampleBanner locale="en" />);
    const button = await screen.findByRole("button", { name: "Remove sample data" });
    expect(button.className).toContain("min-h-11");
  });

  it("is in Persian on a Persian page, with no English left", async () => {
    const { container } = render(<SampleBanner locale="fa" />);
    await screen.findByRole("button", { name: "حذف داده نمونه" });

    expect(container.textContent).toContain("داده نمونه");
    expect(container.textContent).toContain("نمونه‌اند، نه مال شما");
    expect(container.textContent).toContain("ورود معاملات از فایل");
    expect(englishLeaks(container)).toEqual([]);
  });

  it("stays through a navigation and asks again for the new page", async () => {
    const { rerender } = render(<SampleBanner locale="en" />);
    await screen.findByRole("button", { name: "Remove sample data" });
    expect(calls("GET")).toBe(1);

    nav.path = "/en/performance";
    rerender(<SampleBanner locale="en" />);

    // The strip does not blink away while the second answer is on its way.
    expect(screen.getByRole("button", { name: "Remove sample data" })).toBeInTheDocument();
    await waitFor(() => expect(calls("GET")).toBe(2));
  });

  it("goes when the next answer says the sample data is gone (the first real trade removed it), and says so", async () => {
    const { container, rerender } = render(<SampleBanner locale="en" />);
    await screen.findByRole("button", { name: "Remove sample data" });

    server.state = gaveWayToTrade;
    nav.path = "/en/dashboard";
    rerender(<SampleBanner locale="en" />);

    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove sample data" })).toBeNull());
    expect(container.querySelector("[data-sample-mark]")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("first real trade");
  });

  it("keeps showing what it knew when a later check fails", async () => {
    const { rerender } = render(<SampleBanner locale="en" />);
    await screen.findByRole("button", { name: "Remove sample data" });

    server.state = Object.assign(new Error("down"), { status: 503, code: "DOWN" });
    nav.path = "/en/plans";
    rerender(<SampleBanner locale="en" />);
    await waitFor(() => expect(calls("GET")).toBe(2));
    await act(async () => {});

    expect(screen.getByRole("button", { name: "Remove sample data" })).toBeInTheDocument();
  });

  it("checks again now and then, and when the tab is back in front, so a trade added meanwhile clears it", async () => {
    vi.useFakeTimers();
    const { container } = render(<SampleBanner locale="en" />);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Remove sample data" })).toBeInTheDocument();

    server.state = gaveWayToTrade;
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.queryByRole("button", { name: "Remove sample data" })).toBeNull();
    expect(container.querySelector("section")).not.toBeNull();
    const askedWhileLoaded = calls("GET");

    // Nothing is asked once there is nothing to label.
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    expect(calls("GET")).toBe(askedWhileLoaded);
  });

  it("asks again when the window gets focus back", async () => {
    render(<SampleBanner locale="en" />);
    await screen.findByRole("button", { name: "Remove sample data" });
    // The focus listener is added by an effect that runs after the strip appears; let it run before the event is sent.
    await act(async () => {});

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(calls("GET")).toBe(2));
  });
});

describe("removing the sample data", () => {
  it("asks once to confirm in the strip itself, never with the browser's confirm()", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SampleBanner locale="en" />);

    fireEvent.click(await screen.findByRole("button", { name: "Remove sample data" }));

    const strip = screen.getByRole("region", { name: "Sample data notice" });
    expect(strip.textContent).toContain("Only the sample rows are deleted");
    expect(strip.textContent).toContain("anything you added yourself stays");
    expect(screen.getByRole("button", { name: "Yes, remove" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Cancel" }).className).toContain("min-h-11");
    expect(calls("DELETE")).toBe(0);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("puts focus on the safe choice, and Cancel (or Escape) goes back with nothing deleted", async () => {
    render(<SampleBanner locale="en" />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove sample data" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Remove sample data" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Remove sample data" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), { key: "Escape" });
    expect(screen.getByRole("button", { name: "Remove sample data" })).toBeInTheDocument();
    expect(calls("DELETE")).toBe(0);
  });

  it("deletes, refreshes the page, tells the page to fetch its data again, and says it is done", async () => {
    const onChanged = vi.fn();
    render(<SampleBanner locale="en" onChanged={onChanged} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove sample data" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));

    const status = await screen.findByRole("status");
    await waitFor(() => expect(status).toHaveTextContent("Sample data removed."));
    expect(apiFetch).toHaveBeenCalledWith("/api/sample-workspace", { method: "DELETE" });
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
    // The label itself is gone; only the result is left.
    expect(screen.queryByRole("button", { name: "Remove sample data" })).toBeNull();
    expect(screen.queryByText("Sample data", { selector: "span" })).toBeNull();
    // The buttons that held focus are gone, so focus goes to the result instead of falling to the page.
    expect(status).toHaveFocus();
  });

  it("announces the result in a status region that was already there, since one inserted with its text is not reliably read out", async () => {
    render(<SampleBanner locale="en" />);
    const before = await screen.findByRole("status");
    expect(before).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: "Remove sample data" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));

    await waitFor(() => expect(before).toHaveTextContent("Sample data removed."));
    expect(screen.getByRole("status")).toBe(before);
  });

  it("the result goes away with the next page", async () => {
    const { container, rerender } = render(<SampleBanner locale="en" />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove sample data" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    await screen.findByRole("status");

    nav.path = "/en/dashboard";
    rerender(<SampleBanner locale="en" />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("says so in Persian too", async () => {
    const { container } = render(<SampleBanner locale="fa" />);
    fireEvent.click(await screen.findByRole("button", { name: "حذف داده نمونه" }));
    expect(container.textContent).toContain("فقط ردیف‌های نمونه پاک می‌شوند");
    fireEvent.click(screen.getByRole("button", { name: "بله، حذف شود" }));

    expect(await screen.findByRole("status")).toHaveTextContent("داده نمونه حذف شد.");
    expect(englishLeaks(container)).toEqual([]);
  });

  it("a failed delete keeps the strip, says so in the page's language, and can be tried again", async () => {
    server.deleteResult = Object.assign(new Error("Unexpected server error"), { status: 500, code: "INTERNAL_SERVER_ERROR" });
    const onChanged = vi.fn();
    const { container } = render(<SampleBanner locale="fa" onChanged={onChanged} />);
    fireEvent.click(await screen.findByRole("button", { name: "حذف داده نمونه" }));
    fireEvent.click(screen.getByRole("button", { name: "بله، حذف شود" }));

    expect(await screen.findByRole("status")).toHaveTextContent("حذف داده نمونه انجام نشد. دوباره تلاش کنید.");
    expect(screen.getByRole("button", { name: "حذف داده نمونه" })).toBeInTheDocument();
    expect(container.textContent).not.toContain("Unexpected server error");
    expect(router.refresh).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();

    server.deleteResult = removed;
    fireEvent.click(screen.getByRole("button", { name: "حذف داده نمونه" }));
    fireEvent.click(screen.getByRole("button", { name: "بله، حذف شود" }));
    expect(await screen.findByRole("status")).toHaveTextContent("داده نمونه حذف شد.");
  });

  it("does not send a second delete while the first is on its way", async () => {
    let finish: (value: unknown) => void = () => {};
    (apiFetch as Mock).mockImplementation((path: string, init?: RequestInit) =>
      init?.method === "DELETE" ? new Promise((resolve) => (finish = resolve)) : Promise.resolve(loaded)
    );
    render(<SampleBanner locale="en" />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove sample data" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));

    const busy = await screen.findByRole("button", { name: "Removing…" });
    expect(busy).toBeDisabled();
    expect(calls("DELETE")).toBe(1);
    finish(removed);
    await screen.findByRole("status");
  });
});

describe("when the sample data is loaded from a page", () => {
  it("shows the strip, takes the change on, and tells the page to fetch its data again", async () => {
    server.state = empty;
    const onChanged = vi.fn();
    render(<SampleBanner locale="en" onChanged={onChanged} />);
    await act(async () => {});
    expect(screen.queryByRole("region")).toBeNull();

    server.state = loaded;
    let handled = false;
    await act(async () => {
      handled = announceSampleChange();
    });

    expect(handled).toBe(true);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Remove sample data" })).toBeInTheDocument();
  });

  it("nobody takes the change on when no strip is mounted, so the caller can reload", () => {
    expect(announceSampleChange()).toBe(false);
  });
});

describe("when the first real trade removes the sample data", () => {
  it("a page that saved the trade tells the strip: the label goes at once, with no new question to the server, and the removal is said", async () => {
    const { container } = render(<SampleBanner locale="en" />);
    await screen.findByRole("button", { name: "Remove sample data" });
    const asked = calls("GET");
    const status = screen.getByRole("status");

    await act(async () => {
      announceSampleRemoved();
    });

    expect(screen.queryByRole("button", { name: "Remove sample data" })).toBeNull();
    expect(screen.queryByText("Sample data", { selector: "span" })).toBeNull();
    expect(status).toHaveTextContent("Sample data was removed because you saved your first real trade.");
    expect(screen.getByRole("status")).toBe(status);
    expect(calls("GET")).toBe(asked);
    expect(calls("DELETE")).toBe(0);
    expect(container.textContent).not.toContain("not your own");
  });

  it("does not remount the page or refresh it: the page that saved the trade has already loaded its own list", async () => {
    const onChanged = vi.fn();
    render(<SampleBanner locale="en" onChanged={onChanged} />);
    await screen.findByRole("button", { name: "Remove sample data" });

    await act(async () => {
      announceSampleRemoved();
    });

    expect(onChanged).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("does not take focus away from the page the person is typing in", async () => {
    render(
      <>
        <input aria-label="symbol" />
        <SampleBanner locale="en" />
      </>
    );
    await screen.findByRole("button", { name: "Remove sample data" });
    screen.getByLabelText("symbol").focus();

    await act(async () => {
      announceSampleRemoved();
    });

    expect(screen.getByLabelText("symbol")).toHaveFocus();
  });

  it("an answer that was on its way when the trade was saved cannot bring the label back", async () => {
    const { rerender } = render(<SampleBanner locale="en" />);
    await screen.findByRole("button", { name: "Remove sample data" });

    // A page change asks again, and the answer is held back.
    let answer: (value: unknown) => void = () => {};
    (apiFetch as Mock).mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    nav.path = "/en/performance";
    rerender(<SampleBanner locale="en" />);
    await act(async () => {});

    await act(async () => {
      announceSampleRemoved();
    });
    await act(async () => {
      answer(loaded);
    });

    expect(screen.queryByRole("button", { name: "Remove sample data" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("first real trade");
  });

  it("says it in Persian on a Persian page", async () => {
    const { container } = render(<SampleBanner locale="fa" />);
    await screen.findByRole("button", { name: "حذف داده نمونه" });

    await act(async () => {
      announceSampleRemoved();
    });

    expect(screen.getByRole("status")).toHaveTextContent("با ثبت اولین معامله‌ی واقعی‌تان، داده نمونه حذف شد.");
    expect(englishLeaks(container)).toEqual([]);
  });

  it("a later answer that says it is gone, when the strip did not remove it, says why: the person's first trade", async () => {
    const { rerender } = render(<SampleBanner locale="en" />);
    await screen.findByRole("button", { name: "Remove sample data" });

    // The first trade came in through an import, or in another tab: the server now says gone, and not loadable.
    server.state = gaveWayToTrade;
    nav.path = "/en/dashboard";
    rerender(<SampleBanner locale="en" />);

    expect(await screen.findByRole("status")).toHaveTextContent("Sample data was removed because you saved your first real trade.");
    expect(screen.queryByRole("button", { name: "Remove sample data" })).toBeNull();
  });

  it("a later answer that says it is gone, but the account has no trade of its own, only says it was removed", async () => {
    const { rerender } = render(<SampleBanner locale="en" />);
    await screen.findByRole("button", { name: "Remove sample data" });

    // Removed with the button in another tab: no trade was saved, so the line must not say one was.
    server.state = empty;
    nav.path = "/en/dashboard";
    rerender(<SampleBanner locale="en" />);

    expect(await screen.findByRole("status")).toHaveTextContent("Sample data removed.");
    expect(screen.getByRole("status")).not.toHaveTextContent("first real trade");
  });

  it("a check on a timer that finds it gone says why as well", async () => {
    vi.useFakeTimers();
    render(<SampleBanner locale="en" />);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Remove sample data" })).toBeInTheDocument();

    server.state = gaveWayToTrade;
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });

    expect(screen.getByRole("status")).toHaveTextContent("because you saved your first real trade");
  });

  it("says nothing about a removal when there never was sample data", async () => {
    server.state = gaveWayToTrade;
    const { container, rerender } = render(<SampleBanner locale="en" />);
    await act(async () => {});
    nav.path = "/en/plans";
    rerender(<SampleBanner locale="en" />);
    await waitFor(() => expect(calls("GET")).toBe(2));
    await act(async () => {});

    expect(container).toBeEmptyDOMElement();
  });
});

describe("telling the shell whether the strip is showing", () => {
  it("reports active while sample data is loaded and inactive once it is gone", async () => {
    const onActiveChange = vi.fn();
    render(<SampleBanner locale="en" onActiveChange={onActiveChange} />);
    await screen.findByRole("button", { name: "Remove sample data" });
    expect(onActiveChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Remove sample data" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));

    await waitFor(() => expect(onActiveChange).toHaveBeenLastCalledWith(false));
  });

  it("reports inactive when the first trade removes it", async () => {
    const onActiveChange = vi.fn();
    render(<SampleBanner locale="en" onActiveChange={onActiveChange} />);
    await screen.findByRole("button", { name: "Remove sample data" });

    await act(async () => {
      announceSampleRemoved();
    });

    expect(onActiveChange).toHaveBeenLastCalledWith(false);
  });
});

describe("the words", () => {
  it("stay inside the product's scope in both languages", async () => {
    for (const locale of ["en", "fa"] as const) {
      const { container, unmount } = render(<SampleBanner locale={locale} />);
      await screen.findByRole("region");
      fireEvent.click(container.querySelector("button") as HTMLElement);
      for (const pattern of productScopeForbiddenPatterns) expect(pattern.test(container.textContent ?? ""), `${locale}: ${pattern.source}`).toBe(false);
      unmount();
    }
  });
});
