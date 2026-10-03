import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiFetch: api.apiFetch
}));

import { RequestAccessScreen } from "@/features/access/request-access-screen";
import { ApiClientError } from "@/lib/api/client";

beforeEach(() => {
  api.apiFetch.mockResolvedValue({ received: true });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const labels = {
  fa: { name: "نام", email: "ایمیل", platform: "چطور معامله می‌کنید؟", note: "چیزی که می‌خواهید بدانیم (اختیاری)", submit: "ثبت درخواست" },
  en: { name: "Name", email: "Email", platform: "How do you trade?", note: "Anything you want us to know (optional)", submit: "Request access" }
} as const;

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillBasics(locale: "fa" | "en") {
  fill(labels[locale].name, "سارا رضایی");
  fill(labels[locale].email, "sara@example.com");
}

async function submit(locale: "fa" | "en") {
  fireEvent.click(screen.getByRole("button", { name: labels[locale].submit }));
  await waitFor(() => expect(api.apiFetch).toHaveBeenCalled());
}

const sentBody = () => JSON.parse(String((api.apiFetch.mock.calls[0][1] as RequestInit).body));

describe("RequestAccessScreen form", () => {
  it("asks for name, e-mail, how the person trades, and an optional note, in Persian", () => {
    render(<RequestAccessScreen locale="fa" />);

    expect(screen.getByRole("heading", { level: 1, name: "درخواست دسترسی" })).toBeInTheDocument();
    for (const label of [labels.fa.name, labels.fa.email, labels.fa.platform, labels.fa.note]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    const options = [...screen.getByLabelText(labels.fa.platform).querySelectorAll("option")].map((option) => [option.value, option.textContent]);
    expect(options).toEqual([
      ["", "یکی را انتخاب کنید (اختیاری)"],
      ["mt5", "با متاتریدر ۵ (MT5)"],
      ["other", "با پلتفرم دیگر"],
      ["manual", "ژورنال دستی، بدون پلتفرم"]
    ]);
  });

  it("is available in English too", () => {
    render(<RequestAccessScreen locale="en" />);

    expect(screen.getByRole("heading", { level: 1, name: "Request access" })).toBeInTheDocument();
    const options = [...screen.getByLabelText(labels.en.platform).querySelectorAll("option")].map((option) => option.textContent);
    expect(options).toEqual(["Choose one (optional)", "MT5", "Another platform", "Manual journal (no platform)"]);
  });

  it("keeps the e-mail left-to-right on a right-to-left page, and lets names and notes follow their own direction", () => {
    render(<RequestAccessScreen locale="fa" />);

    expect(screen.getByLabelText(labels.fa.email)).toHaveAttribute("dir", "ltr");
    expect(screen.getByLabelText(labels.fa.email)).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(labels.fa.name)).toHaveAttribute("dir", "auto");
    expect(screen.getByLabelText(labels.fa.note)).toHaveAttribute("dir", "auto");
  });

  it("limits the note to 500 characters and counts them left-to-right", () => {
    render(<RequestAccessScreen locale="fa" />);

    expect(screen.getByLabelText(labels.fa.note)).toHaveAttribute("maxlength", "500");
    fill(labels.fa.note, "سلام");
    const counter = screen.getByText("۴/۵۰۰");
    expect(counter).toHaveAttribute("dir", "ltr");
  });

  it("hides a honeypot field named website from people, from keyboards and from assistive technology", () => {
    const { container } = render(<RequestAccessScreen locale="fa" />);

    const input = container.querySelector<HTMLInputElement>('input[name="website"]');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute("tabindex", "-1");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input!.closest('[aria-hidden="true"]')).not.toBeNull();
    // Not display:none (a script would skip it), but out of sight and out of the page's width.
    expect(input!.closest("div")?.className).toContain("sr-only");
  });
});

describe("RequestAccessScreen submit", () => {
  it("posts the request as JSON in the page's language and shows the success state", async () => {
    render(<RequestAccessScreen locale="fa" />);
    fillBasics("fa");
    fill(labels.fa.platform, "mt5");
    fill(labels.fa.note, "ژورنال را در اکسل می‌نویسم");

    await submit("fa");

    const [path, init] = api.apiFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/access-requests");
    expect(init.method).toBe("POST");
    expect(sentBody()).toEqual({
      name: "سارا رضایی",
      email: "sara@example.com",
      tradingPlatform: "mt5",
      note: "ژورنال را در اکسل می‌نویسم",
      locale: "fa",
      website: ""
    });
    expect(await screen.findByText("درخواست شما ثبت شد")).toBeInTheDocument();
    expect(screen.getByText(/اگر جایی باز شود، کد دعوت را به این ایمیل می‌فرستیم/)).toBeInTheDocument();
    expect(screen.getByText("sara@example.com")).toHaveAttribute("dir", "ltr");
    expect(screen.queryByLabelText(labels.fa.name)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: labels.fa.submit })).not.toBeInTheDocument();
  });

  it("says the same in English", async () => {
    render(<RequestAccessScreen locale="en" />);
    fillBasics("en");

    await submit("en");

    expect(await screen.findByText("Your request is recorded")).toBeInTheDocument();
    expect(screen.getByText(/if a place opens, we will send the invite code to this address/i)).toBeInTheDocument();
    expect(sentBody().locale).toBe("en");
  });

  it("trims what was typed and leaves out the optional fields that were not filled in", async () => {
    render(<RequestAccessScreen locale="en" />);
    fill(labels.en.name, "  Sara Trader ");
    fill(labels.en.email, " Sara@Example.com ");
    fill(labels.en.note, "   ");

    await submit("en");

    expect(sentBody()).toEqual({ name: "Sara Trader", email: "Sara@Example.com", locale: "en", website: "" });
  });

  it("sends whatever lands in the honeypot, so the server can drop the request", async () => {
    const { container } = render(<RequestAccessScreen locale="en" />);
    fillBasics("en");
    fireEvent.change(container.querySelector('input[name="website"]')!, { target: { value: "https://spam.example" } });

    await submit("en");

    expect(sentBody().website).toBe("https://spam.example");
  });

  it("disables the button while the request is on its way", async () => {
    let finish: (value: unknown) => void = () => undefined;
    api.apiFetch.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<RequestAccessScreen locale="en" />);
    fillBasics("en");

    await submit("en");

    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    finish({ received: true });
    expect(await screen.findByText("Your request is recorded")).toBeInTheDocument();
  });
});

describe("RequestAccessScreen validation and errors", () => {
  it("checks the fields before sending and says which one is wrong, in the page's language", () => {
    render(<RequestAccessScreen locale="fa" />);
    fill(labels.fa.name, "س");
    fill(labels.fa.email, "not-an-email");

    fireEvent.click(screen.getByRole("button", { name: labels.fa.submit }));

    expect(screen.getByText("نام را وارد کنید (۲ تا ۸۰ کاراکتر).")).toBeInTheDocument();
    expect(screen.getByText("یک نشانی ایمیل معتبر وارد کنید.")).toBeInTheDocument();
    expect(screen.getByLabelText(labels.fa.email)).toHaveAttribute("aria-invalid", "true");
    expect(api.apiFetch).not.toHaveBeenCalled();
  });

  it("refuses a note over 500 characters", () => {
    render(<RequestAccessScreen locale="en" />);
    fillBasics("en");
    fill(labels.en.note, "x".repeat(501));

    fireEvent.click(screen.getByRole("button", { name: labels.en.submit }));

    expect(screen.getByText("The note can be at most 500 characters.")).toBeInTheDocument();
    expect(api.apiFetch).not.toHaveBeenCalled();
  });

  it("refuses a name or note with a direction-override or control character before sending, and says why", () => {
    const RLO = String.fromCodePoint(0x202e);
    render(<RequestAccessScreen locale="en" />);
    fill(labels.en.name, `${RLO}Sara`);
    fill(labels.en.email, "sara@example.com");
    fill(labels.en.note, `hello${String.fromCodePoint(7)}`);

    fireEvent.click(screen.getByRole("button", { name: labels.en.submit }));

    expect(screen.getAllByText("Remove control or direction-changing characters from this field.")).toHaveLength(2);
    expect(screen.getByLabelText(labels.en.name)).toHaveAttribute("aria-invalid", "true");
    expect(api.apiFetch).not.toHaveBeenCalled();
  });

  it("lets a note have several lines and Persian half-spaces", async () => {
    render(<RequestAccessScreen locale="fa" />);
    fillBasics("fa");
    const note = ["می", String.fromCodePoint(0x200c), "نویسم", String.fromCodePoint(0x0a), "دوباره"].join("");
    fill(labels.fa.note, note);

    await submit("fa");

    expect(sentBody().note).toBe(note);
  });

  it("says so in Persian when the server refuses a character the page did not catch", async () => {
    api.apiFetch.mockRejectedValue(
      new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: { name: ["Contains control or direction-changing characters"] } })
    );
    const { container } = render(<RequestAccessScreen locale="fa" />);
    fillBasics("fa");

    await submit("fa");

    expect(await screen.findByText("نویسه‌های کنترلی یا تغییردهنده‌ی جهت متن را از این فیلد حذف کنید.")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Contains control/);
  });

  it("clears a field's error once the person edits that field", () => {
    render(<RequestAccessScreen locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: labels.en.submit }));
    expect(screen.getByText("Enter your name (2 to 80 characters).")).toBeInTheDocument();

    fill(labels.en.name, "Sara");

    expect(screen.queryByText("Enter your name (2 to 80 characters).")).not.toBeInTheDocument();
  });

  const serverErrors: [string, unknown, string][] = [
    [
      "a rejected e-mail",
      new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: { email: ["Invalid email address"] } }),
      "یک نشانی ایمیل معتبر وارد کنید."
    ],
    [
      "a rejected name",
      new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: { name: ["Too small"] } }),
      "نام را وارد کنید (۲ تا ۸۰ کاراکتر)."
    ],
    [
      "a validation error naming no known field",
      new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: {} }),
      "برخی فیلدها معتبر نیستند. آن‌ها را بررسی کنید و دوباره تلاش کنید."
    ],
    ["the rate limit", new ApiClientError("Too many requests. Please try again later.", 429, "RATE_LIMITED"), "تعداد درخواست‌ها از این اتصال زیاد بوده است. کمی بعد دوباره تلاش کنید."],
    ["a lost connection", new TypeError("Failed to fetch"), "اتصال به سرور برقرار نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید."],
    ["a server error", new ApiClientError("Unexpected server error", 500, "INTERNAL_SERVER_ERROR"), "مشکلی پیش آمد. کمی بعد دوباره تلاش کنید."],
    ["a request that is too large", new ApiClientError("Request body is too large", 413, "PAYLOAD_TOO_LARGE"), "درخواست بیش از حد بزرگ است. توضیح را کوتاه‌تر کنید و دوباره تلاش کنید."],
    ["a refused content type", new ApiClientError("Send the request body as application/json", 415, "UNSUPPORTED_MEDIA_TYPE"), "مشکلی پیش آمد. کمی بعد دوباره تلاش کنید."]
  ];

  it.each(serverErrors)("shows %s in Persian, never the server's English text", async (_label, error, expected) => {
    api.apiFetch.mockRejectedValue(error);
    const { container } = render(<RequestAccessScreen locale="fa" />);
    fillBasics("fa");

    await submit("fa");

    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/validation failed|too many|unexpected|invalid email|too small|application\/json/i);
    // The form stays, with what was typed, so the person can fix it and try again.
    expect(screen.getByLabelText(labels.fa.name)).toHaveValue("سارا رضایی");
    expect(screen.getByRole("button", { name: labels.fa.submit })).toBeEnabled();
  });

  it("shows the English messages on the English page", async () => {
    api.apiFetch.mockRejectedValue(new ApiClientError("Too many requests. Please try again later.", 429, "RATE_LIMITED"));
    render(<RequestAccessScreen locale="en" />);
    fillBasics("en");

    await submit("en");

    expect(await screen.findByText("Too many requests from this connection. Try again in a while.")).toBeInTheDocument();
  });

  it("shows a too-large request in English on the English page", async () => {
    api.apiFetch.mockRejectedValue(new ApiClientError("Request body is too large", 413, "PAYLOAD_TOO_LARGE"));
    render(<RequestAccessScreen locale="en" />);
    fillBasics("en");

    await submit("en");

    expect(await screen.findByText("That request is too large. Shorten the note and try again.")).toBeInTheDocument();
  });

  it("also recognises a 413 from a proxy that sends no JSON body", async () => {
    api.apiFetch.mockRejectedValue(new ApiClientError("Request failed", 413));
    render(<RequestAccessScreen locale="en" />);
    fillBasics("en");

    await submit("en");

    expect(await screen.findByText("That request is too large. Shorten the note and try again.")).toBeInTheDocument();
  });

  it("announces a failure to assistive technology", async () => {
    api.apiFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<RequestAccessScreen locale="en" />);
    fillBasics("en");

    await submit("en");

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server");
  });
});

describe("RequestAccessScreen accessibility", () => {
  it("marks name and e-mail as required, and only those", () => {
    render(<RequestAccessScreen locale="en" />);

    expect(screen.getByLabelText(labels.en.name)).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText(labels.en.email)).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText(labels.en.note)).not.toHaveAttribute("aria-required");
    expect(screen.getByLabelText(labels.en.platform)).not.toHaveAttribute("aria-required");
  });

  it("moves focus to the first invalid field after a failed submit: the name when both are wrong", () => {
    render(<RequestAccessScreen locale="en" />);
    fill(labels.en.email, "nope");

    fireEvent.click(screen.getByRole("button", { name: labels.en.submit }));

    expect(screen.getByLabelText(labels.en.name)).toHaveFocus();
  });

  it("moves focus to the e-mail when only the e-mail is wrong", () => {
    render(<RequestAccessScreen locale="fa" />);
    fill(labels.fa.name, "سارا رضایی");
    fill(labels.fa.email, "nope");

    fireEvent.click(screen.getByRole("button", { name: labels.fa.submit }));

    expect(screen.getByLabelText(labels.fa.email)).toHaveFocus();
  });

  it("moves focus to the note when only the note is too long", () => {
    render(<RequestAccessScreen locale="en" />);
    fillBasics("en");
    fill(labels.en.note, "x".repeat(501));

    fireEvent.click(screen.getByRole("button", { name: labels.en.submit }));

    expect(screen.getByLabelText(labels.en.note)).toHaveFocus();
  });

  it("moves focus to the field the server rejected", async () => {
    api.apiFetch.mockRejectedValue(
      new ApiClientError("Request validation failed", 422, "VALIDATION_ERROR", { fieldErrors: { email: ["Invalid email address"] } })
    );
    render(<RequestAccessScreen locale="en" />);
    fillBasics("en");

    await submit("en");

    await waitFor(() => expect(screen.getByLabelText(labels.en.email)).toHaveFocus());
  });

  it("leaves focus alone when the failure belongs to the whole form (the alert announces it)", async () => {
    api.apiFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<RequestAccessScreen locale="en" />);
    fillBasics("en");
    screen.getByLabelText(labels.en.note).focus();

    await submit("en");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText(labels.en.note)).toHaveFocus();
  });

  it.each([
    ["en", "Your request is recorded"],
    ["fa", "درخواست شما ثبت شد"]
  ] as const)("%s: moves focus to the success heading, which can take focus but is not a tab stop", async (locale, title) => {
    render(<RequestAccessScreen locale={locale} />);
    fillBasics(locale);

    await submit(locale);

    const heading = await screen.findByRole("heading", { name: title });
    expect(heading).toHaveAttribute("tabindex", "-1");
    await waitFor(() => expect(heading).toHaveFocus());
  });
});

describe("RequestAccessScreen contact address", () => {
  it.each([
    ["en", "You can ask us to delete your request at", "Your request is recorded"],
    ["fa", "برای حذف درخواست‌تان می‌توانید به این نشانی ایمیل بفرستید:", "درخواست شما ثبت شد"]
  ] as const)("%s: the success card shows the contact address as a mailto link and says deletion can be asked there", async (locale, line, title) => {
    render(<RequestAccessScreen locale={locale} contactEmail="privacy@nazm.example" />);
    fillBasics(locale);

    await submit(locale);
    await screen.findByText(title);

    const link = screen.getByRole("link", { name: "privacy@nazm.example" });
    expect(link).toHaveAttribute("href", "mailto:privacy@nazm.example");
    expect(link.closest("p")?.textContent).toContain(line);
  });

  it.each([
    ["en", "Your request is recorded"],
    ["fa", "درخواست شما ثبت شد"]
  ] as const)("%s: without an address the success card says nothing about asking for deletion", async (locale, title) => {
    const { container } = render(<RequestAccessScreen locale={locale} />);
    fillBasics(locale);

    await submit(locale);
    await screen.findByText(title);

    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(container.textContent).not.toMatch(/ask us to delete|حذف/);
  });

  it("does not show the address before the request is sent", () => {
    const { container } = render(<RequestAccessScreen locale="en" contactEmail="privacy@nazm.example" />);

    expect(container.textContent).not.toContain("privacy@nazm.example");
  });
});

describe("RequestAccessScreen links", () => {
  it.each([
    ["fa", "ایمیل شما فقط برای پاسخ به همین درخواست استفاده می‌شود.", "حریم خصوصی", "کد دعوت دارید؟ ساخت حساب"],
    ["en", "We use your email only to answer this request.", "Privacy policy", "Have an invite code? Create an account"]
  ] as const)("%s: says what the e-mail is used for, links the privacy page and the sign-up page", (locale, line, privacy, register) => {
    render(<RequestAccessScreen locale={locale} />);

    expect(screen.getByText(line, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: privacy })).toHaveAttribute("href", `/${locale}/privacy`);
    expect(screen.getByRole("link", { name: register })).toHaveAttribute("href", `/${locale}/register`);
  });

  it("still shows both links after the request was sent", async () => {
    render(<RequestAccessScreen locale="fa" />);
    fillBasics("fa");

    await submit("fa");
    await screen.findByText("درخواست شما ثبت شد");

    expect(screen.getByRole("link", { name: "حریم خصوصی" })).toHaveAttribute("href", "/fa/privacy");
    expect(screen.getByRole("link", { name: "کد دعوت دارید؟ ساخت حساب" })).toHaveAttribute("href", "/fa/register");
  });
});
