import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { englishLeaks } from "./support/english-leaks";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { AdminScreen } from "@/features/admin/admin-screen";

const ARABIC_SCRIPT = /[؀-ۿ]/;

/** The overview as the server sends it: its own words are English whatever the page language is. */
const overview = {
  counts: { users: 12, trades: 340, portfolios: 3, alerts: 7 },
  featureFlags: [{ id: "f1", key: "news_context", enabled: true, description: null }, { id: "f2", key: "weekly_digest", enabled: false, description: null }],
  auditLogs: [{ id: "a1", action: "auth.login", entity: "User", createdAt: "2026-10-01T08:30:00.000Z" }],
  system: { database: "configured", redis: "memory-fallback", aiProvider: "local", emailProvider: "local", marketDataProvider: "local", appUrl: "https://example.test" },
  options: {
    supportedMarkets: [{ value: "forex", label: "Forex" }],
    coreWorkflows: ["Daily review", "Trade planning", "Trade journaling", "Risk check", "Performance review", "Strategy playbook review", "News/context review", "Learning mode"],
    safetyGuardrails: ["Educational analytics only", "No market certainty language", "No financial advice promises", "No live market connectivity", "No automation of trading decisions"],
    aiWorkflows: []
  }
};

/** Identifiers an operator reads as they are stored: audit actions, model names, flag keys, the app address. */
const IDENTIFIERS = ["auth.login", "User", "news_context", "weekly_digest", "https://example.test", "Redis"];

afterEach(() => {
  cleanup();
  (apiFetch as Mock).mockReset();
});

describe("admin overview in Persian", () => {
  it("has no English label, heading, description or status left on it", async () => {
    (apiFetch as Mock).mockResolvedValue(overview);
    const { container } = render(<AdminScreen locale="fa" messages={getMessages("fa")} />);
    await screen.findByText("کاربران");

    expect(englishLeaks(container, IDENTIFIERS)).toEqual([]);
  });

  it("words the counts, the system rows and the values the server sends", async () => {
    (apiFetch as Mock).mockResolvedValue(overview);
    render(<AdminScreen locale="fa" messages={getMessages("fa")} />);

    expect(await screen.findByText("کاربران")).toBeInTheDocument();
    expect(screen.getByText("معامله‌ها")).toBeInTheDocument();
    expect(screen.getByText("پایگاه داده")).toBeInTheDocument();
    expect(screen.getByText("پیکربندی‌شده")).toBeInTheDocument();
    expect(screen.getByText("مرور روزانه")).toBeInTheDocument();
    expect(screen.getByText("فقط تحلیل آموزشی")).toBeInTheDocument();
    expect(screen.getByText("فعال")).toBeInTheDocument();
    expect(screen.getByText("غیرفعال")).toBeInTheDocument();
    // Counts are written in Persian digits.
    expect(screen.getByText("۳۴۰")).toBeInTheDocument();
  });

  it("keeps stored identifiers readable left to right", async () => {
    (apiFetch as Mock).mockResolvedValue(overview);
    render(<AdminScreen locale="fa" messages={getMessages("fa")} />);

    expect((await screen.findByText("auth.login")).closest("[dir='ltr']")).not.toBeNull();
    expect(screen.getByText("news_context").closest("[dir='ltr']")).not.toBeNull();
  });

  it("says in Persian that it is loading, and that it could not load", async () => {
    let fail: (reason: unknown) => void = () => {};
    (apiFetch as Mock).mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    const { container } = render(<AdminScreen locale="fa" messages={getMessages("fa")} />);
    expect(englishLeaks(container)).toEqual([]);
    expect(container.textContent).toMatch(ARABIC_SCRIPT);

    fail(new ApiClientError("Admin access is required", 403, "FORBIDDEN"));
    expect(await screen.findByText("نمای مدیریت در دسترس نیست")).toBeInTheDocument();
    // The server's own English sentence is never printed.
    expect(container.textContent).not.toContain("Admin access is required");
    expect(englishLeaks(container)).toEqual([]);
  });

  it("says so in Persian when there is no flag and no audit entry", async () => {
    (apiFetch as Mock).mockResolvedValue({ ...overview, featureFlags: [], auditLogs: [] });
    const { container } = render(<AdminScreen locale="fa" messages={getMessages("fa")} />);
    await screen.findByText("کاربران");

    expect(englishLeaks(container, IDENTIFIERS)).toEqual([]);
  });
});

describe("admin overview in English", () => {
  it("stays fully English", async () => {
    (apiFetch as Mock).mockResolvedValue(overview);
    const { container } = render(<AdminScreen locale="en" messages={getMessages("en")} />);

    expect(await screen.findByText("Users")).toBeInTheDocument();
    expect(screen.getByText("Daily review")).toBeInTheDocument();
    expect(screen.getByText("Educational analytics only")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(ARABIC_SCRIPT);
  });

  it("does not print the server's error sentence either", async () => {
    (apiFetch as Mock).mockRejectedValue(new ApiClientError("Admin access is required", 403, "FORBIDDEN"));
    const { container } = render(<AdminScreen locale="en" messages={getMessages("en")} />);

    expect(await screen.findByText("Admin overview unavailable")).toBeInTheDocument();
    expect(container.textContent).not.toContain("Admin access is required");
  });
});
