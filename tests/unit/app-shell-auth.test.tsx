import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const nav = vi.hoisted(() => ({ pathname: "/fa/journal" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => router }));
const api = vi.hoisted(() => ({ apiFetch: vi.fn(async () => ({})) }));
vi.mock("@/lib/api/client", () => api);

import { AppShell } from "@/components/layout/app-shell";

const fa = getMessages("fa");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// The owner registered and signed in, and the header still offered "Sign in" (2026-09-29).
describe("AppShell header and the signed-in state", () => {
  it("shows the user's name and sign-out, not sign-in, when signed in", () => {
    render(<AppShell locale="fa" messages={fa} canAccessAdmin={false} user={{ name: "سارا نمونه", email: "sara@example.com" }}><p>page</p></AppShell>);
    expect(screen.queryByRole("link", { name: fa.auth.signIn })).toBeNull();
    expect(screen.queryByRole("link", { name: fa.auth.register })).toBeNull();
    expect(screen.getByRole("button", { name: fa.auth.signOut })).toBeInTheDocument();
    expect(screen.getByText("سارا نمونه")).toBeInTheDocument();
  });

  it("signs out through the API and returns to the sign-in page", async () => {
    render(<AppShell locale="fa" messages={fa} canAccessAdmin={false} user={{ name: "سارا نمونه", email: "sara@example.com" }}><p>page</p></AppShell>);
    fireEvent.click(screen.getByRole("button", { name: fa.auth.signOut }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/fa/login"));
    expect(api.apiFetch).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("offers sign-in, and no sign-out, when signed out", () => {
    render(<AppShell locale="fa" messages={fa} canAccessAdmin={false} user={null}><p>page</p></AppShell>);
    expect(screen.getByRole("link", { name: fa.auth.signIn }).getAttribute("href")).toBe("/fa/login");
    expect(screen.queryByRole("button", { name: fa.auth.signOut })).toBeNull();
  });

  it("switches language on the same page instead of jumping to the dashboard", () => {
    render(<AppShell locale="fa" messages={fa} canAccessAdmin={false} user={null}><p>page</p></AppShell>);
    expect(screen.getByRole("link", { name: "English" }).getAttribute("href")).toBe("/en/journal");
  });

  it("keeps a visitor on the landing page when switching language there", () => {
    nav.pathname = "/fa";
    try {
      render(<AppShell locale="fa" messages={fa} canAccessAdmin={false} user={null}><p>page</p></AppShell>);
      expect(screen.getByRole("link", { name: "English" }).getAttribute("href")).toBe("/en");
    } finally {
      nav.pathname = "/fa/journal";
    }
  });
});

describe("AppShell admin entry", () => {
  it("does not list the Admin page for a non-admin, and lists it for an admin", () => {
    const adminHref = 'a[href="/fa/admin"]';
    const member = { name: "سارا نمونه", email: "sara@example.com" };
    const plain = render(<AppShell locale="fa" messages={fa} canAccessAdmin={false} user={member}><p>page</p></AppShell>);
    expect(plain.container.querySelector(adminHref)).toBeNull();
    plain.unmount();
    const admin = render(<AppShell locale="fa" messages={fa} canAccessAdmin={true} user={member}><p>page</p></AppShell>);
    expect(admin.container.querySelector(adminHref)).not.toBeNull();
  });
});
