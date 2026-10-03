import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";

const nav = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  })
}));
vi.mock("next/navigation", () => nav);
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/demo", () => ({ DEMO_MODE: false }));

import LoginPage from "@/app/[locale]/login/page";
import RegisterPage from "@/app/[locale]/register/page";
import LocaleIndex from "@/app/[locale]/page";
import { LandingScreen } from "@/features/landing/landing-screen";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const params = (locale: string) => Promise.resolve({ locale });
const search = (next?: string) => Promise.resolve(next === undefined ? {} : { next });
const user = { id: "u1", name: "Sara", email: "sara@example.com" };

// The owner registered, was signed in, and /login and /register still showed empty forms (2026-09-29).
describe("login and register pages for a signed-in user", () => {
  it.each([
    ["login", LoginPage],
    ["register", RegisterPage]
  ] as const)("%s redirects to the dashboard of the same language", async (_name, Page) => {
    session.getCurrentUser.mockResolvedValue(user);
    await expect(Page({ params: params("fa"), searchParams: search() })).rejects.toThrow("NEXT_REDIRECT:/fa/dashboard");
    await expect(Page({ params: params("en"), searchParams: search() })).rejects.toThrow("NEXT_REDIRECT:/en/dashboard");
  });

  it("shows the form to a visitor", async () => {
    session.getCurrentUser.mockResolvedValue(null);
    const login = (await LoginPage({ params: params("fa"), searchParams: search() })) as ReactElement<{ mode: string; locale: string }>;
    expect(login.props).toMatchObject({ mode: "login", locale: "fa" });
    const register = (await RegisterPage({ params: params("fa"), searchParams: search() })) as ReactElement<{ mode: string }>;
    expect(register.props.mode).toBe("register");
  });

  it("still 404s an unknown locale", async () => {
    await expect(LoginPage({ params: params("de"), searchParams: search() })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("register page and the invite code", () => {
  it("marks the invite code required while the trial has a code", async () => {
    session.getCurrentUser.mockResolvedValue(null);
    vi.stubEnv("REGISTRATION_INVITE_CODE", "some-code");
    const page = (await RegisterPage({ params: params("fa"), searchParams: search() })) as ReactElement<{ inviteRequired?: boolean }>;
    expect(page.props.inviteRequired).toBe(true);
    // The code itself must never reach the page props.
    expect(JSON.stringify(page.props)).not.toContain("some-code");
  });

  it("keeps it optional when sign-up needs no code", async () => {
    session.getCurrentUser.mockResolvedValue(null);
    vi.stubEnv("REGISTRATION_INVITE_CODE", "   ");
    const page = (await RegisterPage({ params: params("fa"), searchParams: search() })) as ReactElement<{ inviteRequired?: boolean }>;
    expect(page.props.inviteRequired).toBe(false);
  });
});

describe("landing page for a signed-in user", () => {
  it("tells the landing screen who is signed in", async () => {
    session.getCurrentUser.mockResolvedValue(user);
    const signedIn = (await LocaleIndex({ params: params("fa") })) as ReactElement<{ signedIn?: boolean }>;
    expect(signedIn.props.signedIn).toBe(true);

    session.getCurrentUser.mockResolvedValue(null);
    const visitor = (await LocaleIndex({ params: params("fa") })) as ReactElement<{ signedIn?: boolean }>;
    expect(visitor.props.signedIn).toBe(false);
  });

  it.each([
    ["fa", "باز کردن محیط کار"],
    ["en", "Open dashboard"]
  ] as const)("offers one %s Open dashboard button instead of sign-up and sign-in", (locale, label) => {
    const { container } = render(<LandingScreen locale={locale} signedIn />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(`/${locale}/dashboard`);
    expect(hrefs).not.toContain(`/${locale}/register`);
    expect(hrefs).not.toContain(`/${locale}/login`);
    expect(container.textContent).toContain(label);
  });
});

// /login?next=/fa/journal: an expired session or a deep link comes back to the page it wanted.
describe("return-to after sign-in", () => {
  it.each([
    ["login", LoginPage],
    ["register", RegisterPage]
  ] as const)("%s passes a safe next path to the form", async (_name, Page) => {
    session.getCurrentUser.mockResolvedValue(null);
    const page = (await Page({ params: params("fa"), searchParams: search("/fa/journal") })) as ReactElement<{ nextPath?: string }>;
    expect(page.props.nextPath).toBe("/fa/journal");
  });

  it.each(["https://evil.example/fa/journal", "//evil.example", "/en/journal", "/journal", "/fa/login"])("ignores next=%s", async (next) => {
    session.getCurrentUser.mockResolvedValue(null);
    const page = (await LoginPage({ params: params("fa"), searchParams: search(next) })) as ReactElement<{ nextPath?: string }>;
    expect(page.props.nextPath).toBeUndefined();
  });

  it("sends a signed-in visitor straight to the page they asked for", async () => {
    session.getCurrentUser.mockResolvedValue(user);
    await expect(LoginPage({ params: params("fa"), searchParams: search("/fa/journal") })).rejects.toThrow("NEXT_REDIRECT:/fa/journal");
    await expect(LoginPage({ params: params("fa"), searchParams: search("https://evil.example") })).rejects.toThrow("NEXT_REDIRECT:/fa/dashboard");
  });
});
