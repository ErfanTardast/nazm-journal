import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { getMessages } from "@/lib/i18n/messages";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const nav = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useRouter: () => router
}));
vi.mock("next/navigation", () => nav);
const api = vi.hoisted(() => ({ apiFetch: vi.fn(async () => ({})) }));
vi.mock("@/lib/api/client", () => api);
vi.mock("@/lib/demo", () => ({ DEMO_MODE: false }));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn(async () => null) }));
vi.mock("@/lib/auth/session", () => session);

import { AuthPanel } from "@/features/auth/auth-panel";
import LoginPage from "@/app/[locale]/login/page";
import RegisterPage from "@/app/[locale]/register/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const closedNote = {
  en: "Accounts on this server are created by its administrator.",
  fa: "حساب‌های این سرور را مدیر آن می‌سازد."
} as const;
const requestAccess = { en: "Request access", fa: "درخواست دسترسی" } as const;
const noCode = { en: "No code?", fa: "کد دعوت ندارید؟" } as const;
const inviteWords = { en: /invite|code/i, fa: /دعوت|کد/ } as const;

const locales = ["en", "fa"] as const;

// The stranger test: on the README's Docker stack sign-up is open, yet the form asked for an invite code and sent the
// visitor to a request-access page that said sign-up was open. In a closed server every submit ended in an error.
describe.each(locales)("AuthPanel sign-up form follows the server's sign-up mode (%s)", (locale) => {
  const messages = getMessages(locale);
  const inviteLabels = [messages.auth.inviteCode, messages.auth.inviteCodeRequired];

  it("invite: shows the invite-code field and the way to ask for a code, as before", () => {
    render(<AuthPanel locale={locale} messages={messages} mode="register" registration="invite" inviteRequired />);

    expect(screen.getByLabelText(messages.auth.inviteCodeRequired)).toBeRequired();
    expect(screen.getByRole("link", { name: requestAccess[locale] }).getAttribute("href")).toBe(`/${locale}/request-access`);
    expect(screen.getByText(noCode[locale], { exact: false })).toBeInTheDocument();
  });

  it("invite is what the panel assumes when it is not told", () => {
    render(<AuthPanel locale={locale} messages={messages} mode="register" />);

    expect(screen.getByLabelText(messages.auth.inviteCode)).not.toBeRequired();
    expect(screen.getByRole("link", { name: requestAccess[locale] })).toBeInTheDocument();
  });

  it("open: no invite-code field, no 'No code?' line, no link to request access", () => {
    const { container } = render(<AuthPanel locale={locale} messages={messages} mode="register" registration="open" />);

    for (const label of inviteLabels) expect(screen.queryByLabelText(label)).toBeNull();
    expect(container.textContent).not.toContain(noCode[locale]);
    expect(container.querySelector('a[href$="/request-access"]')).toBeNull();
    expect(container.textContent).not.toMatch(inviteWords[locale]);
    // The rest of the form is whole: name, e-mail, password, the button, the terms and the way to sign in.
    expect(screen.getByLabelText(messages.auth.name, { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText(messages.auth.email, { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText(messages.auth.password, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.auth.register })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.auth.termsLink }).getAttribute("href")).toBe(`/${locale}/terms`);
    expect(screen.getByRole("link", { name: messages.auth.signIn }).getAttribute("href")).toBe(`/${locale}/login`);
  });

  it("open: signing up sends no invite code", async () => {
    render(<AuthPanel locale={locale} messages={messages} mode="register" registration="open" />);
    fireEvent.change(screen.getByLabelText(messages.auth.name, { exact: false }), { target: { value: "Sara Ahmadi" } });
    fireEvent.change(screen.getByLabelText(messages.auth.email, { exact: false }), { target: { value: "sara@example.com" } });
    fireEvent.change(screen.getByLabelText(messages.auth.password, { exact: false }), { target: { value: "Password1abcd" } });
    fireEvent.click(screen.getByRole("button", { name: messages.auth.register }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/${locale}/onboarding`));
    const [url, init] = api.apiFetch.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("/api/auth/register");
    expect(JSON.parse(init.body)).not.toHaveProperty("inviteCode");
  });

  it("closed: no form at all, the administrator note, and links to request access and to sign in", () => {
    const { container } = render(<AuthPanel locale={locale} messages={messages} mode="register" registration="closed" />);

    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(screen.getByText(closedNote[locale])).toBeInTheDocument();
    expect(screen.getByRole("link", { name: requestAccess[locale] }).getAttribute("href")).toBe(`/${locale}/request-access`);
    expect(screen.getByRole("link", { name: messages.auth.signIn }).getAttribute("href")).toBe(`/${locale}/login`);
    for (const label of inviteLabels) expect(container.textContent).not.toContain(label);
    expect(container.textContent).not.toContain(noCode[locale]);
  });
});

describe.each(locales)("AuthPanel sign-in form: the way to an account follows the sign-up mode (%s)", (locale) => {
  const messages = getMessages(locale);

  it.each(["invite", "open"] as const)("%s: 'No account yet?' leads to the sign-up form, keeping the return path", (registration) => {
    render(<AuthPanel locale={locale} messages={messages} mode="login" registration={registration} nextPath={`/${locale}/journal`} />);

    const link = screen.getByRole("link", { name: messages.auth.register });
    expect(link.getAttribute("href")).toBe(`/${locale}/register?next=${encodeURIComponent(`/${locale}/journal`)}`);
    expect(screen.getByText(messages.auth.noAccount, { exact: false })).toBeInTheDocument();
  });

  it("closed: 'No account yet?' leads to the request-access page, not to a form that can only fail", () => {
    const { container } = render(<AuthPanel locale={locale} messages={messages} mode="login" registration="closed" />);

    const paragraph = screen.getByText(messages.auth.noAccount, { exact: false }).closest("p") as HTMLElement;
    expect(within(paragraph).getByRole("link", { name: requestAccess[locale] }).getAttribute("href")).toBe(`/${locale}/request-access`);
    expect(container.querySelector('a[href*="/register"]')).toBeNull();
    expect(screen.queryByRole("link", { name: messages.auth.register })).toBeNull();
    // The sign-in form itself is unchanged.
    expect(screen.getByLabelText(messages.auth.email, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(messages.auth.forgotPassword)).toBeInTheDocument();
  });
});

describe("register and login pages hand the server's mode to the form", () => {
  const params = (locale: string) => Promise.resolve({ locale });
  const search = Promise.resolve({});
  const registrationOf = (page: unknown) => (page as ReactElement<{ registration?: string }>).props.registration;

  it.each([
    ["invite", { REGISTRATION_INVITE_CODE: "some-code", NODE_ENV: "production" }],
    ["open", { NODE_ENV: "production", REGISTRATION_OPEN: "true" }],
    ["closed", { NODE_ENV: "production" }]
  ] as const)("%s", async (mode, env) => {
    vi.stubEnv("REGISTRATION_INVITE_CODE", "");
    vi.stubEnv("REGISTRATION_OPEN", "");
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);

    const register = await RegisterPage({ params: params("fa"), searchParams: search });
    const login = await LoginPage({ params: params("en"), searchParams: search });
    expect(registrationOf(register)).toBe(mode);
    expect(registrationOf(login)).toBe(mode);
    // The invite code itself never goes to the browser.
    expect(JSON.stringify((register as ReactElement).props)).not.toContain("some-code");
  });

  it("a run outside production is open, as the register route treats it", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REGISTRATION_INVITE_CODE", "");
    vi.stubEnv("REGISTRATION_OPEN", "");

    expect(registrationOf(await RegisterPage({ params: params("en"), searchParams: search }))).toBe("open");
  });
});
