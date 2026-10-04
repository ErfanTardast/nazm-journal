import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/components/pwa/pwa-register", () => ({ PwaRegister: () => null }));
vi.mock("@/lib/demo", () => ({ DEMO_MODE: false, demoModeEnabled: () => false }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => null) }));
vi.mock("@/components/layout/app-shell", () => ({ AppShell: () => null }));

import { metadata } from "@/app/layout";
import { generateMetadata as localeMetadata } from "@/app/[locale]/layout";
import PrivacyPage from "@/app/[locale]/privacy/page";
import TermsPage from "@/app/[locale]/terms/page";
import { generateMetadata as backtestsMetadata } from "@/app/[locale]/backtests/page";
import { DemoScreen } from "@/features/demo/demo-screen";
import { RequestAccessScreen } from "@/features/access/request-access-screen";
import { LandingScreen } from "@/features/landing/landing-screen";
import { landingCopy } from "@/features/landing/landing-copy";
import { fallbackCopy } from "@/lib/i18n/fallback-copy";
import { getMessages } from "@/lib/i18n/messages";
import { brand } from "@/lib/brand";
import { makeOtpAuthUrl } from "@/lib/security/totp";
import { getSystemOptions } from "@/lib/services/system-options";
import { englishLeaks } from "./support/english-leaks";

afterEach(cleanup);

// The product is called Nazm in English and «نظم» in Persian. This file renders the pages and reads the metadata, the
// messages and the copy objects for the name each language shows. tests/unit/brand-name-files.test.ts scans the tracked
// text for the old name, "TradeMaster", and for personal folder paths.

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("the name in each language", () => {
  it("is Nazm in English and «نظم» in Persian", () => {
    expect(brand.en.name).toBe("Nazm");
    expect(brand.fa.name).toBe("نظم");
    expect(brand.en.tagline).toBe("Nazm — the trader's discipline journal");
    expect(brand.fa.tagline).toBe("نظم — دفتر انضباط معامله‌گر");
  });

  it("names the browser tab, the installed app and the home-screen title", () => {
    expect(String(metadata.title)).toBe("Nazm — the trader's discipline journal");
    expect(metadata.applicationName).toBe("Nazm");
    expect((metadata.appleWebApp as { title: string }).title).toBe("Nazm");
    const file = JSON.parse(read("public/manifest.webmanifest")) as { name: string; short_name: string };
    expect(file.name).toBe("Nazm — the trader's discipline journal");
    expect(file.short_name).toBe("Nazm");
  });

  it("titles each language's pages with its own tagline, so a Persian tab is not English", async () => {
    expect((await localeMetadata({ params: Promise.resolve({ locale: "en" }) })).title).toBe("Nazm — the trader's discipline journal");
    expect((await localeMetadata({ params: Promise.resolve({ locale: "fa" }) })).title).toBe("نظم — دفتر انضباط معامله‌گر");
    expect(await localeMetadata({ params: Promise.resolve({ locale: "de" }) })).toEqual({});
  });

  it("puts the right name after a page title in each language", async () => {
    expect(String((await backtestsMetadata({ params: Promise.resolve({ locale: "en" }) })).title)).toMatch(/ \| Nazm$/);
    expect(String((await backtestsMetadata({ params: Promise.resolve({ locale: "fa" }) })).title)).toMatch(/ \| نظم$/);
  });

  it("lists an account under Nazm in an authenticator app", () => {
    const url = new URL(makeOtpAuthUrl("sara@example.com", "JBSWY3DPEHPK3PXP"));
    expect(url.searchParams.get("issuer")).toBe("Nazm");
    expect(decodeURIComponent(url.pathname)).toBe("/Nazm:sara@example.com");
  });

  it("reports the product name through the system options", () => {
    expect(getSystemOptions().product.name).toBe("Nazm");
  });

  const english = (text: string) => {
    expect(text).toContain("Nazm");
    expect(text).not.toContain("نظم");
  };
  // The demo login is an address and stays Latin on a Persian page; the product's name does not.
  const persian = (text: string) => {
    expect(text).toContain("نظم");
    expect(text.replaceAll("demo@nazm.example", "")).not.toMatch(/nazm/i);
  };

  it("fills the message files", () => {
    english(JSON.stringify(getMessages("en")));
    persian(JSON.stringify(getMessages("fa")));
  });

  it("fills the copy objects", () => {
    english(JSON.stringify(landingCopy.en));
    persian(JSON.stringify(landingCopy.fa));
    english(JSON.stringify(fallbackCopy.en));
    persian(JSON.stringify(fallbackCopy.fa));
  });

  it("shows the right name on the legal pages, the request form, the landing and the demo", async () => {
    for (const [locale, check] of [["en", english], ["fa", persian]] as const) {
      const privacy = await PrivacyPage({ params: Promise.resolve({ locale }) });
      check(render(privacy).container.textContent ?? "");
      cleanup();
      const terms = await TermsPage({ params: Promise.resolve({ locale }) });
      check(render(terms).container.textContent ?? "");
      cleanup();
      check(render(createElement(RequestAccessScreen, { locale })).container.textContent ?? "");
      cleanup();
      check(render(createElement(LandingScreen, { locale, externalAi: false })).container.textContent ?? "");
      cleanup();
      check(render(createElement(DemoScreen, { locale, messages: getMessages(locale) })).container.textContent ?? "");
      cleanup();
    }
  });

  it("headlines the Persian demo in Persian and writes به‌عنوان with its half-space", () => {
    const text = render(createElement(DemoScreen, { locale: "fa", messages: getMessages("fa") })).container.textContent ?? "";
    expect(text).toContain("ذهن دوم معاملاتی شما.");
    expect(text).toContain("اپ نظم به‌عنوان محیط خصوصی");
    expect(text).not.toContain("Your trading second brain.");
    cleanup();
    const english = render(createElement(DemoScreen, { locale: "en", messages: getMessages("en") })).container.textContent ?? "";
    expect(english).toContain("Your trading second brain.");
  });

  // A Persian page that writes the name «نظم» must not sit above an English sentence: the demo's headline was one.
  it("leaves no English on the Persian demo, landing and request pages", () => {
    // Addresses, the demo password and the landing's sample symbols are not English sentences.
    const allowed = ["demo@nazm.example", "DemoPassword123!", "name@example.com", "XAUUSD", "GBPUSD", "USDJPY"];
    for (const screen of [
      createElement(DemoScreen, { locale: "fa", messages: getMessages("fa") }),
      createElement(RequestAccessScreen, { locale: "fa" }),
      createElement(LandingScreen, { locale: "fa", externalAi: false })
    ]) {
      expect(englishLeaks(render(screen).container, allowed)).toEqual([]);
      cleanup();
    }
  });
});
