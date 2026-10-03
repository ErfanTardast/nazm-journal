import { existsSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const preload = vi.hoisted(() => vi.fn());
vi.mock("react-dom", async (importOriginal) => ({ ...(await importOriginal<typeof import("react-dom")>()), preload }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  }
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => null) }));
vi.mock("@/components/layout/app-shell", () => ({ AppShell: () => null }));

import LocaleLayout from "@/app/[locale]/layout";

const fontHref = () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const match = css.match(/@font-face\s*\{[^}]*font-family:\s*"Vazirmatn"[^}]*url\("([^"]+)"\)/);
  if (!match) throw new Error("globals.css has no Vazirmatn @font-face");
  return match[1];
};

async function renderLayout(locale: string) {
  return LocaleLayout({ children: null, params: Promise.resolve({ locale }) });
}

beforeEach(() => preload.mockClear());

// Audit round 3: without a preload, Persian text first paints in Segoe UI/Tahoma and then swaps, shifting the headline.
describe("[locale] layout font preload", () => {
  it("preloads the Persian font on Persian pages", async () => {
    await renderLayout("fa");
    expect(preload).toHaveBeenCalledTimes(1);
    // The font is fetched in CORS mode whatever the origin, so the preload must say so or it is wasted.
    expect(preload).toHaveBeenCalledWith(fontHref(), { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  });

  it("does not preload it on English pages", async () => {
    await renderLayout("en");
    expect(preload).not.toHaveBeenCalled();
  });

  it("preloads exactly the file the stylesheet asks for, and that file exists", () => {
    const href = fontHref();
    expect(href).toMatch(/\.v\d+\.woff2$/);
    expect(existsSync(`public${href}`)).toBe(true);
  });

  it("still rejects an unknown language without preloading", async () => {
    await expect(renderLayout("de")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(preload).not.toHaveBeenCalled();
  });
});
