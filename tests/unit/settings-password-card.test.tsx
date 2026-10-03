import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api/client")>()), apiFetch: api.apiFetch }));

import { ApiClientError } from "@/lib/api/client";
import { SettingsScreen } from "@/features/settings/settings-screen";

const settings = {
  locale: "en",
  theme: "dark",
  timezone: "UTC",
  riskPerTradePct: 1,
  maxDailyLossPct: 3,
  maxWeeklyLossPct: 6,
  startingBalance: null,
  brokerTimeZone: "America/New_York"
};
const options = {
  product: { supportedMarkets: [], coreWorkflows: [], safetyGuardrails: [] },
  userDefaults: { locales: [], themes: [], timezones: ["UTC"], riskPresets: [] },
  ai: { provider: "local", workflows: [] },
  infrastructure: { database: "postgres", redis: "memory fallback", emailProvider: "local", marketDataProvider: "local", appUrl: "http://localhost" }
};

const CURRENT = "OldPassword123!";
const NEXT = "NewPassword456!";
const PASSWORD_PATH = "/api/users/me/password";

/** Answers the screen's own loads; the password route is whatever the test passes (a value, or a function that throws). */
function serve(passwordRoute: () => unknown | Promise<unknown> = () => ({ changed: true })) {
  api.apiFetch.mockImplementation(async (path: string) => {
    if (path === "/api/users/me/settings") return { settings };
    if (path === "/api/system/options") return { options };
    if (path === "/api/privacy/inventory") return { categories: [] };
    if (path === PASSWORD_PATH) return passwordRoute();
    return {};
  });
}

const passwordCalls = () => api.apiFetch.mock.calls.filter(([path]) => path === PASSWORD_PATH);

const words = {
  en: {
    title: "Password",
    current: "Current password",
    next: "New password",
    repeat: "Repeat new password",
    submit: "Change password",
    saving: "Changing password...",
    changed: "Password changed. Other devices were signed out.",
    currentRequired: "Enter your current password.",
    currentInvalid: "The current password is not correct.",
    nextRules: "The new password does not meet the rules.",
    nextSame: "The new password must be different from the current one.",
    mismatch: "The two new passwords do not match.",
    tooMany: "Too many attempts. Try again in about 15 minutes, or sign out and follow the password reset note on the sign-in page.",
    demoAccount: "This is the shared demo account, so its password cannot be changed.",
    failed: "The password could not be changed. Try again in a moment.",
    network: "Could not reach the server. Check your connection and try again."
  },
  fa: {
    title: "رمز عبور",
    current: "رمز عبور فعلی",
    next: "رمز عبور جدید",
    repeat: "تکرار رمز عبور جدید",
    submit: "تغییر رمز",
    saving: "در حال تغییر رمز...",
    changed: "رمز عبور تغییر کرد. دستگاه‌های دیگر از حساب خارج شدند.",
    currentRequired: "رمز عبور فعلی را وارد کنید.",
    currentInvalid: "رمز عبور فعلی درست نیست.",
    nextRules: "رمز عبور جدید شرایط لازم را ندارد.",
    nextSame: "رمز عبور جدید باید با رمز عبور فعلی فرق داشته باشد.",
    mismatch: "تکرار رمز عبور با رمز عبور جدید یکی نیست.",
    tooMany: "تعداد تلاش‌ها زیاد بود. حدود ۱۵ دقیقه بعد دوباره تلاش کنید، یا خارج شوید و توضیح تنظیم مجدد رمز عبور را در صفحه ورود ببینید.",
    demoAccount: "این حساب نمایشی مشترک است و رمز عبورش قابل تغییر نیست.",
    failed: "تغییر رمز عبور انجام نشد. کمی بعد دوباره تلاش کنید.",
    network: "اتصال به سرور برقرار نشد. اینترنت خود را بررسی کنید و دوباره تلاش کنید."
  }
} as const;

type Locale = keyof typeof words;

async function open(locale: Locale) {
  serve();
  const messages = getMessages(locale);
  const view = render(<SettingsScreen locale={locale} messages={messages} />);
  await screen.findByText(messages.pages.settings);
  const w = words[locale];
  const card = screen.getByRole("heading", { name: w.title, level: 2 }).closest("div.overflow-hidden") as HTMLElement;
  const field = (label: string) => within(card).getByLabelText(label) as HTMLInputElement;
  return {
    ...view,
    w,
    messages,
    card,
    form: field(w.current).closest("form") as HTMLFormElement,
    current: field(w.current),
    next: field(w.next),
    repeat: field(w.repeat),
    submitButton: within(card).getByRole("button", { name: w.submit }) as HTMLButtonElement
  };
}

type Opened = Awaited<ReturnType<typeof open>>;

function fill(opened: Opened, values: { current?: string; next?: string; repeat?: string }) {
  if (values.current !== undefined) fireEvent.change(opened.current, { target: { value: values.current } });
  if (values.next !== undefined) fireEvent.change(opened.next, { target: { value: values.next } });
  if (values.repeat !== undefined) fireEvent.change(opened.repeat, { target: { value: values.repeat } });
}

const fillValid = (opened: Opened) => fill(opened, { current: CURRENT, next: NEXT, repeat: NEXT });

const reject = (status: number, code: string, details: unknown = {}) => () => {
  throw new ApiClientError("The server's own English sentence", status, code, details);
};

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe.each(["en", "fa"] as const)("Settings password card (%s)", (locale) => {
  describe("the card", () => {
    it("renders above the delete-account card with the three fields wired for password managers and screen readers", async () => {
      const o = await open(locale);

      expect(o.current).toHaveAttribute("type", "password");
      expect(o.next).toHaveAttribute("type", "password");
      expect(o.repeat).toHaveAttribute("type", "password");
      expect(o.current).toHaveAttribute("autocomplete", "current-password");
      expect(o.next).toHaveAttribute("autocomplete", "new-password");
      expect(o.repeat).toHaveAttribute("autocomplete", "new-password");
      // Labels are tied to their inputs by id, not by wrapping.
      for (const input of [o.current, o.next, o.repeat]) {
        expect(input.id).not.toBe("");
        expect(o.card.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
      }
      expect(o.form).toHaveAttribute("novalidate");

      const deleteHeading = screen.getAllByRole("heading").find((heading) => heading.tagName === "H3")!;
      // Exactly FOLLOWING: the delete card comes after this one and is not inside it.
      expect(o.card.compareDocumentPosition(deleteHeading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it("shows the sign-up password rules in the page language and ties them to the new-password field", async () => {
      const o = await open(locale);

      const hint = within(o.card).getByText(o.messages.auth.passwordHint);
      expect(o.next.getAttribute("aria-describedby")?.split(" ")).toContain(hint.id);
      expect(o.next).not.toHaveAttribute("aria-invalid");
    });

    it("has a submit button named for the action", async () => {
      const o = await open(locale);

      expect(o.submitButton).toBeEnabled();
      expect(o.submitButton).toHaveAttribute("type", "submit");
    });

    it("limits the three fields to 128 characters, the longest password the rules allow", async () => {
      const o = await open(locale);

      for (const input of [o.current, o.next, o.repeat]) expect(input).toHaveAttribute("maxlength", "128");
    });
  });

  describe("the screen's own checks (nothing is sent)", () => {
    it("says the two new passwords differ and focuses the repeat field", async () => {
      const o = await open(locale);
      fill(o, { current: CURRENT, next: NEXT, repeat: `${NEXT}x` });

      fireEvent.submit(o.form);

      const message = await within(o.card).findByText(o.w.mismatch);
      expect(o.repeat).toHaveAttribute("aria-invalid", "true");
      expect(o.repeat.getAttribute("aria-describedby")).toBe(message.id);
      expect(o.repeat).toHaveFocus();
      expect(o.next).not.toHaveAttribute("aria-invalid");
      expect(passwordCalls()).toHaveLength(0);
    });

    it("announces a field message as an alert, also when the field that has it already has focus", async () => {
      const o = await open(locale);
      fill(o, { current: CURRENT, next: NEXT, repeat: `${NEXT}x` });
      // The usual keyboard flow: the person is in the repeat field when they press Enter, so focus does not move.
      o.repeat.focus();

      fireEvent.submit(o.form);

      const message = await within(o.card).findByText(o.w.mismatch);
      expect(message).toHaveAttribute("role", "alert");
      expect(within(o.card).getAllByRole("alert")).toEqual([message]);
      expect(o.repeat.getAttribute("aria-describedby")).toBe(message.id);
    });

    it("says the new password is the current one when the two typed passwords are equal, before it checks the repeat", async () => {
      const o = await open(locale);
      fill(o, { current: CURRENT, next: CURRENT, repeat: "something else" });

      fireEvent.submit(o.form);

      const message = await within(o.card).findByText(o.w.nextSame);
      expect(o.next).toHaveAttribute("aria-invalid", "true");
      expect(o.next.getAttribute("aria-describedby")?.split(" ")[0]).toBe(message.id);
      expect(o.next).toHaveFocus();
      expect(within(o.card).queryByText(o.w.mismatch)).toBeNull();
      // Nothing is sent: it would use up one of the five attempts a quarter of an hour allows.
      expect(passwordCalls()).toHaveLength(0);
    });

    it("says the new password does not meet the rules and focuses it, keeping the rules described", async () => {
      const o = await open(locale);
      fill(o, { current: CURRENT, next: "short", repeat: "short" });

      fireEvent.submit(o.form);

      const message = await within(o.card).findByText(o.w.nextRules);
      const hint = within(o.card).getByText(o.messages.auth.passwordHint);
      expect(o.next).toHaveAttribute("aria-invalid", "true");
      expect(o.next.getAttribute("aria-describedby")?.split(" ")).toEqual([message.id, hint.id]);
      expect(o.next).toHaveFocus();
      expect(passwordCalls()).toHaveLength(0);
    });

    it.each([
      ["no uppercase letter", "newpassword456!"],
      ["no lowercase letter", "NEWPASSWORD456!"],
      ["no digit", "NewPasswordOnly!"],
      ["more than 128 characters", `Aa1${"x".repeat(126)}`]
    ])("applies the sign-up rules: %s", async (_label, password) => {
      const o = await open(locale);
      fill(o, { current: CURRENT, next: password, repeat: password });

      fireEvent.submit(o.form);

      expect(await within(o.card).findByText(o.w.nextRules)).toBeInTheDocument();
      expect(passwordCalls()).toHaveLength(0);
    });

    it("asks for the current password and focuses it first when several fields are wrong", async () => {
      const o = await open(locale);

      fireEvent.submit(o.form);

      expect(await within(o.card).findByText(o.w.currentRequired)).toBeInTheDocument();
      expect(within(o.card).getByText(o.w.nextRules)).toBeInTheDocument();
      expect(o.current).toHaveAttribute("aria-invalid", "true");
      expect(o.current).toHaveFocus();
      expect(passwordCalls()).toHaveLength(0);
    });

    it("takes a message away when its field is edited", async () => {
      const o = await open(locale);
      fill(o, { current: CURRENT, next: NEXT, repeat: "different" });
      fireEvent.submit(o.form);
      await within(o.card).findByText(o.w.mismatch);

      fireEvent.change(o.repeat, { target: { value: NEXT } });

      expect(within(o.card).queryByText(o.w.mismatch)).toBeNull();
      expect(o.repeat).not.toHaveAttribute("aria-invalid");
      expect(o.repeat).not.toHaveAttribute("aria-describedby");
    });
  });

  describe("changing the password", () => {
    it("sends exactly the current and the new password, then shows the status line and clears the fields", async () => {
      const o = await open(locale);
      fillValid(o);

      fireEvent.submit(o.form);

      const status = await within(o.card).findByRole("status");
      expect(status).toHaveTextContent(o.w.changed);
      expect(passwordCalls()).toHaveLength(1);
      const [, init] = passwordCalls()[0] as [string, RequestInit];
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({ currentPassword: CURRENT, newPassword: NEXT });
      expect(o.current).toHaveValue("");
      expect(o.next).toHaveValue("");
      expect(o.repeat).toHaveValue("");
      expect(within(o.card).queryByRole("alert")).toBeNull();
    });

    it("keeps the button disabled while the request runs and enables it again afterwards", async () => {
      const o = await open(locale);
      let finish: (value: unknown) => void = () => undefined;
      serve(() => new Promise((resolve) => (finish = resolve)));
      fillValid(o);

      fireEvent.submit(o.form);
      await waitFor(() => expect(o.submitButton).toBeDisabled());
      // The label says what is going on, like the other buttons on this screen.
      expect(o.submitButton).toHaveTextContent(o.w.saving);
      expect(o.submitButton).toHaveAttribute("aria-busy", "true");
      // A second submit while the first is running sends nothing more.
      fireEvent.submit(o.form);
      expect(passwordCalls()).toHaveLength(1);

      await act(async () => finish({ changed: true }));
      await waitFor(() => expect(o.submitButton).toBeEnabled());
      expect(o.submitButton).toHaveTextContent(o.w.submit);
      expect(o.submitButton).not.toHaveTextContent(o.w.saving);
      expect(within(o.card).getByRole("status")).toHaveTextContent(o.w.changed);
    });

    it("takes the success line away as soon as a new attempt starts, also when the screen stops it before sending", async () => {
      const o = await open(locale);
      fillValid(o);
      fireEvent.submit(o.form);
      await within(o.card).findByRole("status");

      // The repeat does not match: a local error, nothing is sent, and the old "Password changed" must not stay beside it.
      fill(o, { current: CURRENT, next: NEXT, repeat: `${NEXT}x` });
      fireEvent.submit(o.form);

      expect(await within(o.card).findByText(o.w.mismatch)).toBeInTheDocument();
      expect(within(o.card).queryByRole("status")).toBeNull();
      expect(within(o.card).queryByText(o.w.changed)).toBeNull();
      expect(passwordCalls()).toHaveLength(1);
    });

    it("takes an earlier error line away as soon as a new attempt starts, also when the screen stops it before sending", async () => {
      const o = await open(locale);
      serve(reject(500, "INTERNAL_SERVER_ERROR"));
      fillValid(o);
      fireEvent.submit(o.form);
      await within(o.card).findByText(o.w.failed);

      fill(o, { repeat: `${NEXT}x` });
      fireEvent.submit(o.form);

      expect(await within(o.card).findByText(o.w.mismatch)).toBeInTheDocument();
      expect(within(o.card).queryByText(o.w.failed)).toBeNull();
      expect(passwordCalls()).toHaveLength(1);
    });

    it("lets the person try again after a refusal: the button works again and the second request goes out", async () => {
      const o = await open(locale);
      serve(reject(403, "PASSWORD_CHANGE_CURRENT_INVALID"));
      fillValid(o);
      fireEvent.submit(o.form);
      await within(o.card).findByText(o.w.currentInvalid);
      await waitFor(() => expect(o.submitButton).toBeEnabled());

      serve();
      fireEvent.click(o.submitButton);

      expect(await within(o.card).findByRole("status")).toHaveTextContent(o.w.changed);
      expect(passwordCalls()).toHaveLength(2);
      expect(within(o.card).queryByText(o.w.currentInvalid)).toBeNull();
      expect(o.current).not.toHaveAttribute("aria-invalid");
    });
  });

  describe("what the route answers", () => {
    it("wrong current password: its own sentence on the current field, focus there, the fields stay filled", async () => {
      const o = await open(locale);
      serve(reject(403, "PASSWORD_CHANGE_CURRENT_INVALID"));
      fillValid(o);

      fireEvent.submit(o.form);

      const message = await within(o.card).findByText(o.w.currentInvalid);
      expect(o.current).toHaveAttribute("aria-invalid", "true");
      expect(o.current.getAttribute("aria-describedby")).toBe(message.id);
      expect(o.current).toHaveFocus();
      expect(o.current).toHaveValue(CURRENT);
      expect(within(o.card).queryByRole("status")).toBeNull();
      await waitFor(() => expect(o.submitButton).toBeEnabled());
    });

    it("same as the current password for the account (the server's verdict): its own sentence on the new field, focus there", async () => {
      const o = await open(locale);
      serve(reject(422, "PASSWORD_CHANGE_SAME"));
      // Two different texts that bcrypt cannot tell apart (they share the first 72 bytes): only the server can say so.
      const shared = `Aa1${"x".repeat(69)}`;
      fill(o, { current: `${shared}TAIL-ONE`, next: `${shared}TAIL-TWO`, repeat: `${shared}TAIL-TWO` });

      fireEvent.submit(o.form);

      const message = await within(o.card).findByText(o.w.nextSame);
      expect(o.next).toHaveAttribute("aria-invalid", "true");
      expect(o.next.getAttribute("aria-describedby")?.split(" ")[0]).toBe(message.id);
      expect(o.next).toHaveFocus();
      expect(passwordCalls()).toHaveLength(1);
      await waitFor(() => expect(o.submitButton).toBeEnabled());
    });

    it("too many attempts (429): an alert with its own sentence, which also names the way out", async () => {
      const o = await open(locale);
      serve(reject(429, "RATE_LIMITED"));
      fillValid(o);

      fireEvent.submit(o.form);

      expect(await within(o.card).findByRole("alert")).toHaveTextContent(o.w.tooMany);
      await waitFor(() => expect(o.submitButton).toBeEnabled());
    });

    it("a bare 429 with no code of ours is still the 'too many attempts' sentence, not the shared rate-limit one", async () => {
      const o = await open(locale);
      serve(reject(429, "REQUEST_FAILED"));
      fillValid(o);

      fireEvent.submit(o.form);

      expect(await within(o.card).findByRole("alert")).toHaveTextContent(o.w.tooMany);
    });

    it("the shared demo account: an alert with its own sentence", async () => {
      const o = await open(locale);
      serve(reject(403, "PASSWORD_CHANGE_DEMO_ACCOUNT"));
      fillValid(o);

      fireEvent.submit(o.form);

      expect(await within(o.card).findByRole("alert")).toHaveTextContent(o.w.demoAccount);
    });

    it("a rule the server rejected on the new password: the screen's rules sentence, not the server's", async () => {
      const o = await open(locale);
      serve(reject(422, "VALIDATION_ERROR", { fieldErrors: { newPassword: ["Password must include a number"] } }));
      fillValid(o);

      fireEvent.submit(o.form);

      expect(await within(o.card).findByText(o.w.nextRules)).toBeInTheDocument();
      expect(o.next).toHaveFocus();
      expect(document.body.textContent).not.toContain("Password must include a number");
    });

    it("a rule the server rejected on the current password: the screen's own sentence on the current field, not the server's", async () => {
      const o = await open(locale);
      serve(reject(422, "VALIDATION_ERROR", { fieldErrors: { currentPassword: ["Too small: expected string to have >=1 characters"] } }));
      fillValid(o);

      fireEvent.submit(o.form);

      const message = await within(o.card).findByText(o.w.currentInvalid);
      expect(o.current).toHaveAttribute("aria-invalid", "true");
      expect(o.current.getAttribute("aria-describedby")).toBe(message.id);
      expect(o.current).toHaveFocus();
      expect(o.next).not.toHaveAttribute("aria-invalid");
      expect(document.body.textContent).not.toContain("expected string");
    });

    it("an unexpected failure: the screen's fallback sentence", async () => {
      const o = await open(locale);
      serve(reject(500, "INTERNAL_SERVER_ERROR"));
      fillValid(o);

      fireEvent.submit(o.form);

      expect(await within(o.card).findByRole("alert")).toHaveTextContent(o.w.failed);
      expect(document.body.textContent).not.toContain("The server's own English sentence");
      await waitFor(() => expect(o.submitButton).toBeEnabled());
    });

    it("no connection: the shared network sentence", async () => {
      const o = await open(locale);
      serve(() => {
        throw new TypeError("Failed to fetch");
      });
      fillValid(o);

      fireEvent.submit(o.form);

      expect(await within(o.card).findByRole("alert")).toHaveTextContent(o.w.network);
      await waitFor(() => expect(o.submitButton).toBeEnabled());
    });

    it("a signed-out answer (401) replaces the page with the sign-in state, like every other action on this screen", async () => {
      const o = await open(locale);
      serve(reject(401, "UNAUTHORIZED"));
      fillValid(o);

      fireEvent.submit(o.form);

      await waitFor(() => expect(document.querySelector(`a[href="/${locale}/login"]`)).not.toBeNull());
      expect(document.body.textContent).not.toContain("The server's own English sentence");
    });
  });
});

describe("Settings password card (Persian page)", () => {
  it("has no English sentence in the card, in the rest state or with every message showing", async () => {
    const o = await open("fa");
    // The sign-up rules wording names the letters it asks for (A-Z, a-z, 0-9); that is not an English word.
    const englishWords = (text: string) => text.replace(/\b[A-Za-z0-9]-[A-Za-z0-9]\b/g, "").match(/[A-Za-z]{2,}/g) ?? [];

    expect(englishWords(o.card.textContent ?? "")).toEqual([]);

    fireEvent.submit(o.form);
    await within(o.card).findByText(o.w.currentRequired);
    expect(englishWords(o.card.textContent ?? "")).toEqual([]);

    for (const [status, code] of [[429, "RATE_LIMITED"], [403, "PASSWORD_CHANGE_DEMO_ACCOUNT"], [500, "INTERNAL_SERVER_ERROR"], [403, "SOMETHING_NEW"]] as const) {
      serve(reject(status, code));
      fillValid(o);
      fireEvent.submit(o.form);
      await within(o.card).findByRole("alert");
      expect(englishWords(o.card.textContent ?? "")).toEqual([]);
    }

    // The screen's own checks: the new password equal to the current one, and a repeat that does not match.
    fill(o, { current: CURRENT, next: CURRENT, repeat: CURRENT });
    fireEvent.submit(o.form);
    await within(o.card).findByText(o.w.nextSame);
    expect(englishWords(o.card.textContent ?? "")).toEqual([]);

    fill(o, { current: CURRENT, next: NEXT, repeat: `${NEXT}x` });
    fireEvent.submit(o.form);
    await within(o.card).findByText(o.w.mismatch);
    expect(englishWords(o.card.textContent ?? "")).toEqual([]);
  });
});
