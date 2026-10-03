"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionPanel } from "@/components/ui/section-panel";
import { NoteLine, type Note } from "@/features/settings/note-line";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorCode, apiErrorText, rejectedFields } from "@/lib/api/error-text";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";

type Messages = ReturnType<typeof getMessages>;
type FieldName = "current" | "next" | "repeat";
type FieldErrors = Partial<Record<FieldName, string>>;

const copy = {
  en: {
    title: "Password",
    description: "Change the password you sign in with. Your other devices are signed out when you do.",
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
    // The account is locked for the window, the right password included: name the way out for someone whose session was taken.
    tooMany: "Too many attempts. Try again in about 15 minutes, or sign out and follow the password reset note on the sign-in page.",
    demoAccount: "This is the shared demo account, so its password cannot be changed.",
    failed: "The password could not be changed. Try again in a moment."
  },
  fa: {
    title: "رمز عبور",
    description: "رمز عبوری را که با آن وارد می‌شوید تغییر دهید. با این کار، دستگاه‌های دیگر از حساب خارج می‌شوند.",
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
    failed: "تغییر رمز عبور انجام نشد. کمی بعد دوباره تلاش کنید."
  }
} as const;

const PASSWORD_MAX_LENGTH = 128;

/** The sign-up rules (src/lib/validation/auth.ts): 12 to 128 characters with an uppercase letter, a lowercase letter and a digit. */
function meetsPasswordRules(password: string) {
  return password.length >= 12 && password.length <= PASSWORD_MAX_LENGTH && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password);
}

/** The card for changing the password while signed in. A signed-out answer (401) is handed to the screen through `onSignedOut`. */
export function PasswordCard({ locale, messages, onSignedOut }: { locale: Locale; messages: Messages; onSignedOut: () => void }) {
  const c = copy[locale];
  const baseId = useId();
  const ids = {
    current: `${baseId}-current`,
    next: `${baseId}-next`,
    repeat: `${baseId}-repeat`,
    nextHint: `${baseId}-next-hint`,
    currentError: `${baseId}-current-error`,
    nextError: `${baseId}-next-error`,
    repeatError: `${baseId}-repeat-error`
  };
  const inputs = {
    current: useRef<HTMLInputElement>(null),
    next: useRef<HTMLInputElement>(null),
    repeat: useRef<HTMLInputElement>(null)
  };
  const [values, setValues] = useState({ current: "", next: "", repeat: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [note, setNote] = useState<Note | null>(null);
  const [saving, setSaving] = useState(false);

  function edit(field: FieldName, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
    // A message goes away once its field is edited; the mismatch belongs to the repeat field but depends on the new one too.
    setErrors((previous) => ({ ...previous, [field]: undefined, ...(field === "next" ? { repeat: undefined } : {}) }));
  }

  /** Shows the field messages and moves focus to the first field (top to bottom) that has one. */
  function showErrors(next: FieldErrors) {
    setErrors(next);
    const first = (["current", "next", "repeat"] as const).find((field) => next[field]);
    if (first) inputs[first].current?.focus();
  }

  function localErrors(): FieldErrors {
    const found: FieldErrors = {};
    if (!values.current) found.current = c.currentRequired;
    if (!meetsPasswordRules(values.next)) found.next = c.nextRules;
    // The server would say so too, but only after it used one of the five attempts a quarter of an hour allows.
    else if (values.next === values.current) found.next = c.nextSame;
    else if (values.repeat !== values.next) found.repeat = c.mismatch;
    return found;
  }

  /** What the route refused, in this screen's own words; a code the screen does not word goes through apiErrorText. */
  function applyServerError(error: unknown) {
    const code = apiErrorCode(error);
    const rejected = rejectedFields(error);
    if (code === "PASSWORD_CHANGE_CURRENT_INVALID") {
      showErrors({ current: c.currentInvalid });
    } else if (code === "PASSWORD_CHANGE_SAME") {
      showErrors({ next: c.nextSame });
    } else if (code === "VALIDATION_ERROR" && rejected.some((name) => name === "currentPassword" || name === "newPassword")) {
      showErrors({
        ...(rejected.includes("currentPassword") ? { current: c.currentInvalid } : {}),
        ...(rejected.includes("newPassword") ? { next: c.nextRules } : {})
      });
    } else {
      setErrors({});
      if (code === "PASSWORD_CHANGE_DEMO_ACCOUNT") setNote({ kind: "error", text: c.demoAccount });
      else if (code === "RATE_LIMITED" || (error as { status?: unknown } | null)?.status === 429) setNote({ kind: "error", text: c.tooMany });
      else setNote({ kind: "error", text: apiErrorText(error, locale, c.failed, { currentPassword: c.current, newPassword: c.next }) });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setNote(null);
    const found = localErrors();
    if (Object.keys(found).length > 0) return showErrors(found);
    setErrors({});

    setSaving(true);
    try {
      await apiFetch("/api/users/me/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: values.current, newPassword: values.next })
      });
      setValues({ current: "", next: "", repeat: "" });
      setNote({ kind: "status", text: c.changed });
    } catch (error) {
      if (isAuthError(error)) onSignedOut();
      else applyServerError(error);
    } finally {
      setSaving(false);
    }
  }

  const nextDescribedBy = errors.next ? `${ids.nextError} ${ids.nextHint}` : ids.nextHint;

  return (
    <SectionPanel title={c.title} description={c.description}>
      <form noValidate className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
        <div className="space-y-2 text-sm md:col-span-2">
          <label htmlFor={ids.current} className="block font-medium text-foreground">{c.current}</label>
          <Input
            ref={inputs.current}
            id={ids.current}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            maxLength={PASSWORD_MAX_LENGTH}
            value={values.current}
            onChange={(event) => edit("current", event.target.value)}
            aria-invalid={errors.current ? true : undefined}
            aria-describedby={errors.current ? ids.currentError : undefined}
          />
          <FieldError id={ids.currentError} text={errors.current} />
        </div>

        <div className="space-y-2 text-sm">
          <label htmlFor={ids.next} className="block font-medium text-foreground">{c.next}</label>
          <Input
            ref={inputs.next}
            id={ids.next}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            value={values.next}
            onChange={(event) => edit("next", event.target.value)}
            aria-invalid={errors.next ? true : undefined}
            aria-describedby={nextDescribedBy}
          />
          <FieldError id={ids.nextError} text={errors.next} />
          <p id={ids.nextHint} className="text-xs leading-5 text-muted-foreground">{t(messages, "auth.passwordHint")}</p>
        </div>

        <div className="space-y-2 text-sm">
          <label htmlFor={ids.repeat} className="block font-medium text-foreground">{c.repeat}</label>
          <Input
            ref={inputs.repeat}
            id={ids.repeat}
            name="repeatPassword"
            type="password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            value={values.repeat}
            onChange={(event) => edit("repeat", event.target.value)}
            aria-invalid={errors.repeat ? true : undefined}
            aria-describedby={errors.repeat ? ids.repeatError : undefined}
          />
          <FieldError id={ids.repeatError} text={errors.repeat} />
        </div>

        <NoteLine note={note} className="md:col-span-2" />

        <Button type="submit" className="md:col-span-2" disabled={saving} aria-busy={saving}>
          <KeyRound className="me-2 size-4" aria-hidden="true" />
          {saving ? c.saving : c.submit}
        </Button>
      </form>
    </SectionPanel>
  );
}

function FieldError({ id, text }: { id: string; text: string | undefined }) {
  // An alert, so it is read out when it appears even if focus does not move (Enter pressed in the field that has the error).
  return text ? <p id={id} role="alert" className="text-xs text-destructive">{text}</p> : null;
}
