import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

const nav = vi.hoisted(() => ({ path: "/fa" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(async () => ({})) }));
// The landing shows its #access section only outside demo mode, so the public menu must follow the same flag.
const demo = vi.hoisted(() => {
  const state = { DEMO_MODE: false, demoModeEnabled: () => state.DEMO_MODE };
  return state;
});
vi.mock("@/lib/demo", () => demo);

import { AppShell } from "@/components/layout/app-shell";

const fa = getMessages("fa");
const en = getMessages("en");
const member = { name: "سارا نمونه", email: "sara@example.com" };

afterEach(() => {
  cleanup();
  nav.path = "/fa";
  demo.DEMO_MODE = false;
});

const hrefs = () => screen.getAllByRole("link").map((link) => link.getAttribute("href"));

const locales = [
  { locale: "fa", messages: fa },
  { locale: "en", messages: en }
] as const;

// Product audit (2026-10-01): the public site showed the whole in-app menu to visitors, and the in-app menu was one
// flat list hidden behind "More".
describe.each(locales)("AppShell for a visitor ($locale)", ({ locale, messages }) => {
  const visitor = () => (
    <AppShell locale={locale} messages={messages} canAccessAdmin={false} user={null}>
      <p>page</p>
    </AppShell>
  );

  it("shows a short public menu instead of the in-app navigation", () => {
    nav.path = `/${locale}`;
    render(visitor());
    const publicNav = screen.getByRole("navigation", { name: messages.nav.primary });
    expect(within(publicNav).getByRole("link", { name: messages.nav.public.how }).getAttribute("href")).toBe(`/${locale}#how`);
    expect(within(publicNav).getByRole("link", { name: messages.nav.public.features }).getAttribute("href")).toBe(`/${locale}#features`);
    expect(within(publicNav).getByRole("link", { name: messages.nav.public.access }).getAttribute("href")).toBe(`/${locale}#access`);
    for (const page of ["dashboard", "journal", "plans", "reviews", "settings", "import"]) {
      expect(hrefs()).not.toContain(`/${locale}/${page}`);
    }
  });

  it("offers sign-in and a start button that explains access first", () => {
    nav.path = `/${locale}`;
    render(visitor());
    expect(screen.getByRole("link", { name: messages.auth.signIn }).getAttribute("href")).toBe(`/${locale}/login`);
    // Sign-up needs an invite code, so "Start" goes to the access section, never straight into a blocked form.
    expect(screen.getByRole("link", { name: messages.nav.public.start }).getAttribute("href")).toBe(`/${locale}#access`);
  });

  // Measured in a browser with the real header (the three buttons beside the name, 2026-10-03): the English name is 44px
  // wide and fits without an ellipsis from 340px up (it was cut to 38px at 320px); the Persian name is 26px and fits
  // at 320px. The page never scrolled sideways. So the name shows on the common phones (360, 375, 390, 412px), and the
  // rule hides it only on the narrowest screens, with 10px to spare for a platform face that is a little wider.
  it("hides the brand name only below the widths where it can fit, and keeps it for screen readers", () => {
    render(visitor());
    const header = document.querySelector("header") as HTMLElement;
    const name = within(header).getByText(locale === "fa" ? "نظم" : "Nazm");
    const hidden = name.className.match(/max-\[(\d+)px\]:sr-only/);
    expect(hidden, "the name needs a max-[Npx]:sr-only rule").not.toBeNull();
    const threshold = Number(hidden?.[1]);
    expect(threshold).toBeGreaterThanOrEqual(350);
    expect(threshold).toBeLessThan(360);
    // Where it is shown and the room runs out, it ends in an ellipsis instead of pushing the buttons off the screen.
    expect(name.className).toContain("truncate");
    // sr-only keeps it in the accessibility tree: the home link stays named.
    expect(within(header).getByRole("link", { name: locale === "fa" ? /نظم/ : /Nazm/ }).getAttribute("href")).toBe(`/${locale}`);
  });

  it("links the legal pages in the footer", () => {
    nav.path = `/${locale}`;
    render(visitor());
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(
      expect.arrayContaining([`/${locale}/terms`, `/${locale}/privacy`])
    );
  });

  // Audit round 3: in a demo build the landing has no #access section, so Start and Access were dead links.
  it("in demo mode sends Start to the demo and leaves the Access link out", () => {
    demo.DEMO_MODE = true;
    nav.path = `/${locale}`;
    render(visitor());
    expect(screen.getByRole("link", { name: messages.nav.public.start }).getAttribute("href")).toBe(`/${locale}/demo`);
    expect(screen.queryByRole("link", { name: messages.nav.public.access })).toBeNull();
    expect(hrefs()).not.toContain(`/${locale}#access`);
    // The other section links are unchanged.
    expect(screen.getByRole("link", { name: messages.nav.public.how }).getAttribute("href")).toBe(`/${locale}#how`);
    expect(screen.getByRole("link", { name: messages.nav.public.features }).getAttribute("href")).toBe(`/${locale}#features`);
  });

  it("outside demo mode still links the Access section", () => {
    demo.DEMO_MODE = false;
    nav.path = `/${locale}`;
    render(visitor());
    expect(hrefs()).toContain(`/${locale}#access`);
    expect(hrefs()).not.toContain(`/${locale}/demo`);
  });
});

describe("AppShell for a signed-in user", () => {
  it("groups the menu by what the trader is doing", () => {
    nav.path = "/fa/journal";
    render(<AppShell locale="fa" messages={fa} canAccessAdmin={false} user={member}><p>page</p></AppShell>);
    const sidebar = document.querySelector("aside") as HTMLElement;
    const group = (label: string) => within(sidebar).getByRole("group", { name: label });
    const names = (label: string) => within(group(label)).getAllByRole("link").map((link) => link.getAttribute("href"));

    expect(names(fa.nav.groups.trading)).toEqual(["/fa/plans", "/fa/journal", "/fa/import"]);
    expect(names(fa.nav.groups.analysis)).toEqual(["/fa/performance", "/fa/reviews", "/fa/ai"]);
    expect(names(fa.nav.groups.system)).toEqual(["/fa/strategies", "/fa/risk", "/fa/backtests"]);
    expect(names(fa.nav.groups.tools)).toEqual(expect.arrayContaining(["/fa/watchlists", "/fa/alerts", "/fa/ideas"]));
    expect(names(fa.nav.groups.account)).toEqual(expect.arrayContaining(["/fa/settings"]));
    expect(within(sidebar).queryByRole("link", { name: fa.nav.public.access })).toBeNull();
  });

  it("marks the current page inside its group, with nothing collapsed", () => {
    nav.path = "/fa/settings";
    render(<AppShell locale="fa" messages={fa} canAccessAdmin={false} user={member}><p>page</p></AppShell>);
    const sidebar = document.querySelector("aside") as HTMLElement;
    expect(sidebar.querySelector("details")).toBeNull();
    expect(within(sidebar).getByRole("link", { name: fa.nav.settings }).getAttribute("aria-current")).toBe("page");
    expect(within(sidebar).getByRole("link", { name: fa.nav.journal }).getAttribute("aria-current")).toBeNull();
  });

  it("uses the product glossary: پلن for Plan and an honest name for the simulator", () => {
    nav.path = "/fa/journal";
    render(<AppShell locale="fa" messages={fa} canAccessAdmin={false} user={member}><p>page</p></AppShell>);
    const sidebar = document.querySelector("aside") as HTMLElement;
    expect(within(sidebar).getByRole("link", { name: "پلن" }).getAttribute("href")).toBe("/fa/plans");
    expect(within(sidebar).getByRole("link", { name: "شبیه‌ساز سناریو" }).getAttribute("href")).toBe("/fa/backtests");
  });
});
