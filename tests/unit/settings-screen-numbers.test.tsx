import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(), isAuthError: () => false }));
import { apiFetch } from "@/lib/api/client";
import { SettingsScreen } from "@/features/settings/settings-screen";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const settings = {
  locale: "en",
  theme: "dark",
  timezone: "UTC",
  riskPerTradePct: 0.5,
  maxDailyLossPct: 1.5,
  maxWeeklyLossPct: 4,
  startingBalance: null,
  brokerTimeZone: "UTC"
};
const options = {
  product: { supportedMarkets: [], coreWorkflows: [], safetyGuardrails: [] },
  userDefaults: {
    locales: [{ value: "en", label: "English", description: "" }],
    themes: [{ value: "dark", label: "Dark", description: "" }],
    timezones: ["UTC"],
    riskPresets: [
      { label: "Conservative", riskPerTradePct: 0.5, maxDailyLossPct: 1.5, maxWeeklyLossPct: 4 },
      { label: "Balanced", riskPerTradePct: 1, maxDailyLossPct: 3, maxWeeklyLossPct: 6 }
    ]
  },
  ai: { provider: "local", workflows: [] },
  infrastructure: { database: "x", redis: "x", emailProvider: "x", marketDataProvider: "x", appUrl: "x" }
};

function serve() {
  (apiFetch as Mock).mockImplementation(async (url: string, init?: { method?: string }) => {
    if (url === "/api/users/me/settings" && init?.method === "PATCH") return {};
    if (url === "/api/users/me/settings") return { settings };
    if (url === "/api/system/options") return { options };
    return { categories: [] };
  });
}

describe("Settings risk defaults typed with Persian digits", () => {
  it("sends the typed text and shows the saved numbers, not NaN", async () => {
    serve();
    render(<SettingsScreen locale="fa" messages={getMessages("fa")} />);
    fireEvent.change(await screen.findByLabelText("ریسک هر معامله (٪)"), { target: { value: "۱" } });
    fireEvent.change(screen.getByLabelText("حداکثر زیان روزانه (٪)"), { target: { value: "۳" } });
    fireEvent.change(screen.getByLabelText("حداکثر زیان هفتگی (٪)"), { target: { value: "٦" } });
    fireEvent.submit(screen.getByLabelText("ریسک هر معامله (٪)").closest("form")!);

    await waitFor(() => expect((apiFetch as Mock).mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    // The Balanced preset (1 / 3 / 6) becomes the highlighted one once the saved values are read as numbers.
    await waitFor(() => expect(screen.getByText("متعادل").closest("div")!.className).toContain("border-success/30"));
  });
});
