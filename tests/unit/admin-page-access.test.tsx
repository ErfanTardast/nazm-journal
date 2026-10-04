import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/features/admin/access-requests-panel", () => ({ AccessRequestsPanel: () => <div>access requests panel</div> }));
vi.mock("@/features/billing/admin-payments-panel", () => ({ AdminPaymentsPanel: () => <div>payments panel</div> }));

import { ApiClientError, apiFetch } from "@/lib/api/client";
import { getCurrentUser } from "@/lib/auth/session";
import AdminPage from "@/app/[locale]/admin/page";

/*
 * A signed-in user who is not an admin used to open this page, mount the overview, call /api/admin/overview and only
 * then see the "needs an admin account" card, with a 403 in the browser console. The server component knows who is
 * signed in, so it decides first: no data screen is mounted and no request is made.
 */

const overview = {
  counts: { users: 12, trades: 340, portfolios: 3, alerts: 7 },
  featureFlags: [],
  auditLogs: [],
  system: { database: "configured", redis: "memory-fallback", aiProvider: "local", emailProvider: "local", marketDataProvider: "local", appUrl: "https://example.test" },
  options: { supportedMarkets: [], coreWorkflows: [], safetyGuardrails: [], aiWorkflows: [] }
};

const userWith = (roles: { name: string; permissions?: string[] }[]) => ({
  id: "u1",
  roles: roles.map((role) => ({ role: { name: role.name, permissions: (role.permissions ?? []).map((key) => ({ permission: { key } })) } }))
});

const admin = userWith([{ name: "admin" }]);
const member = userWith([{ name: "member" }]);

async function renderAdmin(locale: "en" | "fa") {
  return render(await AdminPage({ params: Promise.resolve({ locale }) }));
}

beforeEach(() => {
  (apiFetch as Mock).mockResolvedValue(overview);
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  (apiFetch as Mock).mockReset();
  (getCurrentUser as Mock).mockReset();
});

describe("the admin page, for someone who is not an admin", () => {
  it("shows the no-access card and calls nothing (English)", async () => {
    (getCurrentUser as Mock).mockResolvedValue(member);
    await renderAdmin("en");

    expect(screen.getByText("Admin overview unavailable")).toBeInTheDocument();
    expect(screen.getByText("This page needs an admin account.")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("shows the same card in Persian and calls nothing", async () => {
    (getCurrentUser as Mock).mockResolvedValue(member);
    await renderAdmin("fa");

    expect(screen.getByText("نمای مدیریت در دسترس نیست")).toBeInTheDocument();
    expect(screen.getByText("این صفحه فقط با حساب مدیر باز می‌شود.")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("shows no admin panel next to the card, payments on or off", async () => {
    (getCurrentUser as Mock).mockResolvedValue(member);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_PAYMENTS_ENABLED", "true");
    await renderAdmin("en");

    expect(screen.queryByText("payments panel")).toBeNull();
    expect(screen.queryByText("access requests panel")).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("treats a user with no role at all the same way", async () => {
    (getCurrentUser as Mock).mockResolvedValue(userWith([]));
    await renderAdmin("en");

    expect(screen.getByText("This page needs an admin account.")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe("the admin page, for an admin", () => {
  it("loads the overview as before", async () => {
    (getCurrentUser as Mock).mockResolvedValue(admin);
    await renderAdmin("en");

    expect(await screen.findByText("Users")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/admin/overview");
    expect(screen.queryByText("This page needs an admin account.")).toBeNull();
  });

  // The API lets the admin:read permission through as well, and the page follows the API's own rule.
  it("loads the overview for someone who holds the admin:read permission without the role", async () => {
    (getCurrentUser as Mock).mockResolvedValue(userWith([{ name: "support", permissions: ["admin:read"] }]));
    await renderAdmin("en");

    expect(await screen.findByText("Users")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/admin/overview");
  });
});

// The API keeps its own check. If it still says 403 (a role taken away since the page was built), the screen shows the same card.
describe("the admin page, when the API refuses anyway", () => {
  it("shows the same card, and the server's English sentence stays off the screen", async () => {
    (getCurrentUser as Mock).mockResolvedValue(admin);
    (apiFetch as Mock).mockRejectedValue(new ApiClientError("Admin access is required", 403, "FORBIDDEN"));
    await renderAdmin("fa");

    expect(await screen.findByText("این صفحه فقط با حساب مدیر باز می‌شود.")).toBeInTheDocument();
    expect(screen.getByText("نمای مدیریت در دسترس نیست")).toBeInTheDocument();
    expect(screen.queryByText("Admin access is required")).toBeNull();
  });
});

describe("the admin page, for a visitor who is signed out or cannot be told apart", () => {
  it("shows the sign-in card at once, with no request", async () => {
    (getCurrentUser as Mock).mockResolvedValue(null);
    await renderAdmin("en");

    expect(screen.getByText("Sign in required")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("falls back to the screen, which asks the API, when the session cannot be read", async () => {
    (getCurrentUser as Mock).mockRejectedValue(new Error("database down"));
    await renderAdmin("en");

    expect(await screen.findByText("Users")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/admin/overview");
  });
});
