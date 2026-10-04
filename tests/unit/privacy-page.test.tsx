import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import PrivacyPage from "@/app/[locale]/privacy/page";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

async function renderPrivacy(locale: string) {
  const element = await PrivacyPage({ params: Promise.resolve({ locale }) });
  return render(element).container.textContent ?? "";
}

describe("Privacy Policy list of user records", () => {
  it("calls a plan پلن and a simulated run سناریوی شبیه‌سازی‌شده in Persian", async () => {
    const text = await renderPrivacy("fa");

    expect(text).toContain("پلن‌ها");
    expect(text).toContain("سناریوهای شبیه‌سازی‌شده");
    expect(text).not.toContain("برنامه‌ها");
    expect(text).not.toContain("بک‌تست");
  });

  it("says simulated scenarios, not backtests, in English", async () => {
    const text = await renderPrivacy("en");

    expect(text).toContain("simulated scenarios");
    expect(text).not.toMatch(/backtest/i);
  });
});

describe("Privacy Policy payment records", () => {
  it("explains that payment records outlive account deletion without identity", async () => {
    expect(await renderPrivacy("en")).toMatch(/kept for accounting/i);
    expect(await renderPrivacy("fa")).toContain("حسابداری");
  });
});

describe("Privacy Policy on a server with payments off", () => {
  it("says the server takes no payments, without calling it a trial, instead of describing plan purchases", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      for (const locale of ["en", "fa"]) {
        const text = await renderPrivacy(locale);
        expect(text).not.toMatch(/USDT|buy a plan|پلنی می‌خرید/);
        cleanup();
      }
      const en = await renderPrivacy("en");
      expect(en).toContain("This server takes no payments, so no payment records are stored.");
      expect(en).not.toMatch(/during this trial/i);
      cleanup();
      const fa = await renderPrivacy("fa");
      expect(fa).toContain("این سرور پرداختی دریافت نمی‌کند، پس سابقه‌ی پرداختی ذخیره نمی‌شود.");
      expect(fa).not.toContain("نسخه‌ی آزمایشی");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

/** The text of the "Access requests" / "درخواست دسترسی" section only. */
async function accessSection(locale: "en" | "fa") {
  render(await PrivacyPage({ params: Promise.resolve({ locale }) }));
  const heading = screen.getByRole("heading", { name: locale === "en" ? "Access requests" : "درخواست دسترسی" });
  return within(heading.closest("div.rounded-lg") as HTMLElement);
}

describe("Privacy Policy access requests", () => {
  it("lists what an access request stores and how long it is kept, in English", async () => {
    const section = await accessSection("en");
    const text = section.getByRole("list").textContent ?? "";

    expect(text).toMatch(/name and email you type/i);
    expect(text).toMatch(/the page language/i);
    expect(text).toMatch(/platform and note/i);
    expect(text).toMatch(/No IP address or browser details are saved/i);
    expect(text).toMatch(/only to answer (that|this) request/i);
  });

  it("says the same in Persian", async () => {
    const section = await accessSection("fa");
    const text = section.getByRole("list").textContent ?? "";

    expect(text).toContain("نام و ایمیلی");
    expect(text).toContain("زبان صفحه");
    expect(text).toContain("پلتفرم و توضیح");
    expect(text).toContain("آدرس IP و مشخصات مرورگر همراه درخواست ذخیره نمی‌شود");
    expect(text).toContain("فقط برای پاسخ به همین درخواست");
  });

  it("states the retention rule the code applies: waiting requests are kept, answered ones go after 30 days (English)", async () => {
    const text = (await accessSection("en")).getByRole("list").textContent ?? "";

    expect(text).toMatch(/still waiting is kept until it has been answered/i);
    expect(text).toMatch(/answered \(invited or declined\)[^.]*deleted automatically 30 days later/i);
    // The old promise of an on-request deletion route is gone from the text that does not depend on a contact address.
    expect(text).not.toMatch(/kept until it has been answered, or until you ask us to delete it/i);
  });

  it("states the retention rule in Persian", async () => {
    const text = (await accessSection("fa")).getByRole("list").textContent ?? "";

    expect(text).toContain("هنوز پاسخ نگرفته");
    expect(text).toContain("تا زمان پاسخ نگه داشته می‌شود");
    expect(text).toContain("۳۰ روز پس از پاسخ (دعوت یا رد)، خودکار حذف می‌شود");
    // "بعد" twice in one sentence ("after the answer, 30 days after") read badly: the old wording is gone.
    expect(text).not.toContain("۳۰ روز بعد");
    expect(text).not.toContain("حذفش کنیم");
  });

  describe("without NEXT_PUBLIC_CONTACT_EMAIL", () => {
    it("leaves out any sentence about asking for deletion, and shows no mail link (English)", async () => {
      vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "");
      const section = await accessSection("en");

      expect(section.queryByRole("link")).toBeNull();
      expect(section.getByRole("list").textContent).not.toMatch(/ask us to|write to|mailto|@/i);
    });

    it("leaves out any sentence about asking for deletion, and shows no mail link (Persian)", async () => {
      delete process.env.NEXT_PUBLIC_CONTACT_EMAIL;
      const section = await accessSection("fa");

      expect(section.queryByRole("link")).toBeNull();
      const text = section.getByRole("list").textContent ?? "";
      expect(text).not.toContain("ایمیل بفرستید");
      expect(text).not.toContain("@");
      // Only the automatic deletion after 30 days is mentioned, not a route to ask for it.
      expect(text.match(/حذف/g)).toHaveLength(1);
    });

    it("ignores a value that is not one plain address", async () => {
      vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "not an address");
      const section = await accessSection("en");

      expect(section.queryByRole("link")).toBeNull();
    });
  });

  describe("with NEXT_PUBLIC_CONTACT_EMAIL", () => {
    it("shows the address as a mailto link and says the person can ask for deletion there (English)", async () => {
      vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "privacy@nazm.example");
      const section = await accessSection("en");

      const link = section.getByRole("link", { name: "privacy@nazm.example" });
      expect(link).toHaveAttribute("href", "mailto:privacy@nazm.example");
      expect(link).toHaveAttribute("dir", "ltr");
      expect(link.closest("li")?.textContent).toMatch(/ask us to delete your request at privacy@nazm\.example/i);
    });

    it("shows the address as a mailto link and says the person can ask for deletion there (Persian)", async () => {
      vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "privacy@nazm.example");
      const section = await accessSection("fa");

      const link = section.getByRole("link", { name: "privacy@nazm.example" });
      expect(link).toHaveAttribute("href", "mailto:privacy@nazm.example");
      expect(link.closest("li")?.textContent).toContain("حذف درخواست‌تان");
      expect(link.closest("li")?.textContent).toContain("به این نشانی ایمیل بفرستید");
    });
  });

  it("says the page language is stored, and that deleting an account deletes the request too", async () => {
    expect(await renderPrivacy("en")).toMatch(/Account deletion removes[^.]*also the access request made with the same email/i);
    cleanup();
    expect(await renderPrivacy("fa")).toContain("درخواست دسترسی ثبت‌شده با همان ایمیل را حذف می‌کند");
  });

  it("is shown in a production trial where payments are off", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(await renderPrivacy("en")).toContain("Access requests");
      cleanup();
      expect(await renderPrivacy("fa")).toContain("درخواست دسترسی");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
