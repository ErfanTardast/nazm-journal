import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

const nav = vi.hoisted(() => ({ path: "/fa" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(async () => ({})) }));
// Billing and the demo are hidden in some builds; this test wants every entry the menu can ever show.
vi.mock("@/lib/nav-visibility", () => ({ hiddenNavHrefs: () => new Set<string>() }));
const demo = vi.hoisted(() => {
  const state = { DEMO_MODE: false, demoModeEnabled: () => state.DEMO_MODE };
  return state;
});
vi.mock("@/lib/demo", () => demo);

import { AppShell } from "@/components/layout/app-shell";
import { LandingScreen } from "@/features/landing/landing-screen";

const member = { name: "Sara Sample", email: "sara@example.com" };
const ROUTES = path.join("src", "app", "[locale]");

afterEach(() => {
  cleanup();
  nav.path = "/fa";
  demo.DEMO_MODE = false;
});

function shell(locale: "fa" | "en", user: typeof member | null, canAccessAdmin: boolean) {
  return render(
    <AppShell locale={locale} messages={getMessages(locale)} canAccessAdmin={canAccessAdmin} user={user}>
      <p>page</p>
    </AppShell>
  );
}

/** The path of every in-app link under this language ("/fa/journal" -> "journal", "/fa#how" -> "" for the landing page). */
function routeSegments(container: HTMLElement, locale: string) {
  const hrefs = [...container.querySelectorAll("a[href]")].map((link) => link.getAttribute("href") ?? "");
  return hrefs
    .filter((href) => href === `/${locale}` || href.startsWith(`/${locale}/`) || href.startsWith(`/${locale}#`))
    .map((href) => href.slice(`/${locale}`.length).split("#")[0].split("?")[0].replace(/^\//, "").split("/")[0]);
}

const pageExists = (segment: string) => existsSync(path.join(ROUTES, segment, "page.tsx"));

// A renamed or deleted route folder must not leave a dead link in the menus.
describe.each(["fa", "en"] as const)("every shell link has a page behind it (%s)", (locale) => {
  it("workspace: sidebar, More menu and bottom bar", () => {
    nav.path = `/${locale}/journal`;
    const { container } = shell(locale, member, true);
    const segments = routeSegments(container, locale);

    const bottomBar = container.querySelector("nav.fixed") as HTMLElement;
    const inBottomBar = routeSegments(bottomBar, locale);
    expect(inBottomBar.length).toBeGreaterThanOrEqual(5);

    // The test must see the whole menu, or it proves nothing.
    expect([...new Set(segments)].sort()).toEqual(
      ["admin", "ai", "alerts", "backtests", "billing", "dashboard", "demo", "ideas", "import", "journal", "learning", "news", "onboarding", "performance", "plans", "portfolio", "reviews", "risk", "settings", "strategies", "watchlists"]
    );
    for (const segment of new Set([...segments, ...inBottomBar])) {
      expect(segment, "an empty segment is the landing page").not.toBe("");
      expect(pageExists(segment), `src/app/[locale]/${segment}/page.tsx`).toBe(true);
    }
  });

  for (const demoMode of [false, true]) {
    it(`public header and footer (demo mode ${demoMode ? "on" : "off"})`, () => {
      demo.DEMO_MODE = demoMode;
      nav.path = `/${locale}`;
      const { container } = shell(locale, null, false);
      const segments = routeSegments(container, locale);
      expect(segments.length).toBeGreaterThanOrEqual(6);
      for (const segment of new Set(segments)) {
        // "" is the landing page itself (/fa#how).
        expect(segment === "" ? existsSync(path.join(ROUTES, "page.tsx")) : pageExists(segment), `src/app/[locale]/${segment}`).toBe(true);
      }
    });
  }
});

// Start and Access jump to a section of the landing: the section must be there in the same mode.
describe.each(["fa", "en"] as const)("public menu anchors exist on the landing page (%s)", (locale) => {
  const anchors = (container: HTMLElement) =>
    [...container.querySelectorAll("header a[href*='#']")].map((link) => (link.getAttribute("href") ?? "").split("#")[1]);

  for (const demoMode of [false, true]) {
    it(`demo mode ${demoMode ? "on" : "off"}`, () => {
      demo.DEMO_MODE = demoMode;
      nav.path = `/${locale}`;
      const menu = shell(locale, null, false).container;
      const hashes = anchors(menu);
      expect(hashes).toEqual(expect.arrayContaining(["how", "features"]));
      cleanup();

      const landing = render(<LandingScreen locale={locale} />).container;
      for (const hash of hashes) {
        expect(landing.querySelector(`#${hash}`), `#${hash} on the landing page`).not.toBeNull();
      }
    });
  }
});

describe("admin entries", () => {
  const hrefs = (container: HTMLElement) => [...container.querySelectorAll("a[href]")].map((link) => link.getAttribute("href"));

  it("are not offered to a member who is not an admin", () => {
    nav.path = "/fa/journal";
    const { container } = shell("fa", member, false);
    expect(hrefs(container)).not.toContain("/fa/admin");
  });

  it("are offered to an admin", () => {
    nav.path = "/fa/journal";
    const { container } = shell("fa", member, true);
    expect(hrefs(container)).toContain("/fa/admin");
  });

  it("are never offered to a visitor, whatever the flag says", () => {
    nav.path = "/fa";
    const { container } = shell("fa", null, true);
    expect(hrefs(container)).not.toContain("/fa/admin");
  });
});
