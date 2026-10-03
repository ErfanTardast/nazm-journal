"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ContactEmail } from "@/features/access/contact-email-link";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import type { Locale } from "@/lib/i18n/locales";
import {
  ACCESS_NAME_MAX,
  ACCESS_NAME_MIN,
  ACCESS_NOTE_MAX,
  CONTROL_CHARACTERS_MESSAGE,
  hasForbiddenCharacter,
  tradingPlatforms,
  type TradingPlatform
} from "@/lib/validation/access-fields";

const copy = {
  en: {
    title: "Request access",
    description:
      "Nazm is in a private trial and accounts are created with an invite code. Leave a request here; if a place opens, we will send the invite code to your email.",
    name: "Name",
    email: "Email",
    platform: "How do you trade?",
    platformPlaceholder: "Choose one (optional)",
    platforms: { mt5: "MT5", other: "Another platform", manual: "Manual journal (no platform)" } as Record<TradingPlatform, string>,
    note: "Anything you want us to know (optional)",
    notePlaceholder: "For example, the markets you trade or what you want from a journal.",
    submit: "Request access",
    sending: "Sending…",
    honeypot: "Leave this field empty",
    successTitle: "Your request is recorded",
    successBody: "If a place opens, we will send the invite code to this address:",
    contactLine: "You can ask us to delete your request at",
    privacyLine: "We use your email only to answer this request.",
    privacyLink: "Privacy policy",
    haveCode: "Have an invite code? Create an account",
    errors: {
      name: `Enter your name (${ACCESS_NAME_MIN} to ${ACCESS_NAME_MAX} characters).`,
      email: "Enter a valid email address.",
      note: `The note can be at most ${ACCESS_NOTE_MAX} characters.`,
      chars: "Remove control or direction-changing characters from this field.",
      validation: "Some fields are not valid. Check them and try again.",
      rateLimited: "Too many requests from this connection. Try again in a while.",
      tooLarge: "That request is too large. Shorten the note and try again.",
      network: "Could not reach the server. Check your connection and try again.",
      generic: "Something went wrong. Try again in a little while."
    }
  },
  fa: {
    title: "درخواست دسترسی",
    description:
      "اپ نظم فعلاً در مرحله‌ی آزمایشی خصوصی است و حساب‌ها فقط با کد دعوت ساخته می‌شوند. درخواست‌تان را اینجا ثبت کنید؛ اگر جایی باز شد، کد دعوت را به ایمیل‌تان می‌فرستیم.",
    name: "نام",
    email: "ایمیل",
    platform: "چطور معامله می‌کنید؟",
    platformPlaceholder: "یکی را انتخاب کنید (اختیاری)",
    platforms: { mt5: "با متاتریدر ۵ (MT5)", other: "با پلتفرم دیگر", manual: "ژورنال دستی، بدون پلتفرم" } as Record<TradingPlatform, string>,
    note: "چیزی که می‌خواهید بدانیم (اختیاری)",
    notePlaceholder: "مثلاً بازارهایی که معامله می‌کنید یا انتظارتان از ژورنال.",
    submit: "ثبت درخواست",
    sending: "در حال ارسال…",
    honeypot: "این فیلد را خالی بگذارید",
    successTitle: "درخواست شما ثبت شد",
    successBody: "اگر جایی باز شود، کد دعوت را به این ایمیل می‌فرستیم:",
    contactLine: "برای حذف درخواست‌تان می‌توانید به این نشانی ایمیل بفرستید:",
    privacyLine: "ایمیل شما فقط برای پاسخ به همین درخواست استفاده می‌شود.",
    privacyLink: "حریم خصوصی",
    haveCode: "کد دعوت دارید؟ ساخت حساب",
    errors: {
      name: "نام را وارد کنید (۲ تا ۸۰ کاراکتر).",
      email: "یک نشانی ایمیل معتبر وارد کنید.",
      note: "توضیح می‌تواند حداکثر ۵۰۰ کاراکتر باشد.",
      chars: "نویسه‌های کنترلی یا تغییردهنده‌ی جهت متن را از این فیلد حذف کنید.",
      validation: "برخی فیلدها معتبر نیستند. آن‌ها را بررسی کنید و دوباره تلاش کنید.",
      rateLimited: "تعداد درخواست‌ها از این اتصال زیاد بوده است. کمی بعد دوباره تلاش کنید.",
      tooLarge: "درخواست بیش از حد بزرگ است. توضیح را کوتاه‌تر کنید و دوباره تلاش کنید.",
      network: "اتصال به سرور برقرار نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.",
      generic: "مشکلی پیش آمد. کمی بعد دوباره تلاش کنید."
    }
  }
} as const;

type Copy = (typeof copy)[Locale];
type Field = "name" | "email" | "note";
/** The order the fields appear in, so "the first invalid one" is the topmost. */
const FIELD_ORDER = ["name", "email", "note"] as const satisfies readonly Field[];
type FieldErrors = Partial<Record<Field, string>>;

// Same shape check the browser does for type="email"; the server's schema stays the authority.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkFields(values: Record<Field, string>, c: Copy): FieldErrors {
  const found: FieldErrors = {};
  if (values.name.length < ACCESS_NAME_MIN || values.name.length > ACCESS_NAME_MAX) found.name = c.errors.name;
  else if (hasForbiddenCharacter(values.name)) found.name = c.errors.chars;
  if (!EMAIL_SHAPE.test(values.email)) found.email = c.errors.email;
  if (values.note.length > ACCESS_NOTE_MAX) found.note = c.errors.note;
  else if (hasForbiddenCharacter(values.note, true)) found.note = c.errors.chars;
  return found;
}

/** A failed request as localized lines: the fields the server named, or one line for the whole form. */
function describeFailure(error: unknown, c: Copy): { fields: FieldErrors; form?: string } {
  if (!(error instanceof ApiClientError)) {
    return { fields: {}, form: error instanceof TypeError ? c.errors.network : c.errors.generic };
  }
  if (error.status === 429 || error.code === "RATE_LIMITED") return { fields: {}, form: c.errors.rateLimited };
  if (error.status === 413 || error.code === "PAYLOAD_TOO_LARGE") return { fields: {}, form: c.errors.tooLarge };
  if (error.code === "VALIDATION_ERROR") {
    const named = (error.details as { fieldErrors?: Record<string, unknown> } | null)?.fieldErrors ?? {};
    const fields: FieldErrors = {};
    for (const field of ["name", "email", "note"] as const) {
      const messages = named[field];
      if (Array.isArray(messages) && messages.length > 0) {
        fields[field] = field !== "email" && messages.includes(CONTROL_CHARACTERS_MESSAGE) ? c.errors.chars : c.errors[field];
      }
    }
    return Object.keys(fields).length ? { fields } : { fields: {}, form: c.errors.validation };
  }
  return { fields: {}, form: c.errors.generic };
}

/**
 * `contactEmail` is the public contact address (see contactEmail() in contact-email.ts), read on the server by the page.
 * Only when there is one does the success card say that deletion can be asked for there.
 */
export function RequestAccessScreen({ locale, contactEmail = null }: { locale: Locale; contactEmail?: string | null }) {
  const c = copy[locale];
  const digits = locale === "fa" ? "fa-IR" : "en-US";
  const ids = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [platform, setPlatform] = useState<TradingPlatform | "">("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // Before the page has loaded its script a native submit would send the form as a GET with the e-mail in the URL.
  const [hydrated, setHydrated] = useState(false);
  const fieldRefs = {
    name: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    note: useRef<HTMLTextAreaElement>(null)
  };
  const successHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  // After the request was sent, the form is gone: move focus to the heading of the card that replaced it, so keyboard
  // and screen-reader users land on the confirmation instead of at the top of an unchanged page.
  useEffect(() => {
    if (sentTo) successHeading.current?.focus();
  }, [sentTo]);

  /** After a failed submit, put the cursor in the first field that has an error (the message is tied to it by aria-describedby). */
  function focusFirstInvalid(fields: FieldErrors) {
    const first = FIELD_ORDER.find((field) => fields[field]);
    if (first) fieldRefs[first].current?.focus();
  }

  function edit(field: Field, set: (value: string) => void, value: string) {
    set(value);
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const values = { name: name.trim(), email: email.trim(), note: note.trim() };
    const found = checkFields(values, c);
    setFormError(null);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstInvalid(found);
      return;
    }

    setLoading(true);
    try {
      await apiFetch("/api/access-requests", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          ...(platform ? { tradingPlatform: platform } : {}),
          ...(values.note ? { note: values.note } : {}),
          locale,
          website
        })
      });
      setSentTo(values.email);
    } catch (error) {
      const failure = describeFailure(error, c);
      setErrors(failure.fields);
      setFormError(failure.form ?? null);
      focusFirstInvalid(failure.fields);
    } finally {
      setLoading(false);
    }
  }

  const fieldProps = (field: Field) => ({
    id: `${ids}-${field}`,
    "aria-required": field === "note" ? undefined : (true as const),
    "aria-invalid": errors[field] ? (true as const) : undefined,
    "aria-describedby": errors[field] ? `${ids}-${field}-error` : undefined
  });
  const fieldError = (field: Field) =>
    errors[field] ? (
      <p id={`${ids}-${field}-error`} className="text-xs text-destructive">
        {errors[field]}
      </p>
    ) : null;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={c.title} description={c.description} />
      {sentTo ? (
        <Card>
          <CardContent className="space-y-3" role="status">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
              <h2 ref={successHeading} tabIndex={-1} className="text-base font-semibold outline-none">
                {c.successTitle}
              </h2>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{c.successBody}</p>
            <p dir="ltr" className="break-all text-start text-sm font-semibold text-foreground">
              {sentTo}
            </p>
            {contactEmail ? (
              <p className="text-sm leading-6 text-muted-foreground">
                {c.contactLine} <ContactEmail email={contactEmail} />
                {locale === "en" ? "." : null}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <form className="space-y-4" onSubmit={submit} noValidate>
              <div className="space-y-2 text-sm">
                <label htmlFor={`${ids}-name`} className="block text-muted-foreground">
                  {c.name}
                </label>
                <Input
                  {...fieldProps("name")}
                  ref={fieldRefs.name}
                  value={name}
                  onChange={(event) => edit("name", setName, event.target.value)}
                  dir="auto"
                  autoComplete="name"
                  maxLength={ACCESS_NAME_MAX}
                />
                {fieldError("name")}
              </div>
              <div className="space-y-2 text-sm">
                <label htmlFor={`${ids}-email`} className="block text-muted-foreground">
                  {c.email}
                </label>
                <Input
                  {...fieldProps("email")}
                  ref={fieldRefs.email}
                  value={email}
                  onChange={(event) => edit("email", setEmail, event.target.value)}
                  type="email"
                  dir="ltr"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="name@example.com"
                />
                {fieldError("email")}
              </div>
              <div className="space-y-2 text-sm">
                <label htmlFor={`${ids}-platform`} className="block text-muted-foreground">
                  {c.platform}
                </label>
                <Select id={`${ids}-platform`} value={platform} onChange={(event) => setPlatform(event.target.value as TradingPlatform | "")}>
                  <option value="">{c.platformPlaceholder}</option>
                  {tradingPlatforms.map((value) => (
                    <option key={value} value={value}>
                      {c.platforms[value]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2 text-sm">
                <label htmlFor={`${ids}-note`} className="block text-muted-foreground">
                  {c.note}
                </label>
                <Textarea
                  {...fieldProps("note")}
                  ref={fieldRefs.note}
                  value={note}
                  onChange={(event) => edit("note", setNote, event.target.value)}
                  dir="auto"
                  maxLength={ACCESS_NOTE_MAX}
                  placeholder={c.notePlaceholder}
                />
                <div className="flex items-start justify-between gap-3">
                  <div>{fieldError("note")}</div>
                  <span dir="ltr" className="shrink-0 text-xs text-muted-foreground">
                    {`${note.length.toLocaleString(digits)}/${ACCESS_NOTE_MAX.toLocaleString(digits)}`}
                  </span>
                </div>
              </div>
              {/* Honeypot: people never see this field, so text in it means a script filled the form. */}
              <div aria-hidden="true" className="sr-only">
                <label>
                  {c.honeypot}
                  <input
                    type="text"
                    name="website"
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </label>
              </div>
              {formError ? (
                <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {formError}
                </p>
              ) : null}
              <Button className="w-full" disabled={loading || !hydrated}>
                {loading ? c.sending : c.submit}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
        {c.privacyLine}{" "}
        <Link href={`/${locale}/privacy`} className="font-semibold text-primary hover:underline">
          {c.privacyLink}
        </Link>
      </p>
      <p className="mt-3 text-center text-sm">
        <Link href={`/${locale}/register`} className="font-semibold text-primary hover:underline">
          {c.haveCode}
        </Link>
      </p>
    </div>
  );
}
