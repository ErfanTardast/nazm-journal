import type { getMessages } from "@/lib/i18n/messages";

type Messages = ReturnType<typeof getMessages>;
type ErrorKey = keyof Messages["auth"]["errors"];

/** Read the ApiClientError fields without importing the client (a plain object with a `code` works the same). */
function apiErrorParts(error: unknown): { code: string; status: number | null; fieldErrors: Record<string, unknown> } | null {
  const { code, status, details } = (error ?? {}) as { code?: unknown; status?: unknown; details?: unknown };
  if (!(error instanceof Error) || typeof code !== "string") return null;
  const fieldErrors = (details as { fieldErrors?: unknown } | null | undefined)?.fieldErrors;
  return {
    code,
    status: typeof status === "number" ? status : null,
    fieldErrors: fieldErrors && typeof fieldErrors === "object" ? (fieldErrors as Record<string, unknown>) : {}
  };
}

/** The API error code of a failed request, or null when the error did not come from the API. */
export function apiErrorCode(error: unknown) {
  return apiErrorParts(error)?.code ?? null;
}

function has(fieldErrors: Record<string, unknown>, field: string) {
  const value = fieldErrors[field];
  return Array.isArray(value) && value.length > 0;
}

/**
 * The line shown under the sign-in / sign-up form for a failed request: a localized message chosen by the API error
 * code (never the server's English text), naming the failing field when the server says which one it was.
 */
export function authErrorMessage(error: unknown, messages: Messages, mode: "login" | "register"): string {
  const errors = messages.auth.errors;
  const pick = (key: ErrorKey) => errors[key];

  const parts = apiErrorParts(error);
  if (!parts) return error instanceof TypeError ? pick("NETWORK") : pick("GENERIC");

  const { code, status, fieldErrors } = parts;
  if (code === "VALIDATION_ERROR") {
    if (has(fieldErrors, "totpCode")) return pick("TWO_FACTOR_REQUIRED");
    if (has(fieldErrors, "password")) return pick(mode === "register" ? "VALIDATION_password" : "VALIDATION_passwordRequired");
    if (has(fieldErrors, "email")) return pick("VALIDATION_email");
    if (has(fieldErrors, "name")) return pick("VALIDATION_name");
    if (has(fieldErrors, "inviteCode")) return pick("INVITE_REQUIRED");
    return pick("VALIDATION_ERROR");
  }
  if (status === 429) return pick("RATE_LIMITED");

  switch (code) {
    case "INVALID_CREDENTIALS":
    case "EMAIL_ALREADY_EXISTS":
    case "INVITE_REQUIRED":
    case "REGISTRATION_CLOSED":
    case "RATE_LIMITED":
    case "TWO_FACTOR_REQUIRED":
      return pick(code);
    default:
      return pick("GENERIC");
  }
}
