/**
 * Largest request bodies the routes read (readJson's maxBytes; a bigger body gets 413). Every route that answers
 * without a session sets one, so nobody can make the server buffer an unbounded body; tests/unit/public-body-limits
 * checks that and that the largest valid body of each kind still fits.
 */
export const BODY_LIMITS = {
  /** Sign-in, sign-up and password reset: a few short fields. */
  auth: 4 * 1024,
  /** The public risk calculators: a handful of numbers. */
  calculator: 16 * 1024,
  /** A CSV import: the schema allows 500,000 characters, up to about 1.5 MB in UTF-8. */
  tradeImport: 2 * 1024 * 1024
} as const;
