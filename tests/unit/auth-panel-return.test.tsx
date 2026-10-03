import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const api = vi.hoisted(() => ({ apiFetch: vi.fn(async () => ({})) }));
vi.mock("@/lib/api/client", () => api);
vi.mock("@/lib/demo", () => ({ DEMO_MODE: false }));

import { AuthPanel } from "@/features/auth/auth-panel";

const fa = getMessages("fa");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function signIn() {
  fireEvent.change(screen.getByLabelText(fa.auth.email, { exact: false }), { target: { value: "sara@example.com" } });
  fireEvent.change(screen.getByLabelText(fa.auth.password, { exact: false }), { target: { value: "Password1abc" } });
  fireEvent.click(screen.getByRole("button", { name: fa.auth.signIn }));
}

describe("AuthPanel after a successful sign-in", () => {
  it("goes to the dashboard and replaces the form in the history", async () => {
    render(<AuthPanel locale="fa" messages={fa} mode="login" />);
    signIn();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/fa/dashboard"));
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("returns to the page the visitor wanted", async () => {
    render(<AuthPanel locale="fa" messages={fa} mode="login" nextPath="/fa/journal" />);
    signIn();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/fa/journal"));
  });

  it("ignores a return path that is not a page of this language", async () => {
    render(<AuthPanel locale="fa" messages={fa} mode="login" nextPath="https://evil.example/fa/journal" />);
    signIn();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/fa/dashboard"));
  });

  it("keeps the return path when switching between sign-in and sign-up", () => {
    render(<AuthPanel locale="fa" messages={fa} mode="login" nextPath="/fa/journal" />);
    expect(screen.getByRole("link", { name: fa.auth.register }).getAttribute("href")).toBe("/fa/register?next=%2Ffa%2Fjournal");
  });
});
