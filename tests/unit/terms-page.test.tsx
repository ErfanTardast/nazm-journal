import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import TermsPage from "@/app/[locale]/terms/page";

afterEach(cleanup);

async function renderTerms(locale: string) {
  const element = await TermsPage({ params: Promise.resolve({ locale }) });
  return render(element).container.textContent ?? "";
}

describe("Terms of Use page", () => {
  it("states the product boundaries in English", async () => {
    const text = await renderTerms("en");
    expect(text).toContain("Terms of Use");
    expect(text).toMatch(/not financial advice/i);
    expect(text).toMatch(/never places, modifies, or cancels orders/i);
    expect(text).toMatch(/does not renew automatically/i);
  });

  it("is available in Persian with the same boundaries", async () => {
    const text = await renderTerms("fa");
    expect(text).toContain("شرایط استفاده");
    expect(text).toContain("توصیه مالی نیست");
    expect(text).toContain("سفارش");
  });

  // The rename rewrote the product's name in five sentences, so the page's "last updated" date is the day of the rename,
  // the same day the privacy page carries.
  it("dates the rename: last updated October 3, 2026, in each language", async () => {
    expect(await renderTerms("en")).toContain("Last updated: October 3, 2026");
    expect(await renderTerms("fa")).toContain("آخرین به‌روزرسانی: ۳ اکتبر ۲۰۲۶");
  });

  it("is marked as a draft until legal review", async () => {
    expect(await renderTerms("en")).toMatch(/draft/i);
    expect(await renderTerms("fa")).toContain("پیش‌نویس");
  });
});

describe("Terms of Use payment clauses", () => {
  it("states the 7-day guarantee and both transfer methods", async () => {
    const en = await renderTerms("en");
    expect(en).toMatch(/within 7 days/i);
    expect(en).toMatch(/USDT/);
    expect(en).toMatch(/TRC20/);
    const fa = await renderTerms("fa");
    expect(fa).toContain("۷ روز");
    expect(fa).toContain("USDT");
  });
});

describe("Terms of Use on a server without payments", () => {
  it("says paid plans are not enabled on this server instead of describing them, without calling it a trial", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_PAYMENTS_ENABLED", "");
    try {
      const en = await renderTerms("en");
      expect(en).toContain("Paid plans are not enabled on this server; every feature that is open is free to use.");
      expect(en).not.toMatch(/trial/i);
      expect(en).not.toMatch(/money-back guarantee/i);
      const fa = await renderTerms("fa");
      expect(fa).toContain("پلن پولی در این سرور فعال نیست. همه‌ی امکاناتی که در دسترس است رایگان است.");
      expect(fa).not.toContain("آزمایشی");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
