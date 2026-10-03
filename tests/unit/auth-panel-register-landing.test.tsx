import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const api = vi.hoisted(() => ({ apiFetch: vi.fn(async () => ({})) }));
vi.mock("@/lib/api/client", () => api);
vi.mock("@/lib/demo", () => ({ DEMO_MODE: false }));

import { AuthPanel } from "@/features/auth/auth-panel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function fillIn(messages: ReturnType<typeof getMessages>) {
  fireEvent.change(screen.getByLabelText(messages.auth.name, { exact: false }), { target: { value: "Sara Ahmadi" } });
  fireEvent.change(screen.getByLabelText(messages.auth.email, { exact: false }), { target: { value: "sara@example.com" } });
  fireEvent.change(screen.getByLabelText(messages.auth.password, { exact: false }), { target: { value: "Password1abcd" } });
}

describe("AuthPanel after a successful sign-up", () => {
  it.each(["fa", "en"] as const)("opens the first-run flow on the %s page, not the empty dashboard", async (locale) => {
    const messages = getMessages(locale);
    render(<AuthPanel locale={locale} messages={messages} mode="register" />);
    fillIn(messages);
    fireEvent.click(screen.getByRole("button", { name: messages.auth.register }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/${locale}/onboarding`));
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("lets a safe return path win over the first-run flow", async () => {
    const messages = getMessages("fa");
    render(<AuthPanel locale="fa" messages={messages} mode="register" nextPath="/fa/journal" />);
    fillIn(messages);
    fireEvent.click(screen.getByRole("button", { name: messages.auth.register }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/fa/journal"));
  });

  it("ignores a return path that is not a page of this language, and opens the flow", async () => {
    const messages = getMessages("fa");
    render(<AuthPanel locale="fa" messages={messages} mode="register" nextPath="https://evil.example/fa/journal" />);
    fillIn(messages);
    fireEvent.click(screen.getByRole("button", { name: messages.auth.register }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/fa/onboarding"));
  });

  it("stays on the form when the sign-up fails", async () => {
    api.apiFetch.mockRejectedValueOnce(new Error("nope"));
    const messages = getMessages("en");
    render(<AuthPanel locale="en" messages={messages} mode="register" />);
    fillIn(messages);
    fireEvent.click(screen.getByRole("button", { name: messages.auth.register }));
    await screen.findByRole("alert");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("keeps sending a sign-in to the dashboard", async () => {
    const messages = getMessages("en");
    render(<AuthPanel locale="en" messages={messages} mode="login" />);
    fireEvent.change(screen.getByLabelText(messages.auth.email, { exact: false }), { target: { value: "sara@example.com" } });
    fireEvent.change(screen.getByLabelText(messages.auth.password, { exact: false }), { target: { value: "Password1abc" } });
    fireEvent.click(screen.getByRole("button", { name: messages.auth.signIn }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/en/dashboard"));
  });
});
