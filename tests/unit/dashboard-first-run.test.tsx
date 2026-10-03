import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => "/en/dashboard" }));
vi.mock("@/features/onboarding/setup-checklist", () => ({ SetupChecklist: ({ locale }: { locale: string }) => <div>setup checklist {locale}</div> }));
vi.mock("@/features/sample/sample-data-offer", () => ({ SampleDataOffer: ({ locale }: { locale: string }) => <div>sample data offer {locale}</div> }));
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api/client";
import { DashboardScreen } from "@/features/dashboard/dashboard-screen";

const overview = {
  metrics: { totalTrades: 0, winRate: 0 },
  openTrades: 0,
  plannedTrades: [],
  repeatedMistakes: [],
  ruleViolations: 0,
  journalFollowUps: 0,
  completePlanCount: 0,
  riskDefaults: { riskPerTradePct: 1, maxDailyLossPct: 3, maxWeeklyLossPct: 6, valid: true },
  readiness: { status: "caution", score: 40, primaryAction: "plan", checks: [] },
  reviewFocus: { review: null, overdueCount: 0, suggestedType: "daily" },
  activeSession: null
};

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

/** The first-run card and the sample offer sit at the top of the dashboard; each decides on its own whether to show. */
describe("the dashboard's first-run helpers", () => {
  it.each(["en", "fa"] as const)("mounts the setup checklist and the sample offer in %s", async (locale) => {
    (apiFetch as Mock).mockImplementation(async (path: string) => (path.startsWith("/api/dashboard/overview") ? overview : Promise.reject(new TypeError("offline"))));
    render(<DashboardScreen locale={locale} messages={getMessages(locale)} />);
    expect(await screen.findByText(`setup checklist ${locale}`)).toBeInTheDocument();
    expect(screen.getByText(`sample data offer ${locale}`)).toBeInTheDocument();
  });
});
