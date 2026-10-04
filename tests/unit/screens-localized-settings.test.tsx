import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";
import { getSystemOptions } from "@/lib/services/system-options";
import { DATA_CATEGORIES } from "@/lib/privacy/data-inventory";
import { englishLeaks } from "./support/english-leaks";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { SettingsScreen } from "@/features/settings/settings-screen";

const en = getMessages("en");
const fa = getMessages("fa");
const ARABIC_SCRIPT = /[؀-ۿ]/;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  (apiFetch as Mock).mockReset();
});

/*
 * Settings must read in the page language, including the options the server sends in English (markets, AI modes, risk
 * presets, guardrails, data categories), and the saved/failed banner must sit by the Save button, not at the top.
 */

const settings = {
  locale: "en",
  theme: "dark",
  timezone: "Asia/Tehran",
  riskPerTradePct: 1,
  maxDailyLossPct: 3,
  maxWeeklyLossPct: 6,
  startingBalance: null,
  brokerTimeZone: "mt5:new-york-close"
};
// The real server payloads, so a new English option cannot slip through unnoticed.
const options = JSON.parse(JSON.stringify(getSystemOptions()));
// While payments are off (the trial) the inventory route leaves the payments category out, so this screen never sees it.
const categories = DATA_CATEGORIES.filter(({ key }) => key !== "payments").map(({ key, label, description, exportable }) => ({ key, label, description, exportable }));

// Redis, DELETE and MT5's "Market Watch" window are names the trader meets in Latin letters.
const allowed = ["Redis", "DELETE", "Market Watch", /\b(Asia|Europe|America)\/[A-Za-z_]+\b/g];

function serve(overrides: Record<string, unknown | ((init?: RequestInit) => unknown)> = {}) {
  (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    if (key in overrides) {
      const handler = overrides[key];
      return typeof handler === "function" ? handler(init) : handler;
    }
    if (key === "GET /api/users/me/settings") return { settings };
    if (key === "GET /api/system/options") return { options };
    if (key === "GET /api/privacy/inventory") return { categories };
    if (key === "PATCH /api/users/me/settings") return {};
    throw new Error(`Unexpected request ${key}`);
  });
}

async function renderFa() {
  const view = render(<SettingsScreen locale="fa" messages={fa} />);
  await screen.findByText(fa.pages.settings);
  return view;
}

function saveForm(container: HTMLElement) {
  return container.querySelector('[name="riskPerTradePct"]')!.closest("form") as HTMLFormElement;
}

describe("SettingsScreen in Persian", () => {
  it("has no English heading, label, option, preset, guardrail or data category", async () => {
    serve();
    const { container } = await renderFa();
    expect(englishLeaks(container, allowed)).toEqual([]);
  });

  it("names the real settings fields in Persian", async () => {
    serve();
    await renderFa();
    expect(screen.getByLabelText("منطقه زمانی")).toBeInTheDocument();
    expect(screen.getByLabelText("ریسک هر معامله (٪)")).toBeInTheDocument();
    expect(screen.getByLabelText("حداکثر زیان روزانه (٪)")).toBeInTheDocument();
    expect(screen.getByLabelText("حداکثر زیان هفتگی (٪)")).toBeInTheDocument();
  });

  it("names the journal and strategy reviewers as reviewers, not as browsers", async () => {
    serve();
    await renderFa();
    expect(screen.getByText("بازبین ژورنال")).toBeInTheDocument();
    expect(screen.getByText("بازبین استراتژی")).toBeInTheDocument();
    expect(screen.queryByText(/مرورگر/)).toBeNull();
  });

  it("calls the stored trade plans پلن in the data list, and names the product instead of saying برنامه", async () => {
    serve();
    await renderFa();
    await screen.findByText(/^فهرست نمادها —/);
    expect(screen.getByText(/^پلن‌های معامله —/)).toBeInTheDocument();
    // "برنامه" used to mean both the app and a plan on this page; the product is now called by its name.
    expect(screen.queryAllByText(/برنامه(?!‌ریزی)/)).toEqual([]);
    expect(screen.getByText("ببینید اپ نظم چه داده‌ای نگه می‌دارد، خروجی بگیرید یا حساب را به‌طور دائم حذف کنید.")).toBeInTheDocument();
  });

  it("describes the AI audit log as a record of requests and refused answers", async () => {
    serve();
    await renderFa();
    expect(screen.getByText(/سوابق درخواست‌ها و پاسخ‌های ردشده مربی/)).toBeInTheDocument();
  });

  it("highlights the active risk preset under its Persian name", async () => {
    serve();
    await renderFa();
    expect(screen.getByText("متعادل").closest("div")!.className).toContain("border-success/30");
  });

  // The trial leaves the payments category out, but a build with payments on sends it: it must read in Persian too.
  describe("every category of the data inventory", () => {
    const everyCategory = DATA_CATEGORIES.map(({ key, label, description, exportable }) => ({ key, label, description, exportable }));

    it("has Persian text, payments included", async () => {
      serve({ "GET /api/privacy/inventory": { categories: everyCategory } });
      const { container } = await renderFa();
      await screen.findByText(/^فهرست نمادها —/);
      expect(englishLeaks(container, allowed)).toEqual([]);
      expect(screen.getByText(/^پرداخت‌ها —/)).toBeInTheDocument();
    });

    it("writes the payments row with the glossary word for a plan, and says it is kept for accounting", async () => {
      serve({ "GET /api/privacy/inventory": { categories: everyCategory } });
      await renderFa();
      const row = (await screen.findByText(/^پرداخت‌ها —/)).closest("li") as HTMLElement;
      expect(row.textContent).toContain("پلن");
      expect(row.textContent).toContain("حسابداری");
      expect(row.textContent).not.toMatch(/برنامه(?!‌ریزی)/);
    });

    it("gives every category its own Persian label and description", async () => {
      serve({ "GET /api/privacy/inventory": { categories: everyCategory } });
      await renderFa();
      await screen.findByText(/^فهرست نمادها —/);
      const lines = screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
      for (const { key, label, description } of everyCategory) {
        expect(lines.some((line) => line.includes(label) || line.includes(description)), `${key} still reads in English`).toBe(false);
      }
    });

    it("still shows the English text on the English page", async () => {
      serve({ "GET /api/privacy/inventory": { categories: everyCategory } });
      render(<SettingsScreen locale="en" messages={en} />);
      expect(await screen.findByText(/^Payments —/)).toBeInTheDocument();
    });
  });

  it("keeps unknown server options as they are instead of failing", async () => {
    const extra = JSON.parse(JSON.stringify(options));
    extra.ai.workflows.push({ value: "new_mode", label: "Brand New Mode", description: "Something new." });
    serve({ "GET /api/system/options": { options: extra } });
    await renderFa();
    expect(screen.getByText("Brand New Mode")).toBeInTheDocument();
  });

  it("has no English when the settings cannot be loaded", async () => {
    (apiFetch as Mock).mockRejectedValue(new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    const { container } = render(<SettingsScreen locale="fa" messages={fa} />);
    await waitFor(() => expect(container.textContent).toMatch(ARABIC_SCRIPT));
    expect(englishLeaks(container, allowed)).toEqual([]);
  });

  it("has no English while loading", () => {
    (apiFetch as Mock).mockReturnValue(new Promise(() => undefined));
    const { container } = render(<SettingsScreen locale="fa" messages={fa} />);
    expect(container.textContent).toMatch(ARABIC_SCRIPT);
    expect(englishLeaks(container, allowed)).toEqual([]);
  });
});

describe("SettingsScreen in English", () => {
  it("keeps the English names", async () => {
    serve();
    render(<SettingsScreen locale="en" messages={en} />);
    expect(await screen.findByLabelText("Timezone")).toBeInTheDocument();
    expect(screen.getByLabelText("Risk per trade %")).toBeInTheDocument();
    expect(screen.getByText("Balanced")).toBeInTheDocument();
    expect(screen.getByText("Professional Coach")).toBeInTheDocument();
  });
});

describe("SettingsScreen banners sit next to the Save button", () => {
  it("shows 'saved' just above the Save button, inside the form", async () => {
    serve();
    const { container } = await renderFa();
    fireEvent.submit(saveForm(container));

    const status = await screen.findByRole("status");
    const form = saveForm(container);
    expect(form.contains(status)).toBe(true);
    const save = within(form).getByRole("button", { name: "ذخیره تنظیمات" });
    expect(status.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(status.textContent).toBe("تنظیمات ذخیره شد");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("shows a rejected save in Persian just above the Save button, naming the field", async () => {
    serve({
      "PATCH /api/users/me/settings": () => {
        throw new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: { riskPerTradePct: ["Too big"] } });
      }
    });
    const { container } = await renderFa();
    fireEvent.submit(saveForm(container));

    const alert = await screen.findByRole("alert");
    const form = saveForm(container);
    expect(form.contains(alert)).toBe(true);
    const save = within(form).getByRole("button", { name: "ذخیره تنظیمات" });
    expect(alert.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(alert.textContent).toContain("ریسک هر معامله");
    expect(alert.textContent).not.toMatch(/validation/i);
    expect(englishLeaks(alert)).toEqual([]);
  });

  it("clears the old banner when saving again", async () => {
    serve();
    const { container } = await renderFa();
    fireEvent.submit(saveForm(container));
    await screen.findByRole("status");
    (apiFetch as Mock).mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "PATCH") throw new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR");
      return {};
    });
    fireEvent.submit(saveForm(container));
    await screen.findByRole("alert");
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("SettingsScreen other failures are localized and sit by their own button", () => {
  it("reports a failed export next to the export button", async () => {
    serve();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));
    await renderFa();
    fireEvent.click(screen.getByRole("button", { name: "خروجی داده‌های من" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(ARABIC_SCRIPT);
    expect(englishLeaks(alert)).toEqual([]);
  });

  it("reports a refused account deletion in Persian next to the delete button", async () => {
    serve({
      "DELETE /api/users/me": () => {
        throw new ApiClientError("Invalid password", 403, "FORBIDDEN");
      }
    });
    const { container } = await renderFa();
    const form = container.querySelector('[name="confirmationText"]')!.closest("form") as HTMLFormElement;
    fireEvent.change(form.querySelector('[name="confirmationEmail"]')!, { target: { value: "me@example.com" } });
    fireEvent.change(form.querySelector('[name="confirmationText"]')!, { target: { value: "DELETE" } });
    fireEvent.change(form.querySelector('[name="password"]')!, { target: { value: "x" } });
    fireEvent.submit(form);

    const alert = await within(form).findByRole("alert");
    expect(alert.textContent).toMatch(ARABIC_SCRIPT);
    expect(englishLeaks(alert)).toEqual([]);
    // The preferences form has no banner of its own for this failure.
    expect(within(saveForm(container)).queryByRole("alert")).toBeNull();
  });

  /** Fills and submits the account-deletion form, with the DELETE call failing as given. */
  async function deleteWith(locale: "fa" | "en", error: ApiClientError) {
    serve({
      "DELETE /api/users/me": () => {
        throw error;
      }
    });
    const view = render(<SettingsScreen locale={locale} messages={locale === "fa" ? fa : en} />);
    await screen.findByText((locale === "fa" ? fa : en).pages.settings);
    const form = view.container.querySelector('[name="confirmationText"]')!.closest("form") as HTMLFormElement;
    fireEvent.change(form.querySelector('[name="confirmationEmail"]')!, { target: { value: "me@example.com" } });
    fireEvent.change(form.querySelector('[name="confirmationText"]')!, { target: { value: "DELETE" } });
    fireEvent.change(form.querySelector('[name="password"]')!, { target: { value: "x" } });
    fireEvent.submit(form);
    return within(form).findByRole("alert");
  }

  it("says the email does not match, in Persian, when the confirmation email is wrong (422)", async () => {
    const alert = await deleteWith("fa", new ApiClientError("Confirmation email does not match this account.", 422, "ACCOUNT_DELETE_CONFIRMATION_MISMATCH"));
    expect(alert.textContent).toBe("ایمیل واردشده با ایمیل این حساب یکی نیست.");
    expect(alert.textContent).not.toContain("برخی مقادیر");
  });

  it("says the email does not match, in English, when the confirmation email is wrong (422)", async () => {
    const alert = await deleteWith("en", new ApiClientError("Confirmation email does not match this account.", 422, "ACCOUNT_DELETE_CONFIRMATION_MISMATCH"));
    expect(alert.textContent).toBe("The email you typed does not match this account's email.");
    expect(alert.textContent).not.toMatch(/not valid/i);
  });

  it("says the password is wrong, in Persian, when the server refuses it (403)", async () => {
    const alert = await deleteWith("fa", new ApiClientError("Password confirmation failed.", 403, "ACCOUNT_DELETE_PASSWORD_INVALID"));
    expect(alert.textContent).toBe("رمز عبور درست نیست.");
  });

  it("says the password is wrong, in English, when the server refuses it (403)", async () => {
    const alert = await deleteWith("en", new ApiClientError("Password confirmation failed.", 403, "ACCOUNT_DELETE_PASSWORD_INVALID"));
    expect(alert.textContent).toBe("The password is not correct.");
  });

  it("still uses the screen's own line for any other failure to delete", async () => {
    const alert = await deleteWith("fa", new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"));
    expect(alert.textContent).toBe("حذف حساب انجام نشد. ایمیل، کلمه تأیید و رمز عبور را بررسی کنید.");
  });
});
