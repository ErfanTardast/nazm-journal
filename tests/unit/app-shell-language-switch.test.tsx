import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

const nav = vi.hoisted(() => ({ path: "/fa/journal" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(async () => ({})) }));
// Marks links that would navigate in the browser without reloading the document.
vi.mock("next/link", async () => {
  const React = await import("react");
  return { default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => React.createElement("a", { href, "data-soft-nav": "true", ...props }, children) };
});

import { AppShell } from "@/components/layout/app-shell";

afterEach(() => {
  cleanup();
  nav.path = "/fa/journal";
});

// The root layout writes <html lang dir> once per document load and is kept while soft-navigating between pages, so
// a language change must load the new page as a document or the attributes would keep the old language.
describe("the header's language switch", () => {
  it("is a document navigation, not a soft one", () => {
    render(<AppShell locale="fa" messages={getMessages("fa")} canAccessAdmin={false} user={{ name: "Sara Sample", email: "sara@example.com" }}><p>page</p></AppShell>);
    const link = screen.getByRole("link", { name: "English" });
    expect(link.getAttribute("href")).toBe("/en/journal");
    expect(link.hasAttribute("data-soft-nav")).toBe(false);
    // Other navigation stays soft.
    expect(screen.getAllByRole("link", { name: "پلن" })[0].hasAttribute("data-soft-nav")).toBe(true);
  });
});

// Review of round 4: the Persian label "فارسی" is the one Persian word on every English page. On a platform whose UI
// face has no Arabic glyphs (Android Roboto, Chrome on macOS and Linux) the browser walks the page's font stack looking
// for them and reaches the Vazirmatn @font-face, so the 111 KB file was fetched on every English page just for it.
describe("the language switch's font", () => {
  const families = (link: HTMLElement) => (link.style.fontFamily || "").split(",").map((family) => family.trim().replace(/^["']|["']$/g, ""));

  it("is a stack without the Persian web font on English pages, so the label cannot trigger its download", () => {
    nav.path = "/en/journal";
    render(<AppShell locale="en" messages={getMessages("en")} canAccessAdmin={false} user={{ name: "Sara Sample", email: "sara@example.com" }}><p>page</p></AppShell>);
    const link = screen.getByRole("link", { name: "فارسی" });
    expect(link.getAttribute("href")).toBe("/fa/journal");
    const stack = families(link);
    expect(stack.length).toBeGreaterThan(1);
    expect(stack).not.toContain("Vazirmatn");
    // Persian glyphs still come from a system face: Tahoma and the generic fallback cover them on Windows and elsewhere.
    expect(stack).toEqual(expect.arrayContaining(["Segoe UI", "system-ui", "Tahoma", "sans-serif"]));
  });

  it("is also on the visitor's public header", () => {
    nav.path = "/en";
    render(<AppShell locale="en" messages={getMessages("en")} canAccessAdmin={false} user={null}><p>page</p></AppShell>);
    const stack = families(screen.getByRole("link", { name: "فارسی" }));
    expect(stack).toEqual(expect.arrayContaining(["system-ui", "Tahoma"]));
    expect(stack).not.toContain("Vazirmatn");
  });

  it("leaves the English label on Persian pages with the page's own font", () => {
    render(<AppShell locale="fa" messages={getMessages("fa")} canAccessAdmin={false} user={null}><p>page</p></AppShell>);
    expect(screen.getByRole("link", { name: "English" }).getAttribute("style")).toBeNull();
  });
});
