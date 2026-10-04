import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiFetch: api.apiFetch
}));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  }
}));

import RequestAccessPage from "@/app/[locale]/request-access/page";
import { RequestAccessScreen } from "@/features/access/request-access-screen";
import { getMessages } from "@/lib/i18n/messages";

beforeEach(() => {
  api.apiFetch.mockResolvedValue({ received: true });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const hrefs = () => screen.queryAllByRole("link").map((link) => link.getAttribute("href"));
const page = () => document.body.textContent ?? "";

async function sendRequest(locale: "en" | "fa") {
  const label = locale === "en" ? { name: "Name", email: "Email", submit: "Request access" } : { name: "نام", email: "ایمیل", submit: "ثبت درخواست" };
  fireEvent.change(screen.getByLabelText(label.name), { target: { value: "Sara" } });
  fireEvent.change(screen.getByLabelText(label.email), { target: { value: "sara@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: label.submit }));
  await waitFor(() => expect(api.apiFetch).toHaveBeenCalled());
}

// The owner's server: what the page said before the sign-up mode existed must stay word for word.
describe("the request-access page in the invite mode (the owner's server)", () => {
  it.each([undefined, "invite"] as const)("keeps today's English text (%s)", async (mode) => {
    render(<RequestAccessScreen locale="en" registration={mode} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Request access");
    expect(page()).toContain("Nazm is in a private trial and accounts are created with an invite code. Leave a request here; if a place opens, we will send the invite code to your email.");
    expect(screen.getByRole("link", { name: "Have an invite code? Create an account" }).getAttribute("href")).toBe("/en/register");

    await sendRequest("en");
    expect(await screen.findByText("If a place opens, we will send the invite code to this address:")).toBeInTheDocument();
  });

  it.each([undefined, "invite"] as const)("keeps today's Persian text (%s)", async (mode) => {
    render(<RequestAccessScreen locale="fa" registration={mode} />);
    expect(page()).toContain("اپ نظم فعلاً در مرحله‌ی آزمایشی خصوصی است و حساب‌ها فقط با کد دعوت ساخته می‌شوند. درخواست‌تان را اینجا ثبت کنید؛ اگر جایی باز شد، کد دعوت را به ایمیل‌تان می‌فرستیم.");
    expect(screen.getByRole("link", { name: "کد دعوت دارید؟ ساخت حساب" }).getAttribute("href")).toBe("/fa/register");

    await sendRequest("fa");
    expect(await screen.findByText("اگر جایی باز شود، کد دعوت را به این ایمیل می‌فرستیم:")).toBeInTheDocument();
  });
});

describe.each([
  { locale: "en", title: "Sign-up is open", open: /sign-up is open/i, create: "Create account", words: /invite|trial|beta/i },
  { locale: "fa", title: "ثبت‌نام باز است", open: /ثبت‌نام باز است/, create: "ساخت حساب", words: /دعوت|آزمایشی|بتا/ }
] as const)("the request-access page in the open mode ($locale)", ({ locale, title, open, create, words }) => {
  it("says sign-up is open and links to the sign-up page and to sign-in", () => {
    render(<RequestAccessScreen locale={locale} registration="open" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title);
    expect(page()).toMatch(open);
    expect(screen.getByRole("link", { name: create }).getAttribute("href")).toBe(`/${locale}/register`);
    expect(hrefs()).toContain(`/${locale}/login`);
  });

  it("does not promise an invite code, and has no request form to fill in", () => {
    render(<RequestAccessScreen locale={locale} registration="open" />);
    expect(page()).not.toMatch(words);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(api.apiFetch).not.toHaveBeenCalled();
  });
});

describe.each([
  { locale: "en", administrator: "administrator", words: /invite|trial|beta|have an invite code/i, answered: "The administrator of this server will answer at this address:" },
  { locale: "fa", administrator: "مدیر", words: /کد دعوت|آزمایشی|بتا/, answered: "مدیر این سرور به این ایمیل پاسخ می‌دهد:" }
] as const)("the request-access page in the closed mode ($locale)", ({ locale, administrator, words, answered }) => {
  it("says the administrator answers requests and keeps the form", () => {
    render(<RequestAccessScreen locale={locale} registration="closed" />);
    expect(page()).toContain(administrator);
    expect(screen.getByRole("textbox", { name: locale === "en" ? "Name" : "نام" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: locale === "en" ? "Request access" : "ثبت درخواست" })).toBeInTheDocument();
  });

  it("promises no invite code, before or after the request is sent, and has no sign-up link", async () => {
    render(<RequestAccessScreen locale={locale} registration="closed" />);
    expect(page()).not.toMatch(words);
    expect(hrefs()).not.toContain(`/${locale}/register`);
    expect(hrefs()).toContain(`/${locale}/login`);

    await sendRequest(locale);
    expect(await screen.findByText(answered)).toBeInTheDocument();
    expect(page()).not.toMatch(words);
    expect(hrefs()).not.toContain(`/${locale}/register`);
  });
});

describe("the request-access page reads the mode from the server", () => {
  const props = async () => ((await RequestAccessPage({ params: Promise.resolve({ locale: "en" }) })) as ReactElement<{ registration: string }>).props.registration;

  it("passes invite, open or closed to the screen, from the environment of the request", async () => {
    session.getCurrentUser.mockResolvedValue(null);
    vi.stubEnv("NODE_ENV", "production");

    vi.stubEnv("REGISTRATION_INVITE_CODE", "trial-2026");
    expect(await props()).toBe("invite");

    vi.stubEnv("REGISTRATION_INVITE_CODE", "");
    expect(await props()).toBe("closed");

    vi.stubEnv("REGISTRATION_OPEN", "true");
    expect(await props()).toBe("open");
  });
});

describe("the message files' sign-up wording", () => {
  const messages = { en: getMessages("en"), fa: getMessages("fa") };

  it("does not tie the invite code field to a trial", () => {
    expect(messages.en.auth.inviteCodeRequired).toBe("Invite code (required on this server)");
    expect(messages.fa.auth.inviteCodeRequired).toBe("کد دعوت (در این سرور الزامی است)");
  });

  // No admin screen, e-mail or page resets a password in this code, so the line promises nothing it cannot do: it says
  // there is no reset by email and who to contact, not "the administrator will reset it".
  it("sends a person who forgot the password to the administrator of this server, not to whoever invited them", () => {
    expect(messages.en.auth.forgotPassword).toBe("Forgot your password? There is no reset by email on this server; contact its administrator.");
    expect(messages.en.auth.forgotPassword).not.toMatch(/invited/i);
    expect(messages.fa.auth.forgotPassword).toBe("رمز عبور را فراموش کرده‌اید؟ بازنشانی با ایمیل در این سرور وجود ندارد؛ با مدیر سرور تماس بگیرید.");
    expect(messages.fa.auth.forgotPassword).not.toContain("دعوت");
    expect(messages.fa.auth.forgotPassword).toMatch(/^[^A-Za-z]+$/);
  });

  it("names the demo page without Conference, in the menu and as the page title", () => {
    expect(messages.en.nav.demo).toBe("Demo walkthrough");
    // One Persian name for the screen: the demo screen itself (another lane) is titled «راهنمای نمایشی» too.
    expect(messages.fa.nav.demo).toBe("راهنمای نمایشی");
    expect(messages.fa.pages.demo).toBe("راهنمای نمایشی");
    expect(messages.en.pages.demo).not.toMatch(/conference/i);
    expect(messages.fa.pages.demo).not.toContain("کنفرانس");
  });
});
