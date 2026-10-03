import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "@/lib/api/client";
import { DisciplineStreakPanel } from "@/features/dashboard/discipline-streak-panel";

const streak = (over: Partial<Record<string, unknown>> = {}) => ({
  currentStreak: 4,
  bestStreak: 9,
  totalActiveDays: 20,
  totalDisciplinedDays: 15,
  lastActiveDate: "2026-07-03",
  brokeStreakOnLastDay: false,
  unreviewedDays: 0,
  ...over
});

describe("DisciplineStreakPanel", () => {
  it("renders current streak, best streak, and disciplined-day ratio", async () => {
    vi.mocked(apiFetch).mockResolvedValue(streak() as never);
    render(<DisciplineStreakPanel locale="en" />);
    expect(await screen.findByText("Discipline streak")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText(/15\/20 \(75%\)/)).toBeInTheDocument();
    expect(screen.queryByText(/broke the streak/)).not.toBeInTheDocument();
  });

  it("shows the reset warning when the last active day broke the streak", async () => {
    vi.mocked(apiFetch).mockResolvedValue(streak({ currentStreak: 0, brokeStreakOnLastDay: true }) as never);
    render(<DisciplineStreakPanel locale="en" />);
    expect(await screen.findByText(/broke the streak/)).toBeInTheDocument();
  });

  it("asks for a review when trading days have no rule verdict yet", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      streak({ currentStreak: 0, bestStreak: 0, totalActiveDays: 0, totalDisciplinedDays: 0, lastActiveDate: null, unreviewedDays: 5 }) as never
    );
    render(<DisciplineStreakPanel locale="en" />);

    expect(await screen.findByText(/5 trading days have trades without a rule verdict/)).toBeInTheDocument();
    expect(screen.queryByText(/No trading days yet/)).not.toBeInTheDocument();
  });

  it("shows the empty state before any active trading day", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      streak({ currentStreak: 0, bestStreak: 0, totalActiveDays: 0, totalDisciplinedDays: 0, lastActiveDate: null }) as never
    );
    render(<DisciplineStreakPanel locale="en" />);
    expect(await screen.findByText(/starts with your first rule-following day/)).toBeInTheDocument();
  });

  it("renders Persian copy for fa locale", async () => {
    vi.mocked(apiFetch).mockResolvedValue(streak() as never);
    render(<DisciplineStreakPanel locale="fa" />);
    expect(await screen.findByText("زنجیره انضباط")).toBeInTheDocument();
  });

  it("renders nothing (degrades gracefully) when the fetch fails", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("offline"));
    const { container } = render(<DisciplineStreakPanel locale="en" />);
    // microtask flush so the .catch runs (same pattern as demo-story-panel)
    await Promise.resolve();
    expect(container.firstChild).toBeNull();
  });
});
