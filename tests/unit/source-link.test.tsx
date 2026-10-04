import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

const nav = vi.hoisted(() => ({ path: "/fa" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(async () => ({})) }));
vi.mock("@/lib/demo", () => ({ DEMO_MODE: false, demoModeEnabled: () => false }));

import { AppShell } from "@/components/layout/app-shell";
import { DEFAULT_SOURCE_URL, sourceUrl } from "@/lib/brand";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  nav.path = "/fa";
});

const REPOSITORY = "https://github.com/ErfanTardast/nazm-journal";
const member = { name: "Sara Sample", email: "sara@example.com" };

// AGPL section 13: people who use a hosted copy must be able to get its source.
describe("sourceUrl", () => {
  it("is the public repository by default", () => {
    expect(DEFAULT_SOURCE_URL).toBe(REPOSITORY);
    expect(sourceUrl({})).toBe(REPOSITORY);
    expect(sourceUrl({ NEXT_PUBLIC_SOURCE_URL: undefined })).toBe(REPOSITORY);
  });

  it("takes an operator's https address from NEXT_PUBLIC_SOURCE_URL, trimmed", () => {
    expect(sourceUrl({ NEXT_PUBLIC_SOURCE_URL: "https://git.example.org/team/nazm-fork" })).toBe("https://git.example.org/team/nazm-fork");
    expect(sourceUrl({ NEXT_PUBLIC_SOURCE_URL: "  https://git.example.org/team/nazm-fork \n" })).toBe("https://git.example.org/team/nazm-fork");
    expect(sourceUrl({ NEXT_PUBLIC_SOURCE_URL: "https://codeberg.org/someone/nazm?tab=readme#start" })).toBe("https://codeberg.org/someone/nazm?tab=readme#start");
  });

  it.each([
    "http://git.example.org/nazm",
    "javascript:alert(1)",
    "data:text/html,<p>x</p>",
    "ftp://git.example.org/nazm",
    "//git.example.org/nazm",
    "git.example.org/nazm",
    "https://",
    "https:///nazm",
    "https://git.example .org/nazm",
    "https://user:secret@git.example.org/nazm",
    "",
    "   "
  ])("ignores an override that is not a plain https address: %j", (value) => {
    expect(sourceUrl({ NEXT_PUBLIC_SOURCE_URL: value })).toBe(REPOSITORY);
  });

  it("reads process.env at call time when no environment is passed", () => {
    vi.stubEnv("NEXT_PUBLIC_SOURCE_URL", "https://git.example.org/nazm");
    expect(sourceUrl()).toBe("https://git.example.org/nazm");
    vi.stubEnv("NEXT_PUBLIC_SOURCE_URL", "not an address");
    expect(sourceUrl()).toBe(REPOSITORY);
  });
});

const locales = [
  { locale: "fa", label: "کد منبع" },
  { locale: "en", label: "Source code" }
] as const;

function expectSafeNewTab(link: HTMLElement, href: string) {
  expect(link.getAttribute("href")).toBe(href);
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
}

describe.each(locales)("the source-code link for a visitor ($locale)", ({ locale, label }) => {
  const visitor = (url?: string) => (
    <AppShell locale={locale} messages={getMessages(locale)} canAccessAdmin={false} user={null} sourceUrl={url}>
      <p>page</p>
    </AppShell>
  );

  it("is in the public footer, opens in a new tab and points at the public repository", () => {
    nav.path = `/${locale}`;
    render(visitor());
    const footer = screen.getByRole("contentinfo");
    expect(getMessages(locale).nav.sourceCode).toBe(label);
    expectSafeNewTab(within(footer).getByRole("link", { name: label }), REPOSITORY);
    expect(screen.getAllByRole("link", { name: label })).toHaveLength(1);
  });

  it("uses the operator's address when the layout passes one", () => {
    nav.path = `/${locale}`;
    render(visitor("https://git.example.org/team/nazm-fork"));
    expectSafeNewTab(screen.getByRole("link", { name: label }), "https://git.example.org/team/nazm-fork");
  });

  it("keeps the legal links where they were", () => {
    nav.path = `/${locale}`;
    render(visitor());
    const hrefs = within(screen.getByRole("contentinfo")).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining([`/${locale}/terms`, `/${locale}/privacy`]));
  });
});

describe.each(locales)("the source-code link for a signed-in user ($locale)", ({ locale, label }) => {
  const signedIn = (url?: string) => (
    <AppShell locale={locale} messages={getMessages(locale)} canAccessAdmin={false} user={member} sourceUrl={url}>
      <p>page</p>
    </AppShell>
  );

  it("is in the sidebar and in the phone's More menu, opening in a new tab", () => {
    nav.path = `/${locale}/journal`;
    render(signedIn());
    const sidebar = document.querySelector("aside") as HTMLElement;
    expectSafeNewTab(within(sidebar).getByRole("link", { name: label }), REPOSITORY);
    const more = document.querySelector(`summary[aria-label="${getMessages(locale).nav.more}"]`)?.closest("details") as HTMLElement;
    expectSafeNewTab(within(more).getByRole("link", { name: label }), REPOSITORY);
    expect(screen.getAllByRole("link", { name: label })).toHaveLength(2);
  });

  it("uses the operator's address when the layout passes one", () => {
    nav.path = `/${locale}/journal`;
    render(signedIn("https://git.example.org/team/nazm-fork"));
    for (const link of screen.getAllByRole("link", { name: label })) expectSafeNewTab(link, "https://git.example.org/team/nazm-fork");
  });

  it("is not a workspace page, so it never shows as the current page", () => {
    nav.path = `/${locale}/journal`;
    render(signedIn());
    for (const link of screen.getAllByRole("link", { name: label })) expect(link.getAttribute("aria-current")).toBeNull();
  });
});
