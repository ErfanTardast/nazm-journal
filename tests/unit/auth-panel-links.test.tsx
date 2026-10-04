import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/demo", () => ({ DEMO_MODE: false }));

import { AuthPanel } from "@/features/auth/auth-panel";

afterEach(cleanup);

// The header only offers "Sign in", so a new trial user lands on the login form and needs a way to sign up.
describe("AuthPanel links between sign-in and sign-up", () => {
  it("offers account creation from the sign-in form", () => {
    const fa = getMessages("fa");
    render(<AuthPanel locale="fa" messages={fa} mode="login" />);
    expect(screen.getByText(fa.auth.noAccount)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: fa.auth.register }).getAttribute("href")).toBe("/fa/register");
  });

  // There is no password-reset page or email: the sign-in form says who to ask instead, the server's administrator.
  it("tells a person who forgot the password to ask the administrator of this server, in the page language", () => {
    const fa = getMessages("fa");
    const { unmount } = render(<AuthPanel locale="fa" messages={fa} mode="login" />);
    expect(screen.getByText(fa.auth.forgotPassword)).toBeInTheDocument();
    expect(fa.auth.forgotPassword).toMatch(/^[^A-Za-z]+$/);
    unmount();

    const en = getMessages("en");
    render(<AuthPanel locale="en" messages={en} mode="login" />);
    expect(screen.getByText(en.auth.forgotPassword)).toBeInTheDocument();
    expect(en.auth.forgotPassword).toMatch(/administrator/i);
  });

  it("does not show it on the sign-up form", () => {
    const en = getMessages("en");
    render(<AuthPanel locale="en" messages={en} mode="register" />);
    expect(screen.queryByText(en.auth.forgotPassword)).toBeNull();
  });

  it("offers sign-in from the sign-up form", () => {
    const en = getMessages("en");
    render(<AuthPanel locale="en" messages={en} mode="register" />);
    expect(screen.getByText(en.auth.haveAccount)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: en.auth.signIn }).getAttribute("href")).toBe("/en/login");
  });
});
