import type { Locale } from "@/lib/i18n/locales";

const text = {
  en: {
    network: "Could not reach the server. Check your connection and try again.",
    rateLimited: "Too many attempts. Try again later.",
    invalidFields: "Some values are not valid. Check these fields:",
    invalid: "Some values are not valid. Check the fields and try again."
  },
  fa: {
    network: "اتصال به سرور برقرار نشد. اینترنت خود را بررسی کنید و دوباره تلاش کنید.",
    rateLimited: "تعداد تلاش‌ها زیاد بود. کمی بعد دوباره تلاش کنید.",
    invalidFields: "برخی مقادیر معتبر نیستند. این فیلدها را بررسی کنید:",
    invalid: "برخی مقادیر معتبر نیستند. فیلدها را بررسی کنید و دوباره تلاش کنید."
  }
} as const;

type ApiErrorParts = { status: number; code: string | null; fieldErrors: Record<string, unknown> };

/** Reads the fields of the client's ApiClientError without importing it (a plain object with a status works the same). */
function apiErrorParts(error: unknown): ApiErrorParts | null {
  if (!(error instanceof Error)) return null;
  const { status, code, details } = error as unknown as { status?: unknown; code?: unknown; details?: unknown };
  if (typeof status !== "number") return null;
  const fieldErrors = (details as { fieldErrors?: unknown } | null | undefined)?.fieldErrors;
  return {
    status,
    code: typeof code === "string" ? code : null,
    fieldErrors: fieldErrors && typeof fieldErrors === "object" ? (fieldErrors as Record<string, unknown>) : {}
  };
}

/** The server's error code (for example "ACCOUNT_DELETE_PASSWORD_INVALID"), for screens that word their own codes; null when there is none. */
export function apiErrorCode(error: unknown): string | null {
  return apiErrorParts(error)?.code ?? null;
}

/** The names of the fields the server rejected (zod's flattened fieldErrors keys). */
export function rejectedFields(error: unknown): string[] {
  const parts = apiErrorParts(error);
  if (!parts) return [];
  return Object.entries(parts.fieldErrors)
    .filter(([, messages]) => Array.isArray(messages) && messages.length > 0)
    .map(([name]) => name);
}

/** The server's own messages for the rejected fields, flattened (they are English; use them only to recognise a rule). */
export function rejectedMessages(error: unknown): string[] {
  const parts = apiErrorParts(error);
  if (!parts) return [];
  return Object.values(parts.fieldErrors).flatMap((messages) => (Array.isArray(messages) ? messages.filter((message): message is string => typeof message === "string") : []));
}

/**
 * The line to show for a failed request, in the page language. A validation failure (code VALIDATION_ERROR, or any
 * response that lists rejected fields) names them through `fieldLabels` (a field with no label is left out rather than
 * printed raw); other failures use the screen's own `fallback`. The server's English message is only passed through on
 * the English page, for client errors.
 */
export function apiErrorText(error: unknown, locale: Locale, fallback: string, fieldLabels: Record<string, string> = {}): string {
  const c = text[locale];
  const parts = apiErrorParts(error);
  if (!parts) {
    if (error instanceof TypeError) return c.network;
    // The English page keeps showing a plain error's own message; the Persian page never shows English text.
    return locale === "en" && error instanceof Error && error.message ? error.message : fallback;
  }

  const rejected = rejectedFields(error);
  if (parts.code === "VALIDATION_ERROR" || rejected.length > 0) {
    const labels = rejected.map((name) => fieldLabels[name]).filter((label): label is string => Boolean(label));
    return labels.length > 0 ? `${c.invalidFields} ${labels.join(locale === "fa" ? "، " : ", ")}` : c.invalid;
  }
  if (parts.status === 429) return c.rateLimited;
  if (locale === "en" && parts.status >= 400 && parts.status < 500 && (error as Error).message) return (error as Error).message;
  return fallback;
}
