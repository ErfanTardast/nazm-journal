const PERSIAN_ZERO = 0x06f0;
const ARABIC_INDIC_ZERO = 0x0660;

// "1,250.5" / "1 250" style digit groups. Only these commas and spaces are dropped: "0,5" is a decimal
// comma in some locales, and reading it as 5 would silently change the value, so it is left to fail validation.
const GROUPED_DIGITS = /^[+-]?\d{1,3}(?:[,\u060c\u066c\s\u00a0\u202f]\d{3})+(?:\.\d+)?$/;
// Invisible direction marks that ride along when a value is copied from right-to-left text.
const DIRECTION_MARKS = /[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g;

/**
 * Makes typed numeric text readable by Number(): Persian (۰-۹) and Arabic-Indic (٠-٩) digits become ASCII,
 * the Persian decimal separator "٫" becomes ".", invisible direction marks are removed, and comma, "٬" or
 * space separators are dropped only between proper three-digit groups. Anything that is not a string (numbers,
 * null, undefined) is returned unchanged.
 */
export function normalizeNumberInput(value: unknown): unknown {
  if (typeof value !== "string") return value;
  let text = value
    .replace(DIRECTION_MARKS, "")
    .trim()
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - PERSIAN_ZERO))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - ARABIC_INDIC_ZERO))
    .replace(/\u066b/g, ".")
    .replace(/\u2212/g, "-");
  if (GROUPED_DIGITS.test(text)) {
    text = text.replace(/[,\u060c\u066c\s\u00a0\u202f]/g, "");
  }
  return text;
}

/** Persian (۰-۹) and Arabic-Indic (٠-٩) digits as ASCII, everything else unchanged (for codes like 2FA). */
export function toAsciiDigits(text: string): string {
  return text
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - PERSIAN_ZERO))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - ARABIC_INDIC_ZERO));
}

/** Number(...) of normalized input, for client code that reads typed text (NaN when it is not a number). */
export function parseNumberInput(value: unknown): number {
  return Number(normalizeNumberInput(value));
}
