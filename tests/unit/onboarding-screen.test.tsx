import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

// The guided first run above the sprint builder navigates with the app router, which a bare render does not have.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api/client")>()), apiFetch: vi.fn() }));
import { apiFetch } from "@/lib/api/client";
import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";

const en = getMessages("en");

describe("OnboardingScreen", () => {
  it("renders the four questions and builds a plan on click", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      segment: "beginner-crypto-no_plan",
      defaultRiskPercent: 0.5,
      focusAreas: ["Write a one-line plan before each trade"],
      recommendedFeatures: ["journal", "learning"],
      startingChecklist: ["Start a trading session before your first trade"],
      language: "en"
    } as never);

    render(<OnboardingScreen messages={en} locale="en" />);
    expect(screen.getByText(en.onboarding.experienceLabel)).toBeInTheDocument();
    expect(screen.getByText(en.onboarding.issueLabel)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: en.onboarding.build }));
    expect(await screen.findByText("Beginner · Crypto · Trading without a plan")).toBeInTheDocument();
    expect(screen.getByText(/Write a one-line plan/)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining("/api/onboarding/plan?"));
  });

  it("shows an error when the plan request fails", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("boom"));
    render(<OnboardingScreen messages={en} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: en.onboarding.build }));
    expect(await screen.findByText("boom")).toBeInTheDocument();
  });

  it("saves the generated plan as a 7-day sprint", async () => {
    const plan = {
      segment: "beginner-crypto-no_plan",
      defaultRiskPercent: 0.5,
      focusAreas: ["Write a one-line plan before each trade"],
      recommendedFeatures: ["journal", "learning"],
      startingChecklist: ["Start a trading session before your first trade"],
      language: "en"
    };
    const profile = {
      ...plan,
      id: "profile-1",
      experience: "beginner",
      market: "crypto",
      disciplineIssue: "no_plan",
      starterStrategyId: "strategy-1",
      firstReviewId: "review-1",
      completedAt: "2026-06-27T00:00:00.000Z",
      sprint: {
        title: "7-day discipline sprint",
        startDate: "2026-06-27",
        endDate: "2026-07-03",
        targetMistake: "Trading without a written plan",
        sessionRule: "Create the plan before the session.",
        riskDefaults: { riskPerTradePct: 0.5, maxDailyLossPct: 3, maxWeeklyLossPct: 6 },
        starterPlaybook: { name: "Crypto discipline starter" },
        days: [{ day: 1, date: "2026-06-27", targetScore: 65, focus: "Set the baseline.", reviewPrompt: "Did I follow the rule?" }]
      }
    };

    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path === "/api/onboarding/sprint" && init?.method === "POST") return { profile } as never;
      if (path === "/api/onboarding/sprint") return { profile: null } as never;
      return plan as never;
    });

    render(<OnboardingScreen messages={en} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: en.onboarding.build }));
    expect(await screen.findByText("Beginner · Crypto · Trading without a plan")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: en.onboarding.saveSprint }));
    expect(await screen.findByText(en.onboarding.sprintTitle)).toBeInTheDocument();
    expect(screen.getByText("Trading without a written plan")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/onboarding/sprint",
      expect.objectContaining({ method: "POST" })
    );
  });
});
