import { describe, expect, it } from "vitest";
import { formatCount, formatMoney, formatNumber, formatR, formatShortDay, formatSignedMoney } from "@/lib/i18n/format";
import { latinDigitStrings } from "./support/latin-digits";

const LRM = "\u200e";
const LRI = "\u2066";
const PDI = "\u2069";
const ASCII_DIGIT = /[0-9]/;

describe("number helpers in English", () => {
  it("formats numbers, counts and R", () => {
    expect(formatNumber(1234.567, "en")).toBe("1,234.57");
    expect(formatNumber(1.5, "en", { min: 2 })).toBe("1.50");
    expect(formatNumber(1.23456, "en", { max: 3 })).toBe("1.235");
    expect(formatNumber(2, "en", { max: 0 })).toBe("2");
    expect(formatCount(1234567, "en")).toBe("1,234,567");
    expect(formatCount(2.6, "en")).toBe("3");
    expect(formatR(1.25, "en")).toBe("1.25R");
    expect(formatR(-1.25, "en")).toBe("-1.25R");
    expect(formatR(2, "en", 1)).toBe("2.0R");
    expect(formatR(2, "en", 0)).toBe("2R");
  });

  it("never writes a minus in front of zero", () => {
    expect(formatNumber(-0.001, "en", { max: 2 })).toBe("0");
    expect(formatR(-0.001, "en")).toBe("0.00R");
    expect(formatSignedMoney(-0.001, "en")).toBe("$0.00");
  });

  it("signs money except at zero", () => {
    expect(formatSignedMoney(120.5, "en")).toBe("+$120.50");
    expect(formatSignedMoney(-120.5, "en")).toBe("-$120.50");
    expect(formatSignedMoney(0, "en")).toBe("$0.00");
  });

  it("writes a short day as month and day", () => {
    expect(formatShortDay("2026-10-03", "en")).toBe("Oct 3");
    expect(formatShortDay("2026-01-31", "en")).toBe("Jan 31");
  });

  it("leaves the existing helpers as they were", () => {
    expect(formatMoney(1234.5, "en")).toBe("$1,234.50");
    expect(formatMoney(-0.13, "fa")).toBe(`${LRM}−${LRM}$۰٫۱۳`);
  });
});

describe("number helpers in Persian", () => {
  const samples = () => [
    formatNumber(1234.5, "fa"),
    formatNumber(-3.5, "fa", { min: 2 }),
    formatCount(1234567, "fa"),
    formatR(1.25, "fa"),
    formatR(-0.5, "fa", 1),
    formatSignedMoney(120.5, "fa"),
    formatSignedMoney(-120.5, "fa"),
    formatShortDay("2026-10-03", "fa")
  ];

  it("writes no ASCII digit", () => {
    for (const text of samples()) expect(text).not.toMatch(ASCII_DIGIT);
  });

  it("uses Persian digits and separators", () => {
    expect(formatNumber(1234.5, "fa")).toBe("۱٬۲۳۴٫۵");
    expect(formatCount(1234567, "fa")).toBe("۱٬۲۳۴٬۵۶۷");
  });

  it("starts a negative number with a left-to-right mark, so the minus stays on the left", () => {
    expect(formatNumber(-3.5, "fa").startsWith(`${LRM}−`)).toBe(true);
    expect(formatCount(-1200, "fa").startsWith(LRM)).toBe(true);
    expect(formatSignedMoney(-120.5, "fa").startsWith(LRM)).toBe(true);
    expect(formatSignedMoney(120.5, "fa")).toContain("+");
  });

  it("isolates R so it sits right inside right-to-left text", () => {
    const positive = formatR(1.25, "fa");
    expect(positive.startsWith(LRI)).toBe(true);
    expect(positive.endsWith(PDI)).toBe(true);
    expect(positive).toContain("۱٫۲۵R");
    const negative = formatR(-1.25, "fa");
    expect(negative.startsWith(LRI)).toBe(true);
    expect(negative).toContain("۱٫۲۵R");
    expect(negative).toContain("−");
  });

  it("writes a short day in the Persian calendar", () => {
    expect(formatShortDay("2026-10-03", "fa")).toBe("۱۱ مهر");
    expect(formatShortDay("2026-03-21", "fa")).toBe("۱ فروردین");
  });
});

describe("formatShortDay with something that is not a day", () => {
  it("gives the text back instead of throwing", () => {
    expect(formatShortDay("soon", "en")).toBe("soon");
    expect(formatShortDay("", "fa")).toBe("");
  });
});

describe("latinDigitStrings (test support)", () => {
  function page(html: string) {
    const root = document.createElement("div");
    root.innerHTML = html;
    return root;
  }

  it("finds every visible string with an ASCII digit, in text and in attributes", () => {
    const root = page(`<p>۱۲ معامله</p><p>12 معامله</p><button aria-label="3 مورد">x</button><input placeholder="۴" title="v2">`);
    expect(latinDigitStrings(root)).toEqual(["12 معامله", "3 مورد", "v2"]);
  });

  it("lets MT5 and the strings a test feeds in through", () => {
    const root = page(`<p>MT5</p><p>گزارش MT5</p><p>US30</p><p>US30 و 5 نماد</p>`);
    expect(latinDigitStrings(root)).toEqual(["US30", "US30 و 5 نماد"]);
    expect(latinDigitStrings(root, ["US30"])).toEqual(["US30 و 5 نماد"]);
    expect(latinDigitStrings(root, [/US\d+/g, /\b5\b/])).toEqual([]);
  });

  it("says nothing about a page without digits", () => {
    expect(latinDigitStrings(page("<p>سلام</p>"))).toEqual([]);
  });
});
