import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/demo", () => ({ DEMO_MODE: false }));

import { LandingScreen } from "@/features/landing/landing-screen";
import type { RegistrationMode } from "@/lib/auth/registration";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const hrefs = (root: ParentNode) => [...root.querySelectorAll("a")].map((a) => a.getAttribute("href"));
const labels = (root: ParentNode) => [...root.querySelectorAll("a")].map((a) => (a.textContent ?? "").trim());
const access = () => document.getElementById("access") as HTMLElement;
const hero = (container: HTMLElement) => container.querySelector("#product") as HTMLElement;

function renderLanding(locale: "en" | "fa", registration?: RegistrationMode, extra: { freeTrial?: boolean; signedIn?: boolean } = {}) {
  return render(<LandingScreen locale={locale} registration={registration} {...extra} />);
}

// What a visitor sees on the owner's invite-only server must not change: these strings are the pinned wording
// (the owner's build takes nothing, so the page is told the trial is free).
describe("the landing in the invite mode (the owner's server)", () => {
  it("keeps today's English wording, buttons and trial line", () => {
    const { container } = renderLanding("en", "invite", { freeTrial: true });
    expect(labels(hero(container))).toEqual(["Sign up with an invite code", "Request access"]);
    expect(hrefs(hero(container))).toEqual(["/en/register", "/en/request-access"]);
    expect(hero(container).textContent).toContain("Private beta. Free during the trial.");
    expect(access().textContent).toBe(
      [
        "Access",
        "Nazm is in private beta and free during the trial. Sign-up needs an invite code.",
        "I have an invite code",
        "Create your account with the code and import your trades today.",
        "Sign up with an invite code",
        "I don't have a code",
        "Send a request. If a place opens, the invite code is sent to your email.",
        "Request access",
        "Already have an account? Sign in"
      ].join("")
    );
    expect(hrefs(access())).toEqual(["/en/register", "/en/request-access", "/en/login"]);
  });

  it("keeps today's Persian wording, buttons and trial line", () => {
    const { container } = renderLanding("fa", "invite", { freeTrial: true });
    expect(labels(hero(container))).toEqual(["ثبت‌نام با کد دعوت", "درخواست دسترسی"]);
    expect(hrefs(hero(container))).toEqual(["/fa/register", "/fa/request-access"]);
    expect(hero(container).textContent).toContain("بتای خصوصی. در دورهٔ آزمایشی رایگان است.");
    expect(access().textContent).toBe(
      [
        "دسترسی",
        "اپ نظم در بتای خصوصی است و در دورهٔ آزمایشی رایگان است. ثبت‌نام فقط با کد دعوت انجام می‌شود.",
        "کد دعوت دارم",
        "با کد دعوت حساب بسازید و از همین امروز معاملات خود را وارد کنید.",
        "ثبت‌نام با کد دعوت",
        "کد دعوت ندارم",
        "درخواست بدهید. اگر جا باز شود، کد دعوت به ایمیل شما فرستاده می‌شود.",
        "درخواست دسترسی",
        "حساب دارید؟ ورود"
      ].join("")
    );
  });

  it("is the mode a landing renders when it is told nothing", () => {
    const { container } = renderLanding("en");
    expect(labels(hero(container))).toEqual(["Sign up with an invite code", "Request access"]);
    expect(hero(container).textContent).toContain("Private beta.");
  });

  // "Free during the trial" is a statement about what is charged: it is only said when the page was told the trial is free.
  it("says free during the trial only when told so, and keeps the private beta either way", () => {
    for (const locale of ["en", "fa"] as const) {
      const { container, unmount } = renderLanding(locale, "invite", { freeTrial: false });
      expect(container.textContent).not.toMatch(/Free during the trial|in the trial|رایگان/);
      expect(access().textContent).toContain(locale === "en" ? "Nazm is in private beta. Sign-up needs an invite code." : "اپ نظم در بتای خصوصی است. ثبت‌نام فقط با کد دعوت انجام می‌شود.");
      expect(hero(container).textContent).toContain(locale === "en" ? "Private beta." : "بتای خصوصی.");
      unmount();
    }
  });
});

describe.each([
  { locale: "en", create: "Create account", signIn: "Sign in", words: /private beta|beta|trial|invite|request access|access request/i },
  { locale: "fa", create: "ساخت حساب", signIn: "ورود", words: /بتا|آزمایش|دعوت|درخواست/ }
] as const)("the landing in the open mode ($locale)", ({ locale, create, signIn, words }) => {
  it("offers plain Create account and Sign in as the calls to action", () => {
    const { container } = renderLanding(locale, "open");
    expect(labels(hero(container))).toEqual([create, signIn]);
    expect(hrefs(hero(container))).toEqual([`/${locale}/register`, `/${locale}/login`]);
    expect(screen.getAllByRole("link", { name: create })[0].getAttribute("href")).toBe(`/${locale}/register`);
  });

  it("has no invite, beta, trial or request-access wording and no link to the request page, whatever the trial flag says", () => {
    for (const freeTrial of [true, false]) {
      const { container, unmount } = renderLanding(locale, "open", { freeTrial });
      expect(container.textContent ?? "").not.toMatch(words);
      expect(hrefs(container)).not.toContain(`/${locale}/request-access`);
      unmount();
    }
  });

  it("keeps an #access section for the menu's Start and Access links, with the same two ways in", () => {
    const { container } = renderLanding(locale, "open");
    expect(access()).not.toBeNull();
    expect(hrefs(access())).toEqual([`/${locale}/register`, `/${locale}/login`]);
    expect(container.querySelectorAll("#access h2")).toHaveLength(1);
  });

  it("says that sign-up is open on this server", () => {
    renderLanding(locale, "open");
    expect(access().textContent).toContain(locale === "en" ? "Sign-up is open on this server." : "ثبت‌نام در این سرور باز است.");
  });
});

describe.each([
  { locale: "en", administrator: "administrator", words: /beta|trial|invite code|free/i },
  { locale: "fa", administrator: "مدیر", words: /بتا|آزمایش|کد دعوت|رایگان/ }
] as const)("the landing in the closed mode ($locale)", ({ locale, administrator, words }) => {
  it("says the administrator creates the accounts, keeps Request access and has no sign-up button", () => {
    const { container } = renderLanding(locale, "closed");
    expect(hero(container).textContent).toContain(administrator);
    expect(hrefs(hero(container))).toEqual([`/${locale}/request-access`, `/${locale}/login`]);
    expect(hrefs(container)).not.toContain(`/${locale}/register`);
    expect(access().textContent).toContain(administrator);
    expect(hrefs(access())).toEqual([`/${locale}/request-access`, `/${locale}/login`]);
  });

  it("has no private-beta, trial, invite-code or free wording, whatever the trial flag says", () => {
    for (const freeTrial of [true, false]) {
      const { container, unmount } = renderLanding(locale, "closed", { freeTrial });
      expect(container.textContent ?? "").not.toMatch(words);
      unmount();
    }
  });
});

describe("the landing for a signed-in visitor, in every mode", () => {
  it.each(["invite", "open", "closed"] as const)("shows the workspace button and nothing about sign-up (%s)", (mode) => {
    const { container } = renderLanding("en", mode, { signedIn: true });
    expect(hrefs(container)).toContain("/en/dashboard");
    expect(hrefs(container)).not.toContain("/en/register");
    expect(hrefs(container)).not.toContain("/en/request-access");
    expect(document.getElementById("access")).toBeNull();
  });
});

describe("the landing page itself", () => {
  async function renderPage(locale: "en" | "fa" = "en") {
    vi.resetModules();
    vi.doMock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => null) }));
    const { default: Page } = await import("@/app/[locale]/page");
    return render(await Page({ params: Promise.resolve({ locale }) }));
  }

  afterEach(() => vi.doUnmock("@/lib/auth/session"));

  it("asks the server for the sign-up mode on every request", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REGISTRATION_INVITE_CODE", "");
    vi.stubEnv("REGISTRATION_OPEN", "true");
    const open = await renderPage();
    expect(hrefs(hero(open.container))).toEqual(["/en/register", "/en/login"]);
    cleanup();

    vi.stubEnv("REGISTRATION_OPEN", "");
    const closed = await renderPage();
    expect(hrefs(hero(closed.container))).toEqual(["/en/request-access", "/en/login"]);
    cleanup();

    vi.stubEnv("REGISTRATION_INVITE_CODE", "trial-2026");
    const invite = await renderPage();
    expect(labels(hero(invite.container))).toEqual(["Sign up with an invite code", "Request access"]);
    // Only the mode reaches the page: the code itself is nowhere in the markup.
    expect(invite.container.innerHTML).not.toContain("trial-2026");
  });

  it("says the trial is free only on a build that takes nothing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REGISTRATION_INVITE_CODE", "trial-2026");

    vi.stubEnv("NEXT_PUBLIC_PAYMENTS_ENABLED", "");
    expect((await renderPage()).container.textContent).toContain("Private beta. Free during the trial.");
    cleanup();

    vi.stubEnv("NEXT_PUBLIC_PAYMENTS_ENABLED", "true");
    const charged = await renderPage();
    expect(charged.container.textContent).toContain("Private beta.");
    expect(charged.container.textContent).not.toContain("Free during the trial");
  });

  it("is dynamic, so the mode is read when the page is asked for, not when it was built", async () => {
    vi.resetModules();
    const page = await import("@/app/[locale]/page");
    expect(page.dynamic).toBe("force-dynamic");
  });
});
