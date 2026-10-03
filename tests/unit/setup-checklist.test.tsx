import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyFirstRunState, type FirstRunState } from "@/lib/onboarding/first-run";
import { englishLeaks } from "./support/english-leaks";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { SetupChecklist } from "@/features/onboarding/setup-checklist";

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

type Options = { save?: "ok" | "fail" };

/** The state endpoint with the saved state it keeps between requests. */
function backend(initial: Partial<FirstRunState> = {}, options: Options = {}) {
  const state: FirstRunState = { ...emptyFirstRunState, ...initial };
  const calls: { method: string; path: string; body: unknown }[] = [];
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, path, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    if (path !== "/api/onboarding/state") throw new Error(`unexpected request ${method} ${path}`);
    if (method === "POST") {
      if (options.save === "fail") throw new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
      state.onboardedAt ??= "2026-10-02T09:00:00.000Z";
    }
    return { state: { ...state } };
  });
  return { state, calls };
}

const ROW_TEXT = {
  en: { trade: "Import or add your first trade", strategy: "Create your first strategy", plan: "Write your first plan" },
  fa: { trade: "ورود یا ثبت اولین معامله", strategy: "ساخت اولین استراتژی", plan: "نوشتن اولین پلن" }
} as const;

const rowOf = (text: string) => screen.getByText(text).closest("li") as HTMLElement;

describe("SetupChecklist shows nothing when it has nothing to say", () => {
  it("renders nothing while the state is loading", () => {
    (apiFetch as Mock).mockImplementation(() => new Promise(() => undefined));
    const { container } = render(<SetupChecklist locale="en" />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["the network fails", () => new TypeError("Failed to fetch")],
    ["the session has expired", () => new ApiClientError("Authentication is required", 401, "UNAUTHORIZED")],
    ["the server errs", () => new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR")]
  ])("renders nothing, and does not throw, when %s", async (_name, error) => {
    (apiFetch as Mock).mockRejectedValue(error());
    const { container } = render(<SetupChecklist locale="en" />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the answer is not a first-run state", async () => {
    (apiFetch as Mock).mockResolvedValue({ segment: "beginner-crypto-no_plan" });
    const { container } = render(<SetupChecklist locale="en" />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing once the trade, the strategy and the plan are all done", async () => {
    backend({ hasTrades: true, hasStrategy: true, hasPlan: true });
    const { container } = render(<SetupChecklist locale="en" />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("reads the state once, from the first-run state endpoint", async () => {
    const server = backend();
    render(<SetupChecklist locale="en" />);
    await screen.findByRole("heading", { level: 2 });
    expect(server.calls).toEqual([{ method: "GET", path: "/api/onboarding/state", body: undefined }]);
  });
});

describe("SetupChecklist for someone who has not finished the first run", () => {
  it("lists the three steps, each with a link, and a way back into the guided setup", async () => {
    backend({ tradingPlatform: "manual" });
    render(<SetupChecklist locale="en" />);

    expect(await screen.findByRole("heading", { level: 2, name: "Getting started" })).toBeInTheDocument();
    expect(within(rowOf(ROW_TEXT.en.trade)).getByRole("link", { name: "Open the journal" })).toHaveAttribute("href", "/en/journal");
    expect(within(rowOf(ROW_TEXT.en.strategy)).getByRole("link", { name: "Create a strategy" })).toHaveAttribute("href", "/en/strategies");
    expect(within(rowOf(ROW_TEXT.en.plan)).getByRole("link", { name: "Write a plan" })).toHaveAttribute("href", "/en/plans");
    expect(screen.getByRole("link", { name: "Continue setup" })).toHaveAttribute("href", "/en/onboarding");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it.each([["mt5"], ["other"]])("sends an %s trader to the import page for the first trade", async (tradingPlatform) => {
    backend({ tradingPlatform: tradingPlatform as FirstRunState["tradingPlatform"] });
    render(<SetupChecklist locale="en" />);
    await screen.findByRole("heading", { level: 2 });
    expect(within(rowOf(ROW_TEXT.en.trade)).getByRole("link", { name: "Import trades" })).toHaveAttribute("href", "/en/import");
  });

  it("offers both ways to a first trade when the platform is not known", async () => {
    backend();
    render(<SetupChecklist locale="en" />);
    await screen.findByRole("heading", { level: 2 });
    const links = within(rowOf(ROW_TEXT.en.trade)).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Import trades", "/en/import"],
      ["Open the journal", "/en/journal"]
    ]);
  });

  it("marks what is done and what is not", async () => {
    backend({ hasTrades: true });
    render(<SetupChecklist locale="en" />);
    await screen.findByRole("heading", { level: 2 });
    expect(within(rowOf(ROW_TEXT.en.trade)).getByText("Done")).toBeInTheDocument();
    expect(within(rowOf(ROW_TEXT.en.strategy)).getByText("To do")).toBeInTheDocument();
    expect(within(rowOf(ROW_TEXT.en.plan)).getByText("To do")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 done")).toBeInTheDocument();
  });

  it("keeps a done step's link, so the page can still be opened", async () => {
    backend({ hasStrategy: true });
    render(<SetupChecklist locale="en" />);
    await screen.findByRole("heading", { level: 2 });
    expect(within(rowOf(ROW_TEXT.en.strategy)).getByRole("link", { name: "Create a strategy" })).toHaveAttribute("href", "/en/strategies");
  });

  it("turns the card into the steps that are left, without the setup line, when it is dismissed", async () => {
    const server = backend({ hasTrades: true, tradingPlatform: "mt5" });
    render(<SetupChecklist locale="en" />);
    await screen.findByRole("heading", { level: 2 });

    await userEvent.click(screen.getByRole("button", { name: "Skip guided setup" }));

    await waitFor(() => expect(screen.queryByRole("link", { name: "Continue setup" })).not.toBeInTheDocument());
    expect(server.calls.filter((call) => call.method === "POST")).toEqual([{ method: "POST", path: "/api/onboarding/state", body: { done: true } }]);
    expect(screen.queryByText(ROW_TEXT.en.trade)).not.toBeInTheDocument();
    expect(screen.getByText(ROW_TEXT.en.strategy)).toBeInTheDocument();
    expect(screen.getByText(ROW_TEXT.en.plan)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip guided setup" })).not.toBeInTheDocument();
  });

  it("says so, and stays as it was, when the dismissal cannot be saved", async () => {
    backend({}, { save: "fail" });
    render(<SetupChecklist locale="en" />);
    await screen.findByRole("heading", { level: 2 });

    await userEvent.click(screen.getByRole("button", { name: "Skip guided setup" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That could not be saved. Try again.");
    expect(screen.queryByText(/Unexpected server error/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue setup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip guided setup" })).toBeEnabled();
  });
});

describe("SetupChecklist for someone who already finished or skipped the first run", () => {
  it("shows only the steps that are still open, with no setup line and no dismiss button", async () => {
    backend({ onboardedAt: "2026-10-01T10:00:00.000Z", hasTrades: true, hasPlan: true });
    render(<SetupChecklist locale="en" />);

    await screen.findByRole("heading", { level: 2, name: "Getting started" });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText(ROW_TEXT.en.strategy)).toBeInTheDocument();
    expect(screen.queryByText(ROW_TEXT.en.trade)).not.toBeInTheDocument();
    expect(screen.queryByText(ROW_TEXT.en.plan)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Continue setup" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip guided setup" })).not.toBeInTheDocument();
  });

  it("does not count sample data: a person with only sample rows still has every step open", async () => {
    // The state endpoint counts only the person's own rows, so a sample-only account arrives with all three flags false.
    backend({ onboardedAt: "2026-10-01T10:00:00.000Z" });
    render(<SetupChecklist locale="en" />);
    await screen.findByRole("heading", { level: 2 });
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("SetupChecklist on the Persian page", () => {
  it("is Persian throughout, with Persian digits and Persian links", async () => {
    backend({ hasTrades: true, tradingPlatform: "mt5" });
    const { container } = render(<SetupChecklist locale="fa" />);

    expect(await screen.findByRole("heading", { level: 2, name: "شروع کار" })).toBeInTheDocument();
    expect(screen.getByText("۱ از ۳ انجام شد")).toBeInTheDocument();
    expect(within(rowOf(ROW_TEXT.fa.trade)).getByRole("link", { name: "ورود معاملات" })).toHaveAttribute("href", "/fa/import");
    expect(within(rowOf(ROW_TEXT.fa.strategy)).getByRole("link", { name: "ساخت استراتژی" })).toHaveAttribute("href", "/fa/strategies");
    expect(within(rowOf(ROW_TEXT.fa.plan)).getByRole("link", { name: "نوشتن پلن" })).toHaveAttribute("href", "/fa/plans");
    expect(screen.getByRole("link", { name: "ادامه راه‌اندازی" })).toHaveAttribute("href", "/fa/onboarding");
    expect(within(rowOf(ROW_TEXT.fa.trade)).getByText("انجام شد")).toBeInTheDocument();
    expect(within(rowOf(ROW_TEXT.fa.plan)).getByText("انجام نشده")).toBeInTheDocument();
    expect(englishLeaks(container)).toEqual([]);
    expect(container.textContent).not.toMatch(/برنامه/);
  });

  it("says a failed dismissal in Persian", async () => {
    backend({}, { save: "fail" });
    const { container } = render(<SetupChecklist locale="fa" />);
    await screen.findByRole("heading", { level: 2 });
    // «رد کردن» reads as "reject": the card says "forgo", like the flow's own skip wording.
    fireEvent.click(screen.getByRole("button", { name: "صرف‌نظر از راه‌اندازی گام‌به‌گام" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ذخیره نشد. دوباره تلاش کنید.");
    expect(englishLeaks(container)).toEqual([]);
  });
});
