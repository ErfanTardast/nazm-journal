import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(), isAuthError: () => false }));
import { DisciplinePanel } from "@/features/dashboard/dashboard-screen";

afterEach(cleanup);

const propGuard = { alerts: [], isBlocked: false, todayLossPct: 0, maxDailyLossPct: 3 };

// A brand-new account was shown a green "B" and 75 with five unlabeled percentages.
describe("DisciplinePanel", () => {
  it("says there is not enough data yet instead of showing a grade (en)", () => {
    render(<DisciplinePanel locale="en" discipline={{ disciplineScore: null, propGuard, mistakePatterns: [] }} />);
    expect(screen.getByText("Not enough data yet")).toBeInTheDocument();
    expect(screen.queryByText("out of 100")).toBeNull();
    expect(screen.queryByText("B")).toBeNull();
    expect(screen.queryByText("75")).toBeNull();
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  it("says there is not enough data yet instead of showing a grade (fa)", () => {
    render(<DisciplinePanel locale="fa" discipline={{ disciplineScore: null, propGuard, mistakePatterns: [] }} />);
    expect(screen.getByText("هنوز داده کافی نیست")).toBeInTheDocument();
    expect(screen.queryByText("از ۱۰۰")).toBeNull();
  });

  it("shows the grade, the score and labeled checks when there is data", () => {
    const checks = [
      { key: "plan_adherence", score: 50, passed: false, detail: "" },
      { key: "rule_discipline", score: 100, passed: true, detail: "" }
    ];
    render(<DisciplinePanel locale="en" discipline={{ disciplineScore: { score: 82, grade: "B", checks }, propGuard, mistakePatterns: [] }} />);
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText("Plans 50%")).toBeInTheDocument();
    expect(screen.getByText("Rules 100%")).toBeInTheDocument();
  });
});
