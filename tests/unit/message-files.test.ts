import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fa from "@/messages/fa.json";
import { fallbackCopy } from "@/lib/i18n/fallback-copy";

/** Every dotted key that holds a string, with its value. */
function flatten(node: unknown, path = ""): [string, string][] {
  if (typeof node === "string") return [[path, node]];
  if (node && typeof node === "object") return Object.entries(node).flatMap(([key, value]) => flatten(value, path ? `${path}.${key}` : key));
  return [];
}

const enEntries = flatten(en);
const faEntries = flatten(fa);
const faValue = (key: string) => faEntries.find(([path]) => path === key)?.[1];
const enValue = (key: string) => enEntries.find(([path]) => path === key)?.[1];

describe("message files", () => {
  it("have exactly the same keys in both languages", () => {
    expect(faEntries.map(([key]) => key).sort()).toEqual(enEntries.map(([key]) => key).sort());
  });

  it("have no empty text", () => {
    expect([...enEntries, ...faEntries].filter(([, value]) => value.trim() === "")).toEqual([]);
  });
});

/*
 * Glossary (round 3): a Plan is "پلن" in Persian. "برنامه" stays only for an app ("برنامه احراز هویت"), and "برنامه‌ریزی"
 * for the activity of planning.
 */
describe("Persian glossary in the message files", () => {
  const APP_SENTENCES = ["کد ۶ رقمی برنامه احراز هویت خود را", "برنامه آن‌ها را اجرا نمی‌کند"];

  it("uses پلن, not برنامه, for a plan", () => {
    const offenders = faEntries
      .map(([key, value]) => [key, APP_SENTENCES.reduce((rest, sentence) => rest.split(sentence).join(""), value).replace(/برنامه‌ریزی/g, "")] as const)
      .filter(([, value]) => /برنامه/.test(value))
      .map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  it("keeps the authenticator-app sentence and the terminal sentence", () => {
    expect(faValue("auth.errors.TWO_FACTOR_REQUIRED")).toContain("برنامه احراز هویت");
    expect(faValue("tradingLab.commandsDesc")).toContain("برنامه آن‌ها را اجرا نمی‌کند");
  });

  it("names the plan page, the safety line and the onboarding plan with پلن", () => {
    expect(faValue("pages.plans")).toBe("پلن معامله");
    expect(faValue("app.safetyCopy")).toBe("اپ نظم برای مرور پلن‌ها، ژورنال، ریسک، زمینه بازار و درس‌هاست؛ کارگزار یا مشاور مالی نیست.");
    expect(faValue("onboarding.subtitle")).toContain("یک پلن شروع نظم‌محور");
    expect(faValue("onboarding.build")).toBe("پلن من را بساز");
    expect(faValue("onboarding.planFor")).toBe("پلن برای");
    expect(faValue("onboarding.issue.no_plan")).toBe("معامله بدون پلن");
  });

  it("uses پلن in the install prompt of the app-level fallbacks too", () => {
    expect(fallbackCopy.fa.installBody).toContain("پلن، ژورنال و مرور روزانه");
    expect(Object.values(fallbackCopy.fa).filter((text) => /برنامه/.test(text))).toEqual([]);
  });

  it("keeps the English plan page title", () => {
    expect(enValue("pages.plans")).toBe("Plan");
  });
});

describe("the import page name", () => {
  it("says it imports trades, not only a CSV file", () => {
    expect(faValue("pages.import")).toBe("ورود معاملات");
    expect(enValue("pages.import")).toBe("Import trades");
    expect(faValue("nav.import")).toBe("ورود معاملات");
    expect(enValue("nav.import")).toBe("Import trades");
  });

  it("keeps the AI coach page name", () => {
    expect(faValue("pages.ai")).toBe("مربی هوش مصنوعی");
  });
});
