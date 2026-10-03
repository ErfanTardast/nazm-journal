import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { englishLeaks } from "./support/english-leaks";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";

const en = getMessages("en");
const fa = getMessages("fa");
const PERSIAN_LETTER = /[؀-ۿ]/;

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

const emptyState = { state: { tradingPlatform: null, primaryGoal: null, onboardedAt: null, hasTrades: false, hasStrategy: false, hasPlan: false } };

const faPlan = {
  segment: "beginner-crypto-no_plan",
  defaultRiskPercent: 0.5,
  focusAreas: ["پیش از هر معامله یک پلن یک‌خطی بنویسید"],
  recommendedFeatures: ["trading-session", "journal", "risk-calculator", "learning"],
  startingChecklist: ["پیش از اولین معامله یک جلسه معاملاتی شروع کنید"],
  language: "fa"
};

const faProfile = {
  ...faPlan,
  id: "profile-1",
  experience: "beginner",
  market: "crypto",
  disciplineIssue: "no_plan",
  starterStrategyId: "strategy-1",
  firstReviewId: "review-1",
  completedAt: "2026-06-27T00:00:00.000Z",
  sprint: {
    title: "اسپرینت انضباط هفت‌روزه",
    startDate: "2026-06-27",
    endDate: "2026-07-03",
    targetMistake: "معامله بدون پلن مکتوب",
    sessionRule: "پلن را پیش از جلسه بسازید.",
    riskDefaults: { riskPerTradePct: 0.5, maxDailyLossPct: 3, maxWeeklyLossPct: 6 },
    starterPlaybook: { name: "پلی‌بوک شروع انضباط کریپتو" },
    days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, date: `2026-06-${26 + day}`, targetScore: 60 + day * 5, focus: "یک جلسه متمرکز شروع کنید.", reviewPrompt: "؟" }))
  }
};

/** The screen's own requests: the first-run state, the saved sprint and (when asked) a plan or a save. */
function route(handlers: { plan?: () => unknown; save?: () => unknown; saved?: unknown } = {}) {
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/onboarding/state") return emptyState;
    if (path === "/api/onboarding/sprint" && init?.method === "POST") return (handlers.save ?? (() => ({ profile: faProfile })))();
    if (path === "/api/onboarding/sprint") return { profile: handlers.saved ?? null };
    if (path.startsWith("/api/onboarding/plan")) return (handlers.plan ?? (() => faPlan))();
    throw new Error(`unexpected request ${path}`);
  });
}

describe("discipline sprint on the Persian page", () => {
  /** The four sprint questions are experience, market, issue and language, in that order. */
  const marketSelect = () => screen.getAllByRole("combobox")[1] as HTMLSelectElement;

  it("words the market choices in Persian", () => {
    route();
    render(<OnboardingScreen messages={fa} locale="fa" />);
    expect(Array.from(marketSelect().options).map((option) => option.text)).toEqual(["کریپتو", "فارکس", "سهام"]);
    expect(Array.from(marketSelect().options).map((option) => option.value)).toEqual(["crypto", "forex", "stocks"]);
  });

  it("words the market choices in English on the English page", () => {
    route();
    render(<OnboardingScreen messages={en} locale="en" />);
    expect(Array.from(marketSelect().options).map((option) => option.text)).toEqual(["Crypto", "Forex", "Stocks"]);
  });

  it("shows the screen's own sentence when the plan cannot be built, never the server's text", async () => {
    route({
      plan: () => {
        throw new ApiClientError("Upstream exploded: ECONNRESET 10.0.0.7", 500, "INTERNAL_SERVER_ERROR");
      }
    });
    render(<OnboardingScreen messages={fa} locale="fa" />);
    fireEvent.click(screen.getByRole("button", { name: fa.onboarding.build }));
    expect(await screen.findByText(fa.onboarding.buildFailed)).toBeInTheDocument();
    expect(screen.queryByText(/ECONNRESET/)).not.toBeInTheDocument();
  });

  it("shows the screen's own sentence when the sprint cannot be saved", async () => {
    route({
      save: () => {
        throw new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
      }
    });
    render(<OnboardingScreen messages={fa} locale="fa" />);
    fireEvent.click(screen.getByRole("button", { name: fa.onboarding.build }));
    fireEvent.click(await screen.findByRole("button", { name: fa.onboarding.saveSprint }));
    expect(await screen.findByText(fa.onboarding.saveFailed)).toBeInTheDocument();
    expect(screen.queryByText(/Unexpected server error/)).not.toBeInTheDocument();
  });

  it("says a failed connection in Persian too", async () => {
    route({
      plan: () => {
        throw new TypeError("Failed to fetch");
      }
    });
    render(<OnboardingScreen messages={fa} locale="fa" />);
    fireEvent.click(screen.getByRole("button", { name: fa.onboarding.build }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(PERSIAN_LETTER);
    expect(alert.textContent).not.toMatch(/fetch/i);
  });

  it("writes the sprint dates in the Persian calendar, with Persian digits", async () => {
    route({ saved: faProfile });
    render(<OnboardingScreen messages={fa} locale="fa" />);
    const heading = await screen.findByRole("heading", { name: fa.onboarding.sprintTitle });
    const range = within(heading.parentElement!).getByText(/۱۴۰۵/);
    expect(range.textContent).not.toMatch(/2026|\d{4}-\d{2}-\d{2}/);
    expect(range.textContent).not.toMatch(/[0-9]/);
  });

  it("keeps the ISO days on the English page", async () => {
    route({ saved: { ...faProfile, sprint: { ...faProfile.sprint, title: "7-day discipline sprint" } } });
    render(<OnboardingScreen messages={en} locale="en" />);
    expect(await screen.findByText("2026-06-27 - 2026-07-03")).toBeInTheDocument();
  });

  it("labels the days in the page language", async () => {
    route({ saved: faProfile });
    render(<OnboardingScreen messages={fa} locale="fa" />);
    expect(await screen.findByText("روز ۱")).toBeInTheDocument();
    expect(screen.getByText("روز ۷")).toBeInTheDocument();
    expect(screen.queryByText(/^D\d$/)).not.toBeInTheDocument();
  });

  it("labels the days in English on the English page", async () => {
    route({ saved: faProfile });
    render(<OnboardingScreen messages={en} locale="en" />);
    expect(await screen.findByText("Day 1")).toBeInTheDocument();
    expect(screen.getByText("Day 7")).toBeInTheDocument();
  });

  it("shows the plan with Persian words and digits, not the stored identifiers", async () => {
    route();
    const { container } = render(<OnboardingScreen messages={fa} locale="fa" />);
    fireEvent.click(screen.getByRole("button", { name: fa.onboarding.build }));
    await screen.findByText(fa.onboarding.planFor);

    expect(screen.queryByText("beginner-crypto-no_plan")).not.toBeInTheDocument();
    expect(screen.getByText("مبتدی · کریپتو · معامله بدون پلن")).toBeInTheDocument();
    expect(screen.getByText(/۰٫۵٪/)).toBeInTheDocument();
    for (const feature of ["جلسه معاملاتی", "ژورنال", "ماشین‌حساب ریسک", "حالت آموزشی"]) expect(screen.getByText(feature)).toBeInTheDocument();
    expect(englishLeaks(container)).toEqual([]);
  });

  it("has no English left on the whole Persian page once the sprint is saved", async () => {
    route({ saved: faProfile });
    const { container } = render(<OnboardingScreen messages={fa} locale="fa" />);
    await screen.findByText("روز ۱");
    expect(englishLeaks(container)).toEqual([]);
  });
});
