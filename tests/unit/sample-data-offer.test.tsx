import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { productScopeForbiddenPatterns } from "@/lib/ai/guard";
import { englishLeaks } from "./support/english-leaks";

const nav = vi.hoisted(() => ({ path: "/en/performance" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/features/sample/sample-workspace-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/sample/sample-workspace-client")>()),
  reloadPage: vi.fn()
}));
import { apiFetch } from "@/lib/api/client";
import { SampleBanner } from "@/features/sample/sample-banner";
import { SampleDataOffer } from "@/features/sample/sample-data-offer";
import { reloadPage } from "@/features/sample/sample-workspace-client";

const canLoad = { active: false, loadedAt: null, canLoad: true };
const created = { active: true, loadedAt: "2026-10-02T09:30:00.000Z", counts: { trades: 30, strategies: 2, plans: 2, reviews: 2 } };

const server = { state: canLoad as unknown, post: created as unknown };

function serve() {
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    if (path !== "/api/sample-workspace") throw new Error(`Unexpected request ${path}`);
    if (init?.method === "POST") {
      if (server.post instanceof Error) throw server.post;
      server.state = { active: true, loadedAt: created.loadedAt, canLoad: true };
      return server.post;
    }
    if (server.state instanceof Error) throw server.state;
    return server.state;
  });
}

const posts = () => (apiFetch as Mock).mock.calls.filter(([, init]) => init?.method === "POST");

beforeEach(() => {
  server.state = canLoad;
  server.post = created;
  serve();
});

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
  (reloadPage as Mock).mockReset();
});

describe("when there is nothing to offer", () => {
  it.each([
    ["sample data is already loaded", { active: true, loadedAt: "2026-10-02T09:30:00.000Z", canLoad: true }],
    ["the account has trades of its own", { active: false, loadedAt: null, canLoad: false }],
    ["the answer is not understood", {}]
  ])("renders nothing when %s", async (_name, state) => {
    server.state = state;
    const { container } = render(<SampleDataOffer locale="en" />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/sample-workspace"));
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while it is still asking", () => {
    (apiFetch as Mock).mockImplementation(() => new Promise(() => {}));
    const { container } = render(<SampleDataOffer locale="en" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing, and does not throw, when the request fails", async () => {
    server.state = new Error("Unexpected request");
    const { container } = render(<SampleDataOffer locale="en" />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the offer", () => {
  it("says what it loads and that it can be removed, with a button at least 44px tall", async () => {
    const { container } = render(<SampleDataOffer locale="en" />);
    const button = await screen.findByRole("button", { name: "Load sample data" });

    expect(button.className).toContain("min-h-11");
    expect(screen.getByText("See this page with sample data")).toBeInTheDocument();
    expect(container.textContent).toContain("a month of sample forex and gold trades");
    expect(container.textContent).toContain("two strategies, two plans and two reviews");
    // Removal takes two clicks (the button, then the confirmation), so the offer does not promise one.
    expect(container.textContent).not.toContain("one click");
    expect(container.textContent).toContain("remove it at any time from the strip at the top of the page");
    expect(container.textContent).toContain("your first real trade removes it too");
  });

  it("is in Persian on a Persian page, with no English left, and calls a plan a پلن", async () => {
    const { container } = render(<SampleDataOffer locale="fa" />);
    await screen.findByRole("button", { name: "بارگذاری داده نمونه" });

    expect(screen.getByText("این صفحه را با داده نمونه ببینید")).toBeInTheDocument();
    expect(container.textContent).toContain("دو پلن");
    expect(container.textContent).not.toContain("برنامه");
    // Not "everything is labelled" (a single trade carries no label) and not "one click" (removal asks to confirm).
    expect(container.textContent).not.toContain("همه‌چیز");
    expect(container.textContent).not.toContain("یک کلیک");
    expect(container.textContent).toContain("بالای هر صفحه با برچسب «داده نمونه» مشخص می‌شود");
    expect(englishLeaks(container)).toEqual([]);
  });

  it("stays inside the product's scope in both languages", async () => {
    for (const locale of ["en", "fa"] as const) {
      const { container, unmount } = render(<SampleDataOffer locale={locale} />);
      await waitFor(() => expect(container.querySelector("button")).not.toBeNull());
      for (const pattern of productScopeForbiddenPatterns) expect(pattern.test(container.textContent ?? ""), `${locale}: ${pattern.source}`).toBe(false);
      unmount();
    }
  });
});

describe("loading the sample data", () => {
  it("sends the page's language, and reloads the page when no strip is there to take the change on", async () => {
    render(<SampleDataOffer locale="fa" />);
    fireEvent.click(await screen.findByRole("button", { name: "بارگذاری داده نمونه" }));

    await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
    expect(posts()).toHaveLength(1);
    expect(apiFetch).toHaveBeenCalledWith("/api/sample-workspace", { method: "POST", body: JSON.stringify({ locale: "fa" }) });
  });

  it("with the workspace strip mounted, the strip takes the change on and the page is not reloaded", async () => {
    const onChanged = vi.fn();
    render(
      <>
        <SampleBanner locale="en" onChanged={onChanged} />
        <SampleDataOffer locale="en" />
      </>
    );
    fireEvent.click(await screen.findByRole("button", { name: "Load sample data" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(reloadPage).not.toHaveBeenCalled();
    // The strip now labels the data, and the offer has stepped aside.
    expect(await screen.findByRole("button", { name: "Remove sample data" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load sample data" })).toBeNull();
  });

  it("is sent once, however often the button is pressed", async () => {
    let finish: (value: unknown) => void = () => {};
    (apiFetch as Mock).mockImplementation((path: string, init?: RequestInit) =>
      init?.method === "POST" ? new Promise((resolve) => (finish = resolve)) : Promise.resolve(canLoad)
    );
    render(<SampleDataOffer locale="en" />);
    const button = await screen.findByRole("button", { name: "Load sample data" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(await screen.findByRole("button", { name: "Loading…" })).toBeDisabled();
    expect(posts()).toHaveLength(1);
    finish(created);
    await waitFor(() => expect(reloadPage).toHaveBeenCalled());
  });

  it("a failed load says so in the page's language and can be tried again", async () => {
    server.post = Object.assign(new Error("Unexpected server error"), { status: 500, code: "INTERNAL_SERVER_ERROR" });
    const { container } = render(<SampleDataOffer locale="fa" />);
    fireEvent.click(await screen.findByRole("button", { name: "بارگذاری داده نمونه" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("بارگذاری داده نمونه انجام نشد. دوباره تلاش کنید.");
    expect(container.textContent).not.toContain("Unexpected server error");
    expect(reloadPage).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "بارگذاری داده نمونه" })).not.toBeDisabled();
    expect(englishLeaks(container)).toEqual([]);
  });

  it("an account that got a trade of its own meanwhile is told so, with the screen's own words", async () => {
    server.post = Object.assign(new Error("Sample data can only be loaded into a journal with no trades of its own"), { status: 409, code: "SAMPLE_NOT_EMPTY" });
    render(<SampleDataOffer locale="fa" />);
    fireEvent.click(await screen.findByRole("button", { name: "بارگذاری داده نمونه" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("داده نمونه فقط وقتی بارگذاری می‌شود که هیچ معامله‌ای از خودتان در ژورنال نباشد.");
  });

  it("English: the same account is told in English", async () => {
    server.post = Object.assign(new Error("Sample data can only be loaded into a journal with no trades of its own"), { status: 409, code: "SAMPLE_NOT_EMPTY" });
    render(<SampleDataOffer locale="en" />);
    fireEvent.click(await screen.findByRole("button", { name: "Load sample data" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sample data can only be loaded into a journal with no trades of its own.");
  });
});
