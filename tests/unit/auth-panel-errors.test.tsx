import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api/client")>()), apiFetch: api.apiFetch }));
vi.mock("@/lib/demo", () => ({ DEMO_MODE: false }));

import { AuthPanel } from "@/features/auth/auth-panel";
import { ApiClientError } from "@/lib/api/client";

const fa = getMessages("fa");
const en = getMessages("en");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value } });
}

async function submitRegister(messages = fa) {
  fill(messages.auth.name, "Sara Trader");
  fill(messages.auth.email, "sara@example.com");
  fill(messages.auth.password, "Password1abc");
  fireEvent.click(screen.getByRole("button", { name: messages.auth.register }));
}

function submitLogin(messages = fa) {
  fill(messages.auth.email, "sara@example.com");
  fill(messages.auth.password, "whatever-password");
  fireEvent.click(screen.getByRole("button", { name: messages.auth.signIn }));
}

// A tester who picked a normal 8-character password saw only "Request validation failed" in English on the Persian page.
describe("AuthPanel register form states the password rules up front", () => {
  it("shows the rules under the password field and requires the fields", () => {
    render(<AuthPanel locale="fa" messages={fa} mode="register" />);
    const password = screen.getByLabelText(fa.auth.password, { exact: false });
    expect(screen.getByText(fa.auth.passwordHint)).toBeInTheDocument();
    expect(password).toBeRequired();
    expect(password).toHaveAttribute("minlength", "12");
    expect(password.getAttribute("aria-describedby")).toBe(screen.getByText(fa.auth.passwordHint).id);
    expect(screen.getByLabelText(fa.auth.name, { exact: false })).toBeRequired();
    expect(screen.getByLabelText(fa.auth.name, { exact: false })).toHaveAttribute("minlength", "2");
    expect(screen.getByLabelText(fa.auth.email, { exact: false })).toBeRequired();
  });

  it("does not lecture on password rules when signing in", () => {
    render(<AuthPanel locale="en" messages={en} mode="login" />);
    expect(screen.queryByText(en.auth.passwordHint)).toBeNull();
    const password = screen.getByLabelText(en.auth.password, { exact: false });
    expect(password).toBeRequired();
    expect(password).not.toHaveAttribute("minlength");
  });

  it("says the invite code is required when registration needs one, and optional otherwise", () => {
    const { unmount } = render(<AuthPanel locale="fa" messages={fa} mode="register" inviteRequired />);
    const required = screen.getByLabelText(fa.auth.inviteCodeRequired, { exact: false });
    expect(required).toBeRequired();
    unmount();

    render(<AuthPanel locale="fa" messages={fa} mode="register" />);
    const optional = screen.getByLabelText(fa.auth.inviteCode, { exact: false });
    expect(optional).not.toBeRequired();
    expect(screen.queryByLabelText(fa.auth.inviteCodeRequired, { exact: false })).toBeNull();
  });
});

// The account's saved language must match the page the person signed up in.
describe("AuthPanel sends the UI language with the sign-up request", () => {
  it.each([
    ["fa", fa],
    ["en", en]
  ] as const)("%s page: register body carries locale", async (locale, messages) => {
    api.apiFetch.mockResolvedValueOnce({});
    render(<AuthPanel locale={locale} messages={messages} mode="register" />);
    await submitRegister(messages);
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalled());
    const body = JSON.parse((api.apiFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ email: "sara@example.com", locale });
  });

  it("does not add a locale to the sign-in request (the strict login schema would refuse it)", async () => {
    api.apiFetch.mockResolvedValueOnce({});
    render(<AuthPanel locale="fa" messages={fa} mode="login" />);
    submitLogin();
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalled());
    const body = JSON.parse((api.apiFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body).not.toHaveProperty("locale");
  });
});

describe("AuthPanel shows localized messages for API error codes", () => {
  it("names the password rules when the server rejects the password", async () => {
    api.apiFetch.mockRejectedValueOnce(
      new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { formErrors: [], fieldErrors: { password: ["Too small"] } })
    );
    render(<AuthPanel locale="fa" messages={fa} mode="register" />);
    await submitRegister();
    expect(await screen.findByRole("alert")).toHaveTextContent(fa.auth.errors.VALIDATION_password);
    expect(screen.queryByText(/Request validation failed/)).toBeNull();
  });

  it("names the email and name fields when those are the invalid ones", async () => {
    api.apiFetch.mockRejectedValueOnce(
      new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { formErrors: [], fieldErrors: { email: ["Invalid email address"] } })
    );
    render(<AuthPanel locale="en" messages={en} mode="register" />);
    await submitRegister(en);
    expect(await screen.findByRole("alert")).toHaveTextContent(en.auth.errors.VALIDATION_email);
  });

  it.each([
    ["register", "EMAIL_ALREADY_EXISTS", 409, "An account with this email already exists"],
    ["register", "INVITE_REQUIRED", 403, "A valid invite code is needed to sign up during the trial"],
    ["register", "REGISTRATION_CLOSED", 403, "Sign-up is closed"],
    ["register", "RATE_LIMITED", 429, "Too many requests. Please try again later."],
    ["login", "INVALID_CREDENTIALS", 401, "Invalid email or password"],
    ["login", "RATE_LIMITED", 429, "Too many requests. Please try again later."]
  ] as const)("%s: %s becomes a Persian message, not the server's English text", async (mode, code, status, serverText) => {
    api.apiFetch.mockRejectedValueOnce(new ApiClientError(serverText, status, code));
    render(<AuthPanel locale="fa" messages={fa} mode={mode} />);
    if (mode === "register") await submitRegister();
    else submitLogin();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(fa.auth.errors[code]);
    expect(alert).not.toHaveTextContent(serverText);
  });

  it("uses the English strings on the English page", async () => {
    api.apiFetch.mockRejectedValueOnce(new ApiClientError("Invalid email or password", 401, "INVALID_CREDENTIALS"));
    render(<AuthPanel locale="en" messages={en} mode="login" />);
    submitLogin(en);
    expect(await screen.findByRole("alert")).toHaveTextContent(en.auth.errors.INVALID_CREDENTIALS);
  });

  it("falls back to a generic localized line for unknown codes and dropped connections", async () => {
    api.apiFetch.mockRejectedValueOnce(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    render(<AuthPanel locale="fa" messages={fa} mode="login" />);
    submitLogin();
    expect(await screen.findByRole("alert")).toHaveTextContent(fa.auth.errors.GENERIC);
    expect(screen.queryByText(/Unexpected server error/)).toBeNull();

    api.apiFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(screen.getByRole("button", { name: fa.auth.signIn }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(fa.auth.errors.NETWORK));
  });

  it("asks for the authenticator code when two-factor is on, then sends it", async () => {
    api.apiFetch.mockRejectedValueOnce(new ApiClientError("A valid two-factor authentication code is required", 401, "TWO_FACTOR_REQUIRED"));
    render(<AuthPanel locale="fa" messages={fa} mode="login" />);
    submitLogin();
    expect(await screen.findByRole("alert")).toHaveTextContent(fa.auth.errors.TWO_FACTOR_REQUIRED);

    api.apiFetch.mockResolvedValueOnce({});
    fill(fa.auth.totpCode, "123456");
    fireEvent.click(screen.getByRole("button", { name: fa.auth.signIn }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/fa/dashboard"));
    const body = JSON.parse((api.apiFetch.mock.calls[1][1] as RequestInit).body as string);
    expect(body).toMatchObject({ email: "sara@example.com", totpCode: "123456" });
  });
});
