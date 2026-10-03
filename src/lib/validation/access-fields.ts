/**
 * The fixed values of an access request. Kept apart from the zod schema (src/lib/validation/access.ts) so the browser
 * screens can use the same limits and lists without loading zod.
 */

/** What the person trades with: MT5, another platform, or a manual journal. */
export const tradingPlatforms = ["mt5", "other", "manual"] as const;
export type TradingPlatform = (typeof tradingPlatforms)[number];

/** Where a request stands. Only an admin changes it. */
export const accessRequestStatuses = ["new", "invited", "declined"] as const;
export type AccessRequestStatus = (typeof accessRequestStatuses)[number];

/**
 * The server's message when a field holds a character it refuses; the request-access form recognises it to say so in
 * the page language instead of its generic "check this field" line.
 */
export const CONTROL_CHARACTERS_MESSAGE = "Contains control or direction-changing characters";

/**
 * True when `text` holds a character that must not be stored or shown in a name or note: C0 and C1 control characters
 * (a NUL byte makes PostgreSQL refuse the row), DEL, the line and paragraph separators, and the bidirectional embedding,
 * override and isolate characters (U+202A to U+202E, U+2066 to U+2069), which can reorder the text on the admin screen.
 * A line feed is allowed when `allowNewline` is set (the note). Zero-width non-joiner and joiner (Persian half-spaces)
 * and the left-to-right and right-to-left marks are ordinary text and stay allowed.
 */
export function hasForbiddenCharacter(text: string, allowNewline = false): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x0a && allowNewline) continue;
    if (
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x2028 ||
      code === 0x2029 ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    ) {
      return true;
    }
  }
  return false;
}

export const ACCESS_NAME_MIN = 2;
export const ACCESS_NAME_MAX = 80;
export const ACCESS_NOTE_MAX = 500;
