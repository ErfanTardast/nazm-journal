import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import en from "@/messages/en.json";
import fa from "@/messages/fa.json";

const nav = vi.hoisted(() => ({ path: "/fa" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(async () => ({})) }));
const demo = vi.hoisted(() => {
  const state = { DEMO_MODE: false, demoModeEnabled: () => state.DEMO_MODE };
  return state;
});
vi.mock("@/lib/demo", () => demo);

import { AppShell } from "@/components/layout/app-shell";

const member = { name: "Sara Sample", email: "sara@example.com" };
const scrolled: Element[] = [];
const scrollIntoView = vi.fn(function (this: Element) {
  scrolled.push(this);
});

beforeEach(() => {
  // jsdom has no scrollIntoView.
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, writable: true, value: scrollIntoView });
});

afterEach(() => {
  cleanup();
  scrollIntoView.mockClear();
  scrolled.length = 0;
  nav.path = "/fa";
  demo.DEMO_MODE = false;
});

const locales = [
  { locale: "fa", messages: getMessages("fa"), skip: "رفتن به محتوا" },
  { locale: "en", messages: getMessages("en"), skip: "Skip to content" }
] as const;

type Locale = (typeof locales)[number]["locale"];

function renderShell(locale: Locale, signedIn: boolean) {
  nav.path = signedIn ? `/${locale}/settings` : `/${locale}`;
  const messages = getMessages(locale);
  return render(
    <AppShell locale={locale} messages={messages} canAccessAdmin={false} user={signedIn ? member : null}>
      <p>page</p>
    </AppShell>
  );
}

/** The first element a Tab key press would reach (everything here is in the DOM order the browser tabs through). */
function firstTabStop(root: HTMLElement) {
  return root.querySelector<HTMLElement>("a[href], button:not([disabled]), summary, input, select, textarea, [tabindex]:not([tabindex='-1'])");
}

describe.each(locales)("skip link ($locale)", ({ locale, skip }) => {
  for (const signedIn of [false, true]) {
    const who = signedIn ? "workspace" : "public";

    it(`is the first focusable element of the ${who} shell and jumps to the content`, () => {
      const { container } = renderShell(locale, signedIn);
      const link = firstTabStop(container);
      expect(link?.textContent).toBe(skip);
      expect(link?.getAttribute("href")).toBe("#content");
    });

    it(`targets a focusable <main id="content"> in the ${who} shell`, () => {
      const { container } = renderShell(locale, signedIn);
      const mains = container.querySelectorAll("main");
      expect(mains).toHaveLength(1);
      expect(mains[0].id).toBe("content");
      // tabIndex -1: the browser can move focus there when the link is followed, but Tab does not stop on it.
      expect(mains[0].getAttribute("tabindex")).toBe("-1");
      expect(container.querySelectorAll("#content")).toHaveLength(1);
    });

    it(`is hidden until it receives focus in the ${who} shell`, () => {
      const { container } = renderShell(locale, signedIn);
      const classes = (firstTabStop(container)?.className ?? "").split(/\s+/);
      expect(classes).toContain("sr-only");
      expect(classes).toContain("focus:not-sr-only");
    });
  }
});

describe("skip link text", () => {
  it("is in both message files, in natural language", () => {
    expect(en.nav.skipToContent).toBe("Skip to content");
    expect(fa.nav.skipToContent).toBe("رفتن به محتوا");
  });
});

describe("workspace sidebar", () => {
  it("scrolls the current page's link into view, nearest edge only", () => {
    renderShell("fa", true);
    const sidebar = document.querySelector("aside") as HTMLElement;
    const current = within(sidebar).getByRole("link", { name: getMessages("fa").nav.settings });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(scrolled).toEqual([current]);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("does nothing when no sidebar link is current (a page outside the menu)", () => {
    nav.path = "/fa/growth";
    render(
      <AppShell locale="fa" messages={getMessages("fa")} canAccessAdmin={false} user={member}>
        <p>page</p>
      </AppShell>
    );
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("keeps room at the start of the menu so a focus outline is not clipped by its scroll box", () => {
    renderShell("en", true);
    const menu = document.querySelector("aside nav") as HTMLElement;
    expect(menu.className.split(/\s+/)).toEqual(expect.arrayContaining(["overflow-y-auto", "ps-1"]));
  });
});

describe.each(locales)("public header on a phone ($locale)", ({ locale, messages }) => {
  const header = () => document.querySelector("header") as HTMLElement;
  const start = () => screen.getByRole("link", { name: messages.nav.public.start });

  it("shows Start at every width", () => {
    renderShell(locale, false);
    const classes = start().className.split(/\s+/);
    // `hidden` below sm took the only call to action away from phones.
    expect(classes).not.toContain("hidden");
    expect(classes.some((name) => /^(sm:|md:|lg:)?hidden$/.test(name))).toBe(false);
    expect(classes).toContain("inline-flex");
  });

  it("has nothing in it with a fixed minimum width, so 360px cannot overflow", () => {
    renderShell(locale, false);
    const offenders = [...header().querySelectorAll<HTMLElement>("*")].flatMap((element) =>
      (element.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter((name) => /(^|:)min-w-/.test(name) && !/(^|:)min-w-0$/.test(name))
        .map((name) => `${element.tagName.toLowerCase()}.${name}`)
    );
    expect(offenders).toEqual([]);
  });

  it("lets the brand shrink and keeps its name for assistive technology", () => {
    renderShell(locale, false);
    const brand = within(header()).getByRole("link", { name: locale === "fa" ? "نظم" : "Nazm" });
    expect(brand.className).toContain("min-w-0");
    expect(brand.getAttribute("href")).toBe(`/${locale}`);
  });

  it("tightens the buttons' padding on phones", () => {
    renderShell(locale, false);
    expect(start().className).toMatch(/\bpx-3\b/);
    expect(start().className).toMatch(/\bsm:px-4\b/);
  });
});

describe("unused navigation texts", () => {
  it("are gone from both message files", () => {
    for (const messages of [en, fa]) {
      expect(messages.nav).not.toHaveProperty("growth");
      expect(messages.nav.public).not.toHaveProperty("product");
    }
  });
});
