import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/features/admin/admin-screen", () => ({
  AdminScreen: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="admin-screen">
      admin screen
      {children}
    </div>
  )
}));
vi.mock("@/features/admin/access-requests-panel", () => ({ AccessRequestsPanel: ({ locale }: { locale: string }) => <div>access requests panel {locale}</div> }));
vi.mock("@/features/billing/admin-payments-panel", () => ({ AdminPaymentsPanel: () => <div>payments panel</div> }));

import AdminPage from "@/app/[locale]/admin/page";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

async function renderAdmin(locale: string) {
  return render(await AdminPage({ params: Promise.resolve({ locale }) }));
}

describe("admin page", () => {
  it("shows the access requests next to the overview, in the language of the page", async () => {
    await renderAdmin("fa");

    expect(screen.getByText(/admin screen/)).toBeInTheDocument();
    expect(screen.getByText("access requests panel fa")).toBeInTheDocument();
  });

  // The requests are what the owner comes to this page for: they sit right under the heading, not below the system details.
  it("hands the access requests to the overview, which shows them first", async () => {
    await renderAdmin("fa");

    expect(screen.getByTestId("admin-screen").contains(screen.getByText("access requests panel fa"))).toBe(true);
  });

  it("shows the access requests in production too, where payments are off", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_PAYMENTS_ENABLED", "");

    await renderAdmin("en");

    expect(screen.getByText("access requests panel en")).toBeInTheDocument();
    expect(screen.queryByText("payments panel")).not.toBeInTheDocument();
  });

  it("shows the payments panel only while payments are enabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_PAYMENTS_ENABLED", "true");
    await renderAdmin("en");
    expect(screen.getByText("payments panel")).toBeInTheDocument();
    cleanup();

    vi.stubEnv("NEXT_PUBLIC_PAYMENTS_ENABLED", "");
    await renderAdmin("en");
    expect(screen.queryByText("payments panel")).not.toBeInTheDocument();
  });

  it("404s an unknown language", async () => {
    await expect(AdminPage({ params: Promise.resolve({ locale: "de" }) })).rejects.toThrow();
  });
});
