// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  accessRequestSchema,
  accessRequestStatusSchema,
  isHoneypotFilled,
  parseAccessRequest
} from "@/lib/validation/access";

const valid = { name: "Sara Trader", email: "sara@example.com", locale: "fa" } as const;

// Built from code points so this file holds no invisible characters.
const char = (code: number) => String.fromCodePoint(code);
const NUL = char(0x00);
const BELL = char(0x07);
const TAB = char(0x09);
const LF = char(0x0a);
const CR = char(0x0d);
const ESC = char(0x1b);
const DEL = char(0x7f);
const NEL = char(0x85);
const LINE_SEPARATOR = char(0x2028);
const BIDI_OVERRIDES = [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069].map(char);
const ZWNJ = char(0x200c);
const ZWJ = char(0x200d);
const LRM = char(0x200e);
const RLM = char(0x200f);

describe("accessRequestSchema", () => {
  it("accepts a name, an e-mail and a locale", () => {
    expect(accessRequestSchema.parse(valid)).toEqual(valid);
  });

  it("trims the name and trims and lower-cases the e-mail", () => {
    const parsed = accessRequestSchema.parse({ ...valid, name: "  سارا رضایی ", email: "  Sara@Example.COM " });
    expect(parsed.name).toBe("سارا رضایی");
    expect(parsed.email).toBe("sara@example.com");
  });

  it("needs a name of 2 to 80 characters", () => {
    expect(accessRequestSchema.safeParse({ ...valid, name: "a" }).success).toBe(false);
    expect(accessRequestSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
    expect(accessRequestSchema.safeParse({ ...valid, name: "ab" }).success).toBe(true);
    expect(accessRequestSchema.safeParse({ ...valid, name: "a".repeat(80) }).success).toBe(true);
    expect(accessRequestSchema.safeParse({ ...valid, name: "a".repeat(81) }).success).toBe(false);
    expect(accessRequestSchema.safeParse({ email: valid.email, locale: "fa" }).success).toBe(false);
  });

  it("needs a valid e-mail", () => {
    for (const email of ["", "sara", "sara@", "@example.com", "sara example@x.com"]) {
      expect(accessRequestSchema.safeParse({ ...valid, email }).success, email).toBe(false);
    }
    expect(accessRequestSchema.safeParse({ name: valid.name, locale: "fa" }).success).toBe(false);
  });

  it("takes an optional trading platform from a fixed list", () => {
    for (const tradingPlatform of ["mt5", "other", "manual"]) {
      expect(accessRequestSchema.parse({ ...valid, tradingPlatform }).tradingPlatform).toBe(tradingPlatform);
    }
    expect(accessRequestSchema.parse(valid).tradingPlatform).toBeUndefined();
    expect(accessRequestSchema.safeParse({ ...valid, tradingPlatform: "ctrader" }).success).toBe(false);
    expect(accessRequestSchema.safeParse({ ...valid, tradingPlatform: "" }).success).toBe(false);
  });

  it("takes an optional note, trimmed, of at most 500 characters", () => {
    expect(accessRequestSchema.parse({ ...valid, note: "  I trade MT5 on a demo account  " }).note).toBe("I trade MT5 on a demo account");
    expect(accessRequestSchema.safeParse({ ...valid, note: "a".repeat(500) }).success).toBe(true);
    expect(accessRequestSchema.safeParse({ ...valid, note: "a".repeat(501) }).success).toBe(false);
    // The limit is on the trimmed text: padding does not count.
    expect(accessRequestSchema.safeParse({ ...valid, note: `  ${"a".repeat(500)}  ` }).success).toBe(true);
  });

  it("reads a blank note as no note", () => {
    expect(accessRequestSchema.parse({ ...valid, note: "   " }).note).toBeUndefined();
    expect(accessRequestSchema.parse({ ...valid, note: "" }).note).toBeUndefined();
  });

  it("needs the locale to be fa or en", () => {
    expect(accessRequestSchema.parse({ ...valid, locale: "en" }).locale).toBe("en");
    expect(accessRequestSchema.safeParse({ ...valid, locale: "de" }).success).toBe(false);
    expect(accessRequestSchema.safeParse({ name: valid.name, email: valid.email }).success).toBe(false);
  });

  it("is strict: unknown fields are refused", () => {
    expect(accessRequestSchema.safeParse({ ...valid, status: "invited" }).success).toBe(false);
    expect(accessRequestSchema.safeParse({ ...valid, id: "x" }).success).toBe(false);
  });

  it("takes the honeypot field `website` only when it is empty or absent", () => {
    expect(accessRequestSchema.safeParse({ ...valid, website: "" }).success).toBe(true);
    expect(accessRequestSchema.safeParse({ ...valid, website: "   " }).success).toBe(true);
    expect(accessRequestSchema.safeParse(valid).success).toBe(true);
    expect(accessRequestSchema.safeParse({ ...valid, website: "https://spam.example" }).success).toBe(false);
  });
});

describe("control and direction-changing characters", () => {
  describe("in the name", () => {
    it.each([
      ["a NUL byte at the end", `ab${NUL}`],
      ["a NUL byte in the middle", `a${NUL}b`],
      ["a right-to-left override first (U+202E)", `${char(0x202e)}Sara`],
      ["a bell", `Sa${BELL}ra`],
      ["an escape", `Sa${ESC}ra`],
      ["a tab in the middle", `Sara${TAB}Trader`],
      ["a line feed in the middle", `Sara${LF}Trader`],
      ["a carriage return in the middle", `Sara${CR}Trader`],
      ["a delete character", `Sa${DEL}ra`],
      ["a C1 control (next line)", `Sa${NEL}ra`],
      ["a line separator", `Sara${LINE_SEPARATOR}Trader`]
    ])("refuses %s", (_label, name) => {
      expect(accessRequestSchema.safeParse({ ...valid, name }).success).toBe(false);
    });

    it.each(BIDI_OVERRIDES.map((c) => [`U+${c.codePointAt(0)!.toString(16).toUpperCase()}`, c]))("refuses the direction character %s", (_label, c) => {
      expect(accessRequestSchema.safeParse({ ...valid, name: `Sara ${c} Trader` }).success).toBe(false);
    });

    it("names the field in the error, so the page can point at it", () => {
      const result = accessRequestSchema.safeParse({ ...valid, name: `ab${NUL}` });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.flatten().fieldErrors).toHaveProperty("name");
    });

    it("still accepts Persian names with half-spaces and the direction marks people paste", () => {
      for (const name of [`سارا${ZWNJ}رضایی`, `می${ZWNJ}شود`, `Sara${ZWJ}Trader`, `${RLM}سارا${RLM}`, `Sara${LRM}`, "Ana-María O'Neil", "李小龙"]) {
        expect(accessRequestSchema.safeParse({ ...valid, name }).success, name).toBe(true);
      }
    });
  });

  describe("in the note", () => {
    it.each([
      ["a NUL byte", `I trade${NUL}MT5`],
      ["a right-to-left override (U+202E)", `${char(0x202e)}I trade MT5`],
      ["an isolate (U+2067)", `I trade ${char(0x2067)}MT5`],
      ["a bell", `I trade${BELL}MT5`],
      ["a tab", `I trade${TAB}MT5`],
      ["a carriage return", `line one${CR}${LF}line two`],
      ["a delete character", `I trade${DEL}MT5`],
      ["a line separator", `one${LINE_SEPARATOR}two`]
    ])("refuses %s", (_label, note) => {
      expect(accessRequestSchema.safeParse({ ...valid, note }).success).toBe(false);
    });

    it("names the field in the error", () => {
      const result = accessRequestSchema.safeParse({ ...valid, note: `x${NUL}` });
      if (result.success) throw new Error("expected a failure");
      expect(result.error.flatten().fieldErrors).toHaveProperty("note");
    });

    it("allows a line feed, so a note can have more than one line", () => {
      const parsed = accessRequestSchema.parse({ ...valid, note: `I trade MT5.${LF}${LF}I want a journal.` });
      expect(parsed.note).toBe(`I trade MT5.${LF}${LF}I want a journal.`);
    });

    it("still accepts Persian text with half-spaces", () => {
      const note = `ژورنال را در اکسل می${ZWNJ}نویسم.${LF}می${ZWNJ}خواهم مرور کنم.`;
      expect(accessRequestSchema.parse({ ...valid, note }).note).toBe(note);
    });
  });

  it("is checked even when the honeypot is empty, and before the honeypot decision for real submissions", () => {
    expect(() => parseAccessRequest({ ...valid, website: "", name: `ab${NUL}` })).toThrow(ZodError);
  });
});

describe("isHoneypotFilled", () => {
  it("is true when the hidden field holds anything", () => {
    expect(isHoneypotFilled({ website: "https://spam.example" })).toBe(true);
    expect(isHoneypotFilled({ ...valid, website: " x " })).toBe(true);
    expect(isHoneypotFilled({ website: 1 })).toBe(true);
    expect(isHoneypotFilled({ website: ["x"] })).toBe(true);
  });

  it("is false when it is absent, null or blank, and for bodies that are not objects", () => {
    for (const body of [{}, valid, { website: "" }, { website: "   " }, { website: null }, null, undefined, "website", 5, []]) {
      expect(isHoneypotFilled(body), JSON.stringify(body)).toBe(false);
    }
  });
});

describe("parseAccessRequest", () => {
  it("returns the validated request", () => {
    expect(parseAccessRequest({ ...valid, email: "Sara@Example.com", website: "" })).toEqual({
      bot: false,
      data: { ...valid, email: "sara@example.com", website: "" }
    });
  });

  it("flags a filled honeypot without validating the other fields", () => {
    expect(parseAccessRequest({ ...valid, website: "https://spam.example" })).toEqual({ bot: true });
    expect(parseAccessRequest({ website: "x", name: 1, email: [] })).toEqual({ bot: true });
  });

  it("throws a ZodError for an invalid request without a filled honeypot", () => {
    expect(() => parseAccessRequest({ ...valid, email: "nope" })).toThrow(ZodError);
    expect(() => parseAccessRequest({})).toThrow(ZodError);
    expect(() => parseAccessRequest("text")).toThrow(ZodError);
  });
});

describe("accessRequestStatusSchema", () => {
  it("accepts new, invited and declined only", () => {
    for (const status of ["new", "invited", "declined"]) {
      expect(accessRequestStatusSchema.parse({ status })).toEqual({ status });
    }
    expect(accessRequestStatusSchema.safeParse({ status: "approved" }).success).toBe(false);
    expect(accessRequestStatusSchema.safeParse({}).success).toBe(false);
    expect(accessRequestStatusSchema.safeParse({ status: "new", name: "x" }).success).toBe(false);
  });
});
