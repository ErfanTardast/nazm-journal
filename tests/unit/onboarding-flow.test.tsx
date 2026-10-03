import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getMessages } from "@/lib/i18n/messages";
import { emptyFirstRunState, type FirstRunState } from "@/lib/onboarding/first-run";
import { englishLeaks } from "./support/english-leaks";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";

const en = getMessages("en");
const fa = getMessages("fa");
const flow = en.onboarding.flow;
const faFlow = fa.onboarding.flow;

type Call = { path: string; method: string; body: Record<string, unknown> | undefined };
type Options = {
  /** What the saved-state request answers with; "fail" is a network error, "auth" a 401. */
  load?: "ok" | "fail" | "auth";
  /** Answers to saving an answer or marking done. */
  save?: "ok" | "fail" | "hang";
  sample?: "ok" | "fail" | "notEmpty" | "hang";
};

/** A small stand-in for the three endpoints the flow talks to, with the saved state it keeps between requests. */
function backend(initial: Partial<FirstRunState> = {}, options: Options = {}) {
  const state: FirstRunState = { ...emptyFirstRunState, ...initial };
  const calls: Call[] = [];
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    calls.push({ path, method, body });

    if (path === "/api/onboarding/state" && method === "GET") {
      if (options.load === "fail") throw new TypeError("Failed to fetch");
      if (options.load === "auth") throw new ApiClientError("Authentication is required", 401, "UNAUTHORIZED");
      return { state: { ...state } };
    }
    if (path === "/api/onboarding/state" && method === "POST") {
      if (options.save === "hang") return new Promise(() => undefined);
      if (options.save === "fail") throw new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
      if (body?.tradingPlatform) state.tradingPlatform = body.tradingPlatform as FirstRunState["tradingPlatform"];
      if (body?.primaryGoal) state.primaryGoal = body.primaryGoal as FirstRunState["primaryGoal"];
      if (body?.done && !state.onboardedAt) state.onboardedAt = "2026-10-02T09:00:00.000Z";
      return { state: { ...state } };
    }
    if (path === "/api/sample-workspace" && method === "POST") {
      if (options.sample === "hang") return new Promise(() => undefined);
      if (options.sample === "fail") throw new ApiClientError("Unexpected server error: relation does not exist", 500, "INTERNAL_SERVER_ERROR");
      if (options.sample === "notEmpty") throw new ApiClientError("Sample data needs an empty journal", 409, "SAMPLE_NOT_EMPTY");
      return { active: true, loadedAt: "2026-10-02T09:00:00.000Z", counts: { trades: 24, strategies: 2, plans: 2, reviews: 3 } };
    }
    if (path === "/api/onboarding/sprint") return { profile: null };
    throw new Error(`unexpected request ${method} ${path}`);
  });
  return { state, calls, posts: () => calls.filter((call) => call.method === "POST") };
}

type Locale = "en" | "fa";
function renderScreen(locale: Locale = "en") {
  return render(<OnboardingScreen messages={getMessages(locale)} locale={locale} />);
}

/** The heading text of a step named by a path into the flow messages; "finishOwn" is the last step for someone who has trades. */
function titleOf(text: typeof flow, key: string): string {
  if (key === "finishOwn") return text.finish.titleOwn;
  return (key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], text) as { title: string }).title;
}

const stepHeading = (name: string) => screen.findByRole("heading", { level: 2, name });
const MT5_DONE = { tradingPlatform: "mt5", primaryGoal: "risk" } as const;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
  vi.useRealTimers();
});

describe("the first step", () => {
  it("opens a new account at 'How do you trade?' with three choices and a progress bar", async () => {
    backend();
    renderScreen();
    expect(await stepHeading(flow.platform.title)).toBeInTheDocument();

    const group = screen.getByRole("radiogroup", { name: flow.platform.title });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(within(group).getByRole("radio", { name: flow.platform.mt5.title })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: flow.platform.other.title })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: flow.platform.manual.title })).toBeInTheDocument();

    const bar = screen.getByRole("progressbar", { name: flow.progressLabel });
    expect(bar).toHaveAttribute("aria-valuemin", "1");
    expect(bar).toHaveAttribute("aria-valuemax", "5");
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    expect(bar).toHaveAttribute("aria-valuetext", "Step 1 of 5");
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
  });

  it("says the step and the total in Persian digits", async () => {
    backend();
    renderScreen("fa");
    expect(await stepHeading(faFlow.platform.title)).toBeInTheDocument();
    expect(screen.getByText("گام ۱ از ۵")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: faFlow.progressLabel })).toHaveAttribute("aria-valuetext", "گام ۱ از ۵");
  });

  it("saves the choice when it is made and goes on to the goal", async () => {
    const server = backend();
    renderScreen();
    await stepHeading(flow.platform.title);
    await userEvent.click(screen.getByRole("radio", { name: flow.platform.mt5.title }));

    expect(await stepHeading(flow.goal.title)).toBeInTheDocument();
    expect(server.posts()).toEqual([{ path: "/api/onboarding/state", method: "POST", body: { tradingPlatform: "mt5" } }]);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    expect(screen.getByText("Step 2 of 5")).toBeInTheDocument();
  });

  it("does not finish the flow by answering", async () => {
    const server = backend();
    renderScreen();
    await stepHeading(flow.platform.title);
    await userEvent.click(screen.getByRole("radio", { name: flow.platform.manual.title }));
    await stepHeading(flow.goal.title);
    await userEvent.click(screen.getByRole("radio", { name: flow.goal.discipline.title }));
    await stepHeading(flow.history.manual.title);
    expect(server.posts().some((call) => call.body?.done)).toBe(false);
  });
});

describe("the second step", () => {
  it.each([
    ["discipline", flow.goal.discipline.title],
    ["risk", flow.goal.risk.title],
    ["performance", flow.goal.performance.title],
    ["strategy", flow.goal.strategy.title]
  ])("saves the goal %s and sends only that field", async (value, title) => {
    const server = backend({ tradingPlatform: "mt5" });
    renderScreen();
    await stepHeading(flow.goal.title);
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    await userEvent.click(screen.getByRole("radio", { name: title }));

    await stepHeading(flow.history.mt5.title);
    // A screen that loaded the platform earlier never sends it again, so it cannot overwrite a newer answer.
    expect(server.posts()).toEqual([{ path: "/api/onboarding/state", method: "POST", body: { primaryGoal: value } }]);
  });
});

describe("the history step", () => {
  it("sends an MT5 trader to the import page in three clicks: MT5, a goal, Import", async () => {
    backend();
    renderScreen();
    await stepHeading(flow.platform.title);

    await userEvent.click(screen.getByRole("radio", { name: flow.platform.mt5.title })); // click 1
    await stepHeading(flow.goal.title);
    await userEvent.click(screen.getByRole("radio", { name: flow.goal.discipline.title })); // click 2
    await stepHeading(flow.history.mt5.title);

    const importLink = screen.getByRole("link", { name: flow.history.mt5.action }); // click 3
    expect(importLink).toHaveAttribute("href", "/en/import");
  });

  it("sends the Persian page to the Persian import page", async () => {
    backend({ tradingPlatform: "mt5", primaryGoal: "risk" });
    renderScreen("fa");
    await stepHeading(faFlow.history.mt5.title);
    expect(screen.getByRole("link", { name: faFlow.history.mt5.action })).toHaveAttribute("href", "/fa/import");
  });

  it("words the step for a CSV file when the trader uses another platform", async () => {
    backend({ tradingPlatform: "other", primaryGoal: "risk" });
    renderScreen();
    await stepHeading(flow.history.other.title);
    expect(screen.getByText(flow.history.other.body)).toBeInTheDocument();
    expect(flow.history.other.body).toMatch(/CSV/);
    expect(screen.getByRole("link", { name: flow.history.other.action })).toHaveAttribute("href", "/en/import");
  });

  it("sends a manual journal to the journal", async () => {
    backend({ tradingPlatform: "manual", primaryGoal: "risk" });
    renderScreen();
    await stepHeading(flow.history.manual.title);
    expect(screen.getByRole("link", { name: flow.history.manual.action })).toHaveAttribute("href", "/en/journal");
  });

  it("moves on with 'Later'", async () => {
    backend({ ...MT5_DONE });
    renderScreen();
    await stepHeading(flow.history.mt5.title);
    await userEvent.click(screen.getByRole("button", { name: flow.later }));
    expect(await stepHeading(flow.strategy.title)).toBeInTheDocument();
  });

  it("shows the step as done when the person already has trades of their own", async () => {
    backend({ ...MT5_DONE, hasTrades: true });
    renderScreen();
    // They resume past it ...
    await stepHeading(flow.strategy.title);
    // ... and Back shows it as done, with a way on.
    await userEvent.click(screen.getByRole("button", { name: flow.back }));
    await stepHeading(flow.history.mt5.title);
    expect(screen.getByText(flow.history.done)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: flow.continue }));
    expect(await stepHeading(flow.strategy.title)).toBeInTheDocument();
  });
});

describe("the strategy step", () => {
  it("opens the strategies page, or moves on with 'Later'", async () => {
    backend({ ...MT5_DONE, hasTrades: true });
    renderScreen();
    await stepHeading(flow.strategy.title);
    expect(screen.getByRole("link", { name: flow.strategy.action })).toHaveAttribute("href", "/en/strategies");
    await userEvent.click(screen.getByRole("button", { name: flow.later }));
    expect(await stepHeading(flow.finish.titleOwn)).toBeInTheDocument();
  });

  it("shows the step as done when the person already has a strategy", async () => {
    backend({ ...MT5_DONE, hasTrades: true, hasStrategy: true });
    renderScreen();
    await stepHeading(flow.finish.titleOwn);
    await userEvent.click(screen.getByRole("button", { name: flow.back }));
    await stepHeading(flow.strategy.title);
    expect(screen.getByText(flow.strategy.done)).toBeInTheDocument();
  });
});

describe("the last step", () => {
  /** An empty journal reaches the last step by leaving the history and strategy steps with "Later". */
  async function openLastStep(locale: Locale = "en") {
    const text = locale === "en" ? flow : faFlow;
    await stepHeading(text.history.mt5.title);
    await userEvent.click(screen.getByRole("button", { name: text.later }));
    await stepHeading(text.strategy.title);
    await userEvent.click(screen.getByRole("button", { name: text.later }));
    await stepHeading(text.finish.title);
  }

  it("says plainly that sample data is not the person's own and how it goes away", async () => {
    backend({ ...MT5_DONE });
    renderScreen();
    await openLastStep();
    const note = screen.getByText(flow.finish.sampleNote);
    expect(note.textContent).toMatch(/not your own/);
    // The way out is the banner's own button; it asks once to confirm, so the note must not promise "one click".
    expect(note.textContent).toMatch(/Remove sample data/);
    expect(note.textContent).not.toMatch(/one click/i);
    expect(note.textContent).toMatch(/first real trade/);
  });

  it("offers the sample on the Persian page too, with the same promises and no English", async () => {
    backend({ ...MT5_DONE });
    const { container } = renderScreen("fa");
    await openLastStep("fa");
    expect(screen.getByText(faFlow.finish.body)).toBeInTheDocument();
    expect(screen.getByText(faFlow.finish.sampleNote)).toBeInTheDocument();
    expect(faFlow.finish.sampleNote).toMatch(/حذف داده نمونه/);
    expect(faFlow.finish.sampleNote).not.toMatch(/یک کلیک/);
    expect(screen.getByRole("button", { name: faFlow.finish.sample })).toBeInTheDocument();
    expect(englishLeaks(container)).toEqual([]);
  });

  it("loads the sample data, marks the flow done and opens the dashboard", async () => {
    const server = backend({ ...MT5_DONE });
    renderScreen();
    await openLastStep();
    await userEvent.click(screen.getByRole("button", { name: flow.finish.sample }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/en/dashboard"));
    const requests = server.calls.filter((call) => call.method === "POST").map((call) => `${call.path} ${JSON.stringify(call.body ?? null)}`);
    expect(requests).toEqual(["/api/sample-workspace null", '/api/onboarding/state {"done":true}']);
  });

  it("goes to the empty dashboard without loading anything", async () => {
    const server = backend({ ...MT5_DONE });
    renderScreen();
    await openLastStep();
    await userEvent.click(screen.getByRole("button", { name: flow.finish.empty }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/en/dashboard"));
    expect(server.posts()).toEqual([{ path: "/api/onboarding/state", method: "POST", body: { done: true } }]);
  });

  it("opens the Persian dashboard from the Persian page", async () => {
    backend({ ...MT5_DONE });
    renderScreen("fa");
    await openLastStep("fa");
    await userEvent.click(screen.getByRole("button", { name: faFlow.finish.empty }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/fa/dashboard"));
  });

  it("says so in the page language when the sample data could not be loaded, and still offers the dashboard", async () => {
    const server = backend({ ...MT5_DONE }, { sample: "fail" });
    renderScreen();
    await openLastStep();
    await userEvent.click(screen.getByRole("button", { name: flow.finish.sample }));

    expect(await screen.findByText(flow.finish.sampleFailed)).toBeInTheDocument();
    expect(screen.queryByText(/relation does not exist/)).not.toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(server.posts().some((call) => call.body?.done)).toBe(false);

    // Trying again is possible, and so is leaving.
    expect(screen.getByRole("button", { name: flow.finish.sample })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: flow.finish.empty }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/en/dashboard"));
  });

  it("says the Persian sentence, not the server's, on the Persian page", async () => {
    backend({ ...MT5_DONE }, { sample: "fail" });
    const { container } = renderScreen("fa");
    await openLastStep("fa");
    await userEvent.click(screen.getByRole("button", { name: faFlow.finish.sample }));
    expect(await screen.findByText(faFlow.finish.sampleFailed)).toBeInTheDocument();
    expect(englishLeaks(container)).toEqual([]);
  });

  it("explains a journal that is not empty (409 SAMPLE_NOT_EMPTY) and offers the dashboard", async () => {
    backend({ ...MT5_DONE }, { sample: "notEmpty" });
    renderScreen();
    await openLastStep();
    await userEvent.click(screen.getByRole("button", { name: flow.finish.sample }));

    expect(await screen.findByText(flow.finish.sampleNotEmpty)).toBeInTheDocument();
    expect(screen.queryByText(/needs an empty journal/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: flow.finish.sample })).not.toBeInTheDocument();
    // The screen now says what is true: the journal is not empty and no sample data is involved.
    expect(screen.getByRole("heading", { level: 2, name: flow.finish.titleOwn })).toBeInTheDocument();
    expectNoSampleTalk(flow);
    await userEvent.click(screen.getByRole("button", { name: flow.finish.dashboard }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/en/dashboard"));
  });

  it("says the same in Persian when the journal turns out not to be empty", async () => {
    backend({ ...MT5_DONE }, { sample: "notEmpty" });
    const { container } = renderScreen("fa");
    await openLastStep("fa");
    await userEvent.click(screen.getByRole("button", { name: faFlow.finish.sample }));

    expect(await screen.findByText(faFlow.finish.sampleNotEmpty)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: faFlow.finish.titleOwn })).toBeInTheDocument();
    expectNoSampleTalk(faFlow);
    expect(englishLeaks(container)).toEqual([]);
  });

  /** The last step must not talk about sample data, or an empty dashboard, to someone whose journal has trades. */
  function expectNoSampleTalk(text: typeof flow) {
    expect(screen.queryByText(text.finish.body)).not.toBeInTheDocument();
    expect(screen.queryByText(text.finish.sampleNote)).not.toBeInTheDocument();
    expect(screen.queryByText(text.finish.title)).not.toBeInTheDocument();
    expect(screen.queryByText(text.finish.empty)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: text.finish.sample })).not.toBeInTheDocument();
    expect(screen.getByText(text.finish.bodyOwn)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: text.finish.dashboard })).toBeInTheDocument();
    // Neither language promises an "empty dashboard" on this screen.
    expect(document.body.textContent).not.toMatch(text === flow ? /empty dashboard/i : /داشبورد خالی/);
  }

  it("does not offer sample data, or an empty dashboard, to someone who already has trades", async () => {
    backend({ ...MT5_DONE, hasTrades: true, hasStrategy: true });
    renderScreen();
    await stepHeading(flow.finish.titleOwn);
    expectNoSampleTalk(flow);
  });

  it("says the same in Persian to someone who already has trades", async () => {
    backend({ ...MT5_DONE, hasTrades: true, hasStrategy: true });
    const { container } = renderScreen("fa");
    await stepHeading(faFlow.finish.titleOwn);
    expectNoSampleTalk(faFlow);
    expect(englishLeaks(container)).toEqual([]);
  });

  // Sample data loaded from the dashboard, then "Continue setup": the last step must not call that dashboard empty.
  it("does not offer sample data again, or an empty dashboard, when sample data is already loaded", async () => {
    for (const locale of ["en", "fa"] as const) {
      const text = locale === "en" ? flow : faFlow;
      backend({ ...MT5_DONE, hasSample: true });
      const { container, unmount } = renderScreen(locale);
      await stepHeading(text.history.mt5.title);
      await userEvent.click(screen.getByRole("button", { name: text.later }));
      await stepHeading(text.strategy.title);
      await userEvent.click(screen.getByRole("button", { name: text.later }));
      await stepHeading(text.finish.titleOwn);
      expect(screen.getByText(text.finish.bodySample)).toBeInTheDocument();
      expect(screen.queryByText(text.finish.body)).not.toBeInTheDocument();
      expect(screen.queryByText(text.finish.bodyOwn)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: text.finish.sample })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: text.finish.dashboard })).toBeInTheDocument();
      expect(container.textContent).not.toMatch(locale === "en" ? /empty dashboard/i : /داشبورد خالی/);
      if (locale === "fa") expect(englishLeaks(container)).toEqual([]);
      unmount();
    }
  });

  // The server said the journal has trades of its own: going back and forward must not forget it.
  it("remembers a 409 SAMPLE_NOT_EMPTY after going back and forward", async () => {
    backend({ ...MT5_DONE }, { sample: "notEmpty" });
    renderScreen();
    await openLastStep();
    await userEvent.click(screen.getByRole("button", { name: flow.finish.sample }));
    await screen.findByText(flow.finish.sampleNotEmpty);

    await userEvent.click(screen.getByRole("button", { name: flow.back }));
    await stepHeading(flow.strategy.title);
    await userEvent.click(screen.getByRole("button", { name: flow.later }));
    await stepHeading(flow.finish.titleOwn);
    expectNoSampleTalk(flow);

    await userEvent.click(screen.getByRole("button", { name: flow.back }));
    await stepHeading(flow.strategy.title);
    await userEvent.click(screen.getByRole("button", { name: flow.back }));
    await stepHeading(flow.history.mt5.title);
    expect(screen.getByText(flow.history.done)).toBeInTheDocument();
  });

  it("reaches the same screen from the import: trades arrive, the person comes back and presses Later", async () => {
    backend({ ...MT5_DONE, hasTrades: true });
    renderScreen();
    await stepHeading(flow.strategy.title);
    await userEvent.click(screen.getByRole("button", { name: flow.later }));
    await stepHeading(flow.finish.titleOwn);
    expectNoSampleTalk(flow);
  });

  it("opens the dashboard from the last step even when marking the flow done fails", async () => {
    const server = backend({ ...MT5_DONE }, { save: "fail" });
    renderScreen();
    await openLastStep();
    await userEvent.click(screen.getByRole("button", { name: flow.finish.empty }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/en/dashboard"));
    expect(server.posts()).toEqual([{ path: "/api/onboarding/state", method: "POST", body: { done: true } }]);
  });

  it("opens the dashboard from the last step even when marking the flow done never answers", async () => {
    backend({ ...MT5_DONE }, { save: "hang" });
    renderScreen();
    await openLastStep();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: flow.finish.empty }));
    expect(router.push).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(router.push).toHaveBeenCalledWith("/en/dashboard");
  });

  describe("while the sample data is loading", () => {
    /** Holds back the answer of the sample request until the test releases it. */
    function holdSample() {
      const original = (apiFetch as Mock).getMockImplementation()!;
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
        if (path === "/api/sample-workspace" && init?.method === "POST") await held;
        return original(path, init);
      });
      return release;
    }
    const donePosts = (server: ReturnType<typeof backend>) => server.posts().filter((call) => call.body?.done);

    it("does not offer the empty dashboard, so it cannot be chosen against the request that is on its way", async () => {
      const server = backend({ ...MT5_DONE });
      renderScreen();
      await openLastStep();
      const release = holdSample();
      fireEvent.click(screen.getByRole("button", { name: flow.finish.sample }));

      expect(await screen.findByRole("button", { name: flow.finish.sampling })).toBeDisabled();
      expect(screen.getByRole("button", { name: flow.finish.empty })).toBeDisabled();
      // "Skip for now" stays as the way out.
      expect(screen.getByRole("button", { name: flow.skip })).toBeEnabled();
      expect(donePosts(server)).toEqual([]);

      await act(async () => release());
      await waitFor(() => expect(router.push).toHaveBeenCalledWith("/en/dashboard"));
      expect(router.push).toHaveBeenCalledTimes(1);
      expect(donePosts(server)).toHaveLength(1);
    });

    it("leaves once, not twice, when 'Skip for now' is chosen and the sample request answers afterwards", async () => {
      const server = backend({ ...MT5_DONE });
      renderScreen();
      await openLastStep();
      const release = holdSample();
      fireEvent.click(screen.getByRole("button", { name: flow.finish.sample }));
      await screen.findByRole("button", { name: flow.finish.sampling });

      await userEvent.click(screen.getByRole("button", { name: flow.skip }));
      await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));

      await act(async () => release());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(router.push).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledWith("/en/dashboard");
      expect(donePosts(server)).toEqual([{ path: "/api/onboarding/state", method: "POST", body: { done: true } }]);
    });

    it("does not go back while it loads, so the answer cannot move the person off the step they chose", async () => {
      backend({ ...MT5_DONE });
      renderScreen();
      await openLastStep();
      const release = holdSample();
      fireEvent.click(screen.getByRole("button", { name: flow.finish.sample }));
      await screen.findByRole("button", { name: flow.finish.sampling });
      expect(screen.getByRole("button", { name: flow.back })).toBeDisabled();
      await act(async () => release());
      await waitFor(() => expect(router.push).toHaveBeenCalledWith("/en/dashboard"));
    });
  });
});

describe("skipping and going back", () => {
  it("offers 'Skip for now' on every step, and skipping marks the flow done and opens the dashboard", async () => {
    for (const [initial, heading] of [
      [{}, flow.platform.title],
      [{ tradingPlatform: "mt5" }, flow.goal.title],
      [{ ...MT5_DONE }, flow.history.mt5.title],
      [{ ...MT5_DONE, hasTrades: true }, flow.strategy.title],
      [{ ...MT5_DONE, hasTrades: true, hasStrategy: true }, flow.finish.titleOwn]
    ] as [Partial<FirstRunState>, string][]) {
      router.push.mockClear();
      const server = backend(initial);
      const { unmount } = renderScreen();
      await stepHeading(heading);
      await userEvent.click(screen.getByRole("button", { name: flow.skip }));
      await waitFor(() => expect(router.push).toHaveBeenCalledWith("/en/dashboard"));
      expect(server.posts()).toEqual([{ path: "/api/onboarding/state", method: "POST", body: { done: true } }]);
      unmount();
    }
  });

  it("leaves for the dashboard even when marking the flow done fails", async () => {
    backend({}, { save: "fail" });
    renderScreen();
    await stepHeading(flow.platform.title);
    await userEvent.click(screen.getByRole("button", { name: flow.skip }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/en/dashboard"));
  });

  it("leaves for the dashboard even when the request never answers", async () => {
    backend({}, { save: "hang" });
    renderScreen();
    await stepHeading(flow.platform.title);
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: flow.skip }));
    expect(router.push).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(router.push).toHaveBeenCalledWith("/en/dashboard");
  });

  it("goes back one step at a time, and has no Back on the first step", async () => {
    backend({ ...MT5_DONE, hasTrades: true, hasStrategy: true });
    renderScreen();
    await stepHeading(flow.finish.titleOwn);
    await userEvent.click(screen.getByRole("button", { name: flow.back }));
    await stepHeading(flow.strategy.title);
    await userEvent.click(screen.getByRole("button", { name: flow.back }));
    await stepHeading(flow.history.mt5.title);
    await userEvent.click(screen.getByRole("button", { name: flow.back }));
    await stepHeading(flow.goal.title);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    await userEvent.click(screen.getByRole("button", { name: flow.back }));
    await stepHeading(flow.platform.title);
    expect(screen.queryByRole("button", { name: flow.back })).not.toBeInTheDocument();
  });

  it("shows the earlier answer when going back, and goes on from it without saving again", async () => {
    const server = backend({ ...MT5_DONE });
    renderScreen();
    await stepHeading(flow.history.mt5.title);
    await userEvent.click(screen.getByRole("button", { name: flow.back }));
    await stepHeading(flow.goal.title);
    expect(screen.getByRole("radio", { name: flow.goal.risk.title })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: flow.goal.discipline.title })).toHaveAttribute("aria-checked", "false");

    await userEvent.click(screen.getByRole("button", { name: flow.continue }));
    await stepHeading(flow.history.mt5.title);
    expect(server.posts()).toEqual([]);
  });

  it("lets the person change an answer when going back", async () => {
    const server = backend({ ...MT5_DONE });
    renderScreen();
    await stepHeading(flow.history.mt5.title);
    await userEvent.click(screen.getByRole("button", { name: flow.back }));
    await userEvent.click(screen.getByRole("radio", { name: flow.goal.performance.title }));
    await stepHeading(flow.history.mt5.title);
    expect(server.posts()).toEqual([{ path: "/api/onboarding/state", method: "POST", body: { primaryGoal: "performance" } }]);
  });
});

describe("while a request is on its way", () => {
  /** Holds back the answer of the first request that saves something, until the test releases it. */
  function holdSaves() {
    const original = (apiFetch as Mock).getMockImplementation()!;
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/onboarding/state" && init?.method === "POST") await held;
      return original(path, init);
    });
    return release;
  }

  it("keeps the person where they went back to, and keeps the answer that was saved", async () => {
    const server = backend({ tradingPlatform: "mt5" });
    renderScreen();
    await stepHeading(flow.goal.title);
    const release = holdSaves();

    fireEvent.click(screen.getByRole("radio", { name: flow.goal.risk.title }));
    await userEvent.click(screen.getByRole("button", { name: flow.back }));
    await stepHeading(flow.platform.title);
    await act(async () => release());

    expect(screen.getByRole("heading", { level: 2, name: flow.platform.title })).toBeInTheDocument();
    expect(server.state.primaryGoal).toBe("risk");
    await userEvent.click(screen.getByRole("button", { name: flow.continue }));
    await stepHeading(flow.goal.title);
    expect(screen.getByRole("radio", { name: flow.goal.risk.title })).toHaveAttribute("aria-checked", "true");
  });

  it("saves a choice once, however often it is clicked", async () => {
    const server = backend({ tradingPlatform: "mt5" });
    renderScreen();
    await stepHeading(flow.goal.title);
    const release = holdSaves();

    fireEvent.click(screen.getByRole("radio", { name: flow.goal.risk.title }));
    fireEvent.click(screen.getByRole("radio", { name: flow.goal.risk.title }));
    fireEvent.click(screen.getByRole("radio", { name: flow.goal.performance.title }));
    await act(async () => release());

    await stepHeading(flow.history.mt5.title);
    expect(server.posts()).toEqual([{ path: "/api/onboarding/state", method: "POST", body: { primaryGoal: "risk" } }]);
  });

  it("marks the flow done once, however often 'Skip for now' is clicked", async () => {
    const server = backend();
    renderScreen();
    await stepHeading(flow.platform.title);
    const skip = screen.getByRole("button", { name: flow.skip });
    fireEvent.click(skip);
    fireEvent.click(skip);
    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
    expect(server.posts()).toEqual([{ path: "/api/onboarding/state", method: "POST", body: { done: true } }]);
  });
});

describe("coming back later", () => {
  it.each([
    [{}, "platform"],
    [{ tradingPlatform: "other" }, "goal"],
    [{ tradingPlatform: "other", primaryGoal: "strategy" }, "history.other"],
    [{ tradingPlatform: "other", primaryGoal: "strategy", hasTrades: true }, "strategy"],
    [{ tradingPlatform: "other", primaryGoal: "strategy", hasTrades: true, hasStrategy: true }, "finishOwn"]
  ] as [Partial<FirstRunState>, string][])("resumes at the first step that needs an answer: %j", async (initial, key) => {
    backend(initial);
    renderScreen();
    expect(await stepHeading(titleOf(flow, key))).toBeInTheDocument();
  });

  it("does not start over for someone who skipped the flow before", async () => {
    backend({ tradingPlatform: "mt5", primaryGoal: "risk", onboardedAt: "2026-10-01T10:00:00.000Z" });
    renderScreen();
    expect(await stepHeading(flow.history.mt5.title)).toBeInTheDocument();
  });
});

describe("focus, headings and keys", () => {
  it("moves focus to the new step's heading when the step changes", async () => {
    backend();
    renderScreen();
    await stepHeading(flow.platform.title);
    await userEvent.click(screen.getByRole("radio", { name: flow.platform.mt5.title }));
    const goal = await stepHeading(flow.goal.title);
    await waitFor(() => expect(goal).toHaveFocus());

    await userEvent.click(screen.getByRole("button", { name: flow.back }));
    const platform = await stepHeading(flow.platform.title);
    await waitFor(() => expect(platform).toHaveFocus());
  });

  it("keeps the heading order sound: the page title, then the step, then the optional sprint", async () => {
    backend();
    renderScreen();
    await stepHeading(flow.platform.title);
    const levels = screen.getAllByRole("heading").map((heading): [number, string | null] => [Number(heading.tagName.slice(1)), heading.textContent]);
    expect(levels[0]).toEqual([1, en.onboarding.title]);
    expect(levels[1]).toEqual([2, flow.platform.title]);
    expect(levels[2]).toEqual([2, en.onboarding.sprintHeading]);
    expect(levels.filter(([level]) => level === 1)).toHaveLength(1);
    expect(levels.every(([level]) => level <= 2)).toBe(true);
  });

  it("lets a keyboard drive the choices: arrows move, Enter or Space chooses", async () => {
    const server = backend();
    renderScreen();
    await stepHeading(flow.platform.title);
    const [mt5, other, manual] = screen.getAllByRole("radio");

    // One stop in the group; the arrows move between the choices without choosing.
    expect(mt5).toHaveAttribute("tabindex", "0");
    expect(other).toHaveAttribute("tabindex", "-1");
    mt5.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(other).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(manual).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(mt5).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(manual).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(mt5).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(manual).toHaveFocus();
    expect(server.posts()).toEqual([]);

    await userEvent.keyboard("{Enter}");
    expect(await stepHeading(flow.goal.title)).toBeInTheDocument();
    expect(server.posts()).toEqual([{ path: "/api/onboarding/state", method: "POST", body: { tradingPlatform: "manual" } }]);

    const risk = screen.getByRole("radio", { name: flow.goal.risk.title });
    risk.focus();
    await userEvent.keyboard(" ");
    expect(await stepHeading(flow.history.manual.title)).toBeInTheDocument();
    expect(server.posts()[1]?.body).toEqual({ primaryGoal: "risk" });
  });

  it("makes every choice and every action at least 44px tall and keeps long text inside a narrow screen", async () => {
    backend({ ...MT5_DONE, hasTrades: true, hasStrategy: true });
    const { container } = renderScreen();
    const tall = (element: Element) => /\bmin-h-(1[1-9]|[2-9]\d)\b/.test(element.className);

    // Every step of the flow, one after the other.
    for (let step = 5; step >= 1; step -= 1) {
      await screen.findByRole("heading", { level: 2, name: [flow.platform.title, flow.goal.title, flow.history.mt5.title, flow.strategy.title, flow.finish.titleOwn][step - 1] });
      const flowCard = screen.getByRole("progressbar").closest("[data-first-run]") as HTMLElement;
      expect(flowCard).not.toBeNull();
      for (const control of flowCard.querySelectorAll("button, a[href], [role='radio']")) expect(tall(control), control.outerHTML.slice(0, 120)).toBe(true);
      if (step > 1) await userEvent.click(screen.getByRole("button", { name: flow.back }));
    }
    // Nothing in the flow forces a width wider than a phone.
    expect(container.innerHTML).not.toMatch(/\bw-\[\d{3,}px\]|\bmin-w-\[\d{3,}px\]|\bwhitespace-nowrap/);
  });
});

describe("when a request fails", () => {
  it("says in the page language that an answer could not be saved, and stays where it is", async () => {
    const server = backend({}, { save: "fail" });
    renderScreen();
    await stepHeading(flow.platform.title);
    await userEvent.click(screen.getByRole("radio", { name: flow.platform.mt5.title }));

    expect(await screen.findByText(flow.saveFailed)).toBeInTheDocument();
    expect(screen.queryByText(/Unexpected server error/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: flow.platform.title })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: flow.platform.mt5.title })).toHaveAttribute("aria-checked", "false");
    expect(server.state.tradingPlatform).toBeNull();
    // It can still be left.
    expect(screen.getByRole("button", { name: flow.skip })).toBeEnabled();
  });

  it("goes on after a retry that works", async () => {
    const server = backend();
    renderScreen();
    await stepHeading(flow.platform.title);
    (apiFetch as Mock).mockImplementationOnce(async (path: string) => {
      if (path === "/api/onboarding/state") throw new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
      throw new Error("unexpected");
    });
    await userEvent.click(screen.getByRole("radio", { name: flow.platform.mt5.title }));
    await screen.findByText(flow.saveFailed);

    await userEvent.click(screen.getByRole("radio", { name: flow.platform.mt5.title }));
    expect(await stepHeading(flow.goal.title)).toBeInTheDocument();
    expect(screen.queryByText(flow.saveFailed)).not.toBeInTheDocument();
    expect(server.state.tradingPlatform).toBe("mt5");
  });

  it("says it in Persian on the Persian page", async () => {
    backend({}, { save: "fail" });
    const { container } = renderScreen("fa");
    await stepHeading(faFlow.platform.title);
    await userEvent.click(screen.getByRole("radio", { name: faFlow.platform.mt5.title }));
    expect(await screen.findByText(faFlow.saveFailed)).toBeInTheDocument();
    expect(englishLeaks(container)).toEqual([]);
  });

  it("starts from the first step, with a note, when the saved setup cannot be read", async () => {
    backend({}, { load: "fail" });
    renderScreen();
    expect(await stepHeading(flow.platform.title)).toBeInTheDocument();
    expect(screen.getByText(flow.loadFailed)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: flow.skip })).toBeEnabled();
    await userEvent.click(screen.getByRole("radio", { name: flow.platform.other.title }));
    expect(await stepHeading(flow.goal.title)).toBeInTheDocument();
    // The answer was saved, so the note is no longer true on the steps that follow.
    expect(screen.queryByText(flow.loadFailed)).not.toBeInTheDocument();
  });

  it("keeps the note while nothing has been saved, and says it in Persian on the Persian page", async () => {
    backend({}, { load: "fail", save: "fail" });
    const { container } = renderScreen("fa");
    await stepHeading(faFlow.platform.title);
    expect(screen.getByText(faFlow.loadFailed)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: faFlow.platform.mt5.title }));
    await screen.findByText(faFlow.saveFailed);
    expect(screen.getByText(faFlow.loadFailed)).toBeInTheDocument();
    expect(englishLeaks(container)).toEqual([]);
  });

  it("asks a signed-out visitor to sign in", async () => {
    backend({}, { load: "auth" });
    renderScreen();
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", expect.stringContaining("/en/login"));
    expect(screen.queryByRole("heading", { level: 2, name: flow.platform.title })).not.toBeInTheDocument();
  });

  it("shows a loading note while the saved setup is read, and can still be skipped", async () => {
    (apiFetch as Mock).mockImplementation(() => new Promise(() => undefined));
    renderScreen();
    expect(screen.getByText(flow.loading)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: flow.skip }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(router.push).toHaveBeenCalledWith("/en/dashboard");
  });
});

describe("the whole flow in Persian", () => {
  it.each([
    [{}, "platform"],
    [{ tradingPlatform: "mt5" }, "goal"],
    [{ ...MT5_DONE }, "history.mt5"],
    [{ tradingPlatform: "other", primaryGoal: "risk" }, "history.other"],
    [{ tradingPlatform: "manual", primaryGoal: "risk" }, "history.manual"],
    [{ ...MT5_DONE, hasTrades: true }, "strategy"],
    [{ ...MT5_DONE, hasTrades: true, hasStrategy: true }, "finishOwn"]
  ] as [Partial<FirstRunState>, string][])("has no English left on the step for %j", async (initial, key) => {
    backend(initial);
    const { container } = renderScreen("fa");
    await stepHeading(titleOf(faFlow, key));
    expect(englishLeaks(container)).toEqual([]);
  });

  it("calls a plan «پلن» and never «برنامه» anywhere in the flow", () => {
    const text = JSON.stringify(fa.onboarding.flow);
    expect(text).not.toMatch(/برنامه/);
  });

  it("calls the parts of the flow «گام», and names the skip button the way the error line does", () => {
    expect(JSON.stringify(fa.onboarding.flow)).not.toMatch(/مراحل/);
    expect(fa.onboarding.intro).not.toMatch(/مراحل/);
    expect(faFlow.saveFailed).toContain(`«${faFlow.skip}»`);
  });

  it("reads as Persian, not as a word-for-word copy of the English", () => {
    expect(faFlow.skip).not.toBe("فعلاً رد کردن");
    expect(faFlow.goal.hint).not.toMatch(/قفل/);
    expect(fa.onboarding.intro).not.toMatch(/راه‌افتادن|رد شوید/);
  });
});

describe("the page around the flow", () => {
  it("keeps the discipline sprint as an optional extra below the flow, not in its way", async () => {
    backend();
    renderScreen();
    const flowHeading = await stepHeading(flow.platform.title);
    const sprintHeading = screen.getByRole("heading", { level: 2, name: en.onboarding.sprintHeading });
    expect(flowHeading.compareDocumentPosition(sprintHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: en.onboarding.build })).toBeInTheDocument();
  });
});
