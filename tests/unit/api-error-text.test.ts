import { describe, expect, it } from "vitest";
import { apiErrorCode, apiErrorText } from "@/lib/api/error-text";

/** A failed API call as the client throws it (the helper reads status/code/details, so a plain object works). */
function apiError(status: number, code: string, message: string, details: unknown = {}) {
  return Object.assign(new Error(message), { name: "ApiClientError", status, code, details });
}

const labels = { entryPrice: "قیمت ورود", stopLoss: "حد ضرر" };

describe("apiErrorText", () => {
  it("names the rejected fields in Persian instead of the server's English validation text", () => {
    const error = apiError(422, "VALIDATION_ERROR", "Request validation failed", { fieldErrors: { stopLoss: ["Too small"], entryPrice: ["Invalid"] } });
    const text = apiErrorText(error, "fa", "ذخیره ممکن نشد.", labels);
    expect(text).not.toMatch(/validation/i);
    expect(text).toContain("حد ضرر");
    expect(text).toContain("قیمت ورود");
    expect(text).toContain("،");
  });

  it("does not print a raw field name it has no label for", () => {
    const error = apiError(422, "VALIDATION_ERROR", "Request validation failed", { fieldErrors: { somethingElse: ["Required"] } });
    const text = apiErrorText(error, "fa", "ذخیره ممکن نشد.", labels);
    expect(text).not.toMatch(/somethingElse/);
    expect(text).not.toMatch(/[A-Za-z]{3,}/);
  });

  it("falls back to a localized sentence when the server names no field", () => {
    const error = apiError(422, "VALIDATION_ERROR", "Request validation failed");
    expect(apiErrorText(error, "fa", "ذخیره ممکن نشد.")).not.toMatch(/[A-Za-z]{3,}/);
    expect(apiErrorText(error, "en", "Could not save.")).toMatch(/not valid/i);
  });

  it("says in the page language when too many requests were sent, without promising a wait time", () => {
    const error = apiError(429, "RATE_LIMITED", "Too many requests");
    expect(apiErrorText(error, "fa", "ذخیره ممکن نشد.")).not.toMatch(/[A-Za-z]{3,}/);
    expect(apiErrorText(error, "en", "Could not save.")).toBe("Too many attempts. Try again later.");
    expect(apiErrorText(error, "fa", "ذخیره ممکن نشد.")).toBe("تعداد تلاش‌ها زیاد بود. کمی بعد دوباره تلاش کنید.");
  });

  // DELETE /api/users/me answers 422 with a specific code and no field errors: it is not a field-validation failure.
  it("does not treat a 422 with its own code and no rejected fields as field validation", () => {
    const error = apiError(422, "ACCOUNT_DELETE_CONFIRMATION_MISMATCH", "Confirmation email does not match this account.");
    expect(apiErrorText(error, "en", "Could not delete.")).toBe("Confirmation email does not match this account.");
    expect(apiErrorText(error, "fa", "حذف انجام نشد.")).toBe("حذف انجام نشد.");
  });

  it("still names the fields for a 422 that carries field errors, whatever its code", () => {
    const error = apiError(422, "UNPROCESSABLE", "Rejected", { fieldErrors: { stopLoss: ["Too small"] } });
    const text = apiErrorText(error, "fa", "ذخیره ممکن نشد.", labels);
    expect(text).toContain("حد ضرر");
    expect(text).not.toBe("ذخیره ممکن نشد.");
  });

  it("treats VALIDATION_ERROR as validation even on another status", () => {
    const error = apiError(400, "VALIDATION_ERROR", "Request validation failed");
    expect(apiErrorText(error, "en", "Could not save.")).toMatch(/not valid/i);
  });

  it("exposes the server's error code for screens that map their own codes", () => {
    expect(apiErrorCode(apiError(403, "ACCOUNT_DELETE_PASSWORD_INVALID", "Password confirmation failed."))).toBe("ACCOUNT_DELETE_PASSWORD_INVALID");
    expect(apiErrorCode(new Error("odd"))).toBeNull();
    expect(apiErrorCode("boom")).toBeNull();
  });

  it("reports an unreachable server (a fetch TypeError) in the page language", () => {
    const text = apiErrorText(new TypeError("Failed to fetch"), "fa", "ذخیره ممکن نشد.");
    expect(text).not.toMatch(/fetch/i);
    expect(text).toMatch(/[\u0600-\u06FF]/);
  });

  it("uses the screen's own message for server failures, never the English server text in Persian", () => {
    const error = apiError(500, "INTERNAL_SERVER_ERROR", "Unexpected server error");
    expect(apiErrorText(error, "fa", "ذخیره ممکن نشد.")).toBe("ذخیره ممکن نشد.");
    expect(apiErrorText(error, "en", "Could not save.")).toBe("Could not save.");
  });

  it("keeps the server's own message for other client errors on the English page", () => {
    const error = apiError(409, "CONFLICT", "The resource is already in that state");
    expect(apiErrorText(error, "en", "Could not save.")).toBe("The resource is already in that state");
    expect(apiErrorText(error, "fa", "ذخیره ممکن نشد.")).toBe("ذخیره ممکن نشد.");
  });

  it("uses the fallback for anything that is not an API error", () => {
    expect(apiErrorText("boom", "fa", "ذخیره ممکن نشد.")).toBe("ذخیره ممکن نشد.");
    expect(apiErrorText("boom", "en", "Could not save.")).toBe("Could not save.");
    expect(apiErrorText(new Error("odd"), "fa", "ذخیره ممکن نشد.")).toBe("ذخیره ممکن نشد.");
  });

  it("keeps a plain error's own message on the English page", () => {
    expect(apiErrorText(new Error("Strategy could not be saved"), "en", "Could not save.")).toBe("Strategy could not be saved");
  });
});
