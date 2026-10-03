import { describe, expect, it } from "vitest";
import {
  buildRefusalResponse,
  sanitizeAiResponse,
  screenAiRequest
} from "@/lib/ai/guard";

/** What an Arabic keyboard types for the Persian letters ی and ک. */
const TATWEEL = String.fromCodePoint(0x640);
const FATHA = String.fromCodePoint(0x64e);

function arabicKeyboard(text: string): string {
  return text.replace(/ی/g, "\u064A").replace(/ک/g, "\u0643");
}

describe("screenAiRequest — pre-provider refusal of out-of-scope requests", () => {
  const REFUSED = [
    "Should I buy here?",
    "what should i trade tomorrow",
    "give me a buy signal for BTC",
    "send me trading signals",
    "what's the price target for ETH?",
    "will it go up next week?",
    "buy now or wait?",
    "execute a trade for me",
    "tell me when to sell",
    "this is a guaranteed profit setup right?"
  ];
  it.each(REFUSED)("refuses: %s", (text) => {
    const r = screenAiRequest(text);
    expect(r.allowed).toBe(false);
    expect(r.matched).toBeTruthy();
  });

  const ALLOWED = [
    "I bought at 100 and sold at 110, was my risk sizing ok?",
    "Review whether this trade followed my plan and risk rules.",
    "My stop loss was too tight and I exited early.",
    "",
    "Tag the mistake: moved my stop after entry."
  ];
  it.each(ALLOWED)("allows process/review note: %s", (text) => {
    expect(screenAiRequest(text).allowed).toBe(true);
  });
});

describe("screenAiRequest in Persian", () => {
  const REFUSED = [
    "آیا الان بخرم؟",
    "بفروشم یا نگه دارم؟",
    "یک سیگنال خرید برای بیت کوین بده",
    "سیگنال فروش می‌خواهم",
    "قیمت هدف اتریوم چقدر است؟",
    "هفته آینده قیمت بالا می‌رود؟",
    "الان بخر یا صبر کنم؟",
    "این یک ستاپ با سود تضمینی است، درسته؟",
    // clitic, compound and colloquial forms
    "الان بخرمش یا نه؟",
    "به نظرت وارد بشم؟",
    "الان خرید کنم؟",
    "فردا بالا میره؟",
    "آیا باید همین حالا وارد معامله شوم؟",
    "کدام را بفروشم؟",
    "الان لانگ بگیرم یا شورت؟",
    // close variants of the same requests
    "آیا الان وارد معامله خرید بشم",
    "وارد شم؟",
    "میره بالا؟",
    "فردا رشد می‌کند؟",
    "یه سیگنال میخوام",
    "قیمت فردا می‌ریزد؟"
  ];
  it.each(REFUSED)("refuses: %s", (text) => {
    expect(screenAiRequest(text).allowed).toBe(false);
  });

  it("refuses the same requests typed with Arabic letters (ي, ك) and with diacritics or tatweel", () => {
    expect(screenAiRequest(arabicKeyboard("سیگنال خرید بده")).allowed).toBe(false);
    expect(screenAiRequest(arabicKeyboard("الان لانگ کنم؟")).allowed).toBe(false);
    expect(screenAiRequest(arabicKeyboard("آیا بخرمش؟")).allowed).toBe(false);
    expect(screenAiRequest(`سی${TATWEEL}گنال خرید بده`).allowed).toBe(false);
    expect(screenAiRequest("قیمت هدف اتریوم؟".replace("ت", `ت${FATHA}`)).allowed).toBe(false);
  });

  const ALLOWED = [
    "با قیمت ۱۰۰ خریدم و با ۱۱۰ فروختم؛ آیا اندازه ریسک درست بود؟",
    "مرور کن که این معامله از برنامه و قوانین ریسک من پیروی کرد یا نه.",
    "حد ضرر را بعد از ورود جابه‌جا کردم.",
    "اشتباه را برچسب بزن: جابه‌جا کردن حد ضرر.",
    // ordinary journal narration that uses the subjunctive form without asking for anything
    "قیمت به حمایت رسید و تصمیم گرفتم بخرم ولی حد ضرر نگذاشتم",
    "می‌خواستم زودتر بفروشم اما صبر کردم",
    "قرار بود شورت بگیرم ولی لانگ گرفتم",
    "هر وقت قیمت بالا می‌رود هیجانی می‌شوم",
    // the same narration with a cue word (باید، چه، کی، الان) or a closing question mark
    "می‌دانستم باید بفروشم ولی طمع کردم و نگه داشتم",
    "باید صبر می‌کردم ولی تصمیم گرفتم بخرم",
    "نمی‌دانستم چه کنم و در نهایت تصمیم گرفتم بفروشم",
    "هر چه صبر کردم برنگشت و مجبور شدم بفروشم",
    "الان که مرور می‌کنم، قرار بود لانگ بگیرم ولی صبر نکردم",
    "یادم نیست کی تصمیم گرفتم بخرم",
    "تصمیم گرفتم بخرم، درست بود؟",
    "چرا هر وقت قیمت بالا می‌رود هیجانی می‌شوم؟"
  ];
  it.each(ALLOWED)("allows process/review note: %s", (text) => {
    expect(screenAiRequest(text).allowed).toBe(true);
  });

  it("does not mistake words that merely contain a cue (چهار, کیفیت, الانه) for a question", () => {
    expect(screenAiRequest("چهار بار تصمیم گرفتم بخرم و هر بار زود بستم").allowed).toBe(true);
    expect(screenAiRequest("کیفیت تصمیم‌هایم پایین بود چون خواستم زود بخرم").allowed).toBe(true);
  });
});

describe("buildRefusalResponse — deterministic, provider-free", () => {
  it("preserves mode and uses the canonical disclaimer", () => {
    const r = buildRefusalResponse("learning");
    expect(r.mode).toBe("learning");
    expect(r.disclaimer).toContain("educational analytics only");
    expect(r.summary.length).toBeGreaterThan(0);
    expect(r.nextActions.length).toBeGreaterThan(0);
  });

  it("the Persian refusal calls the trade plan پلن, never برنامه", () => {
    const fa = buildRefusalResponse("professional_coach", "fa");
    const text = [fa.summary, ...fa.observations, ...fa.risks, ...fa.nextActions].join(" ");
    expect(text).toContain("پلن");
    expect(text).not.toMatch(/برنامه/);
  });

  it("the refusal itself contains no product-scope/certainty-forbidden wording", () => {
    for (const mode of ["professional_coach", "learning"] as const) {
      expect(sanitizeAiResponse(buildRefusalResponse(mode)).ok).toBe(true);
    }
  });
});
