import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { getMessages } from "@/lib/i18n/messages";

const hdrs = vi.hoisted(() => ({ locale: null as string | null }));
const cookieJar = vi.hoisted(() => ({ locale: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(hdrs.locale ? { "x-locale": hdrs.locale } : {}),
  cookies: async () => ({ get: (name: string) => (name === "locale" && cookieJar.locale ? { name, value: cookieJar.locale } : undefined) })
}));
vi.mock("@/components/pwa/pwa-register", () => ({ PwaRegister: () => null }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/fa/journal",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }
}));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(async () => ({})) }));

import RootLayout from "@/app/layout";
import { AppShell } from "@/components/layout/app-shell";
import { proxy } from "@/proxy";

afterEach(() => {
  cleanup();
  hdrs.locale = null;
  document.cookie = "locale=; path=/; max-age=0";
});

const request = (path: string, headers: Record<string, string> = {}) => new NextRequest(`https://app.example${path}`, { headers });

// The bare domain and the installed app always opened in English; Persian pages reported lang="en" with no direction.
describe("the bare domain and the saved language", () => {
  it("opens Persian by default", () => {
    const response = proxy(request("/"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example/fa");
  });

  it("opens the language saved in the cookie", () => {
    expect(proxy(request("/", { cookie: "locale=en" })).headers.get("location")).toBe("https://app.example/en");
    expect(proxy(request("/", { cookie: "locale=fa" })).headers.get("location")).toBe("https://app.example/fa");
  });

  it("ignores a cookie that is not a supported language", () => {
    expect(proxy(request("/", { cookie: "locale=de" })).headers.get("location")).toBe("https://app.example/fa");
  });

  it("keeps the path and query when adding the language", () => {
    const location = new URL(proxy(request("/login?next=/fa/journal")).headers.get("location") as string);
    expect(location.pathname).toBe("/fa/login");
    expect(location.searchParams.get("next")).toBe("/fa/journal");
    expect(new URL(proxy(request("/journal", { cookie: "locale=en" })).headers.get("location") as string).pathname).toBe("/en/journal");
  });

  it("does not redirect /offline, which the service worker caches without a language", () => {
    const response = proxy(request("/offline"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("leaves API calls and files alone", () => {
    for (const path of ["/api/auth/me", "/sw.js", "/manifest.webmanifest", "/_next/static/x.js"]) {
      expect(proxy(request(path)).headers.get("location")).toBeNull();
    }
  });
});

describe("the language reaches the root layout from the URL", () => {
  it("passes the URL's language on as a request header", () => {
    expect(proxy(request("/fa/journal")).headers.get("x-middleware-request-x-locale")).toBe("fa");
    expect(proxy(request("/en")).headers.get("x-middleware-request-x-locale")).toBe("en");
  });

  // /en/report.pdf has no page: the 404 is rendered with the root layout, which reads this header for <html lang dir>.
  it("passes the language of a missing file path under a language too, so the 404 is in that language", () => {
    expect(proxy(request("/en/report.pdf")).headers.get("x-middleware-request-x-locale")).toBe("en");
    expect(proxy(request("/fa/files/report.pdf")).headers.get("x-middleware-request-x-locale")).toBe("fa");
    expect(proxy(request("/fa/report.pdf")).headers.get("location")).toBeNull();
  });

  it("does not take a language from a dotted name that only starts like one", () => {
    expect(proxy(request("/en.pdf")).headers.get("x-middleware-request-x-locale")).toBeNull();
    expect(proxy(request("/sw.js")).headers.get("x-middleware-request-x-locale")).toBeNull();
    expect(proxy(request("/api/en/x")).headers.get("x-middleware-request-x-locale")).toBeNull();
  });

  it("does not trust a language header sent by the browser", () => {
    expect(proxy(request("/fa/journal", { "x-locale": "en" })).headers.get("x-middleware-request-x-locale")).toBe("fa");
    expect(proxy(request("/offline", { "x-locale": "en" })).headers.get("x-middleware-request-x-locale")).toBeNull();
    expect(proxy(request("/api/health", { "x-locale": "en" })).headers.get("x-middleware-request-x-locale")).toBeNull();
  });
});

describe("<html> language and direction", () => {
  const render_ = async () => (await RootLayout({ children: null })) as ReactElement<{ lang: string; dir: string }>;

  it("is Persian and right-to-left on /fa pages", async () => {
    hdrs.locale = "fa";
    const html = await render_();
    expect(html.type).toBe("html");
    expect(html.props).toMatchObject({ lang: "fa", dir: "rtl" });
  });

  it("is English and left-to-right on /en pages", async () => {
    hdrs.locale = "en";
    expect((await render_()).props).toMatchObject({ lang: "en", dir: "ltr" });
  });

  it("falls back to the Persian entry language for pages outside a language", async () => {
    hdrs.locale = null;
    expect((await render_()).props).toMatchObject({ lang: "fa", dir: "rtl" });
    hdrs.locale = "xx";
    expect((await render_()).props).toMatchObject({ lang: "fa", dir: "rtl" });
  });
});

describe("the header's language switch", () => {
  it("remembers the chosen language in a cookie", () => {
    render(<AppShell locale="fa" messages={getMessages("fa")} canAccessAdmin={false} user={null}><p>page</p></AppShell>);
    expect(document.cookie).not.toContain("locale=");
    fireEvent.click(screen.getByRole("link", { name: "English" }));
    expect(document.cookie).toContain("locale=en");
  });

  it("remembers Persian when switching from English", () => {
    render(<AppShell locale="en" messages={getMessages("en")} canAccessAdmin={false} user={null}><p>page</p></AppShell>);
    fireEvent.click(screen.getByRole("link", { name: "فارسی" }));
    expect(document.cookie).toContain("locale=fa");
  });
});

describe("the fallback home page and the installed app", () => {
  it("redirects like the proxy: the saved language, else Persian", async () => {
    const { default: HomePage } = await import("@/app/page");
    cookieJar.locale = undefined;
    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT:/fa");
    cookieJar.locale = "en";
    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT:/en");
    cookieJar.locale = "de";
    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT:/fa");
  });

  it("opens the installed app through the language-neutral start URL", () => {
    for (const file of ["public/manifest.webmanifest"]) {
      expect(JSON.parse(readFileSync(file, "utf8")).start_url).toBe("/");
    }
  });
});
