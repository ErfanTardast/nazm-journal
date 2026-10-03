import type { Locale } from "@/lib/i18n/locales";
import type { AiResponse } from "@/lib/services/ai";

/**
 * Canonical disclaimer. Always written server-side onto AI output; never trusted
 * from a model. Kept identical to the local provider's disclaimer so persisted
 * records are consistent regardless of which provider produced them.
 */
export const CANONICAL_AI_DISCLAIMER =
  "This output is educational analytics only. It is not personalized financial advice and does not guarantee profit or loss avoidance.";

const CANONICAL_AI_DISCLAIMER_FA =
  "این خروجی فقط تحلیل آموزشی است. توصیه مالی شخصی نیست و سود یا پرهیز از ضرر را تضمین نمی‌کند.";

/** The canonical disclaimer in the language of the answer it is attached to. */
export function canonicalAiDisclaimer(locale: Locale = "en"): string {
  return locale === "fa" ? CANONICAL_AI_DISCLAIMER_FA : CANONICAL_AI_DISCLAIMER;
}

/**
 * Product-scope forbidden patterns. Single source of truth, also imported by
 * tests/unit/product-scope.test.ts to scan active UI surfaces.
 *
 * Core patterns are forbidden on every surface, billing included: out-of-scope
 * products, signals and order execution.
 */
export const coreScopeForbiddenPatterns: RegExp[] = [
  /futures/i,
  /social/i,
  /trading signal/i,
  /auto trading/i,
  /copy trading/i,
  /broker connection/i,
  /exchange execution/i,
  /execute order/i,
  /guaranteed profit/i
];

/** Allowed only on billing surfaces (src/features/billing, /[locale]/billing); forbidden elsewhere and in AI output. */
export const billingTermPatterns: RegExp[] = [/payment/i, /subscription/i];

export const productScopeForbiddenPatterns: RegExp[] = [...coreScopeForbiddenPatterns, ...billingTermPatterns];

/**
 * Persian pattern pieces. JavaScript's \b only knows ASCII letters, so Persian words are fenced with lookarounds on the
 * Persian letters instead, and a zero-width non-joiner (U+200C) counts as a space.
 */
const FA_SPACE = "[\\s\\u200c]*";
const FA_LETTER = "[\\u0621-\\u063A\\u0641-\\u064A\\u067E\\u0686\\u0698\\u06A9\\u06AF\\u06CC]";
const FA_NOT_BEFORE = `(?<!${FA_LETTER})`;
const FA_NOT_AFTER = `(?!${FA_LETTER})`;
/** Plural-you ending of an imperative: formal "-ید" and spoken "-ین" (بخرید / بخرین). */
const FA_YOU = "(?:ید|ین)";
/** Words that put a statement about price in the future: "به زودی بالا می‌رود", "فردا پایین میره". */
const FA_FUTURE_CUE =
  `${FA_NOT_BEFORE}(?:به${FA_SPACE}زودی|بزودی|فردا|هفته${FA_SPACE}(?:آینده|بعد)|ماه${FA_SPACE}(?:آینده|بعد)|سال${FA_SPACE}آینده|` +
  `روزهای${FA_SPACE}آینده|در${FA_SPACE}آینده|حتما|قطعا|یقینا)${FA_NOT_AFTER}`;
/** Up to this many characters of the same sentence between a cue and the phrase it governs. */
const FA_SAME_SENTENCE = "[^.!؟?\\n]";
/**
 * Placed in front of a price-movement phrase: skips it when a "whenever / when" clause opens a few characters earlier
 * ("هر وقت قیمت بالا می‌رود هیجانی می‌شوم"). That is a habit being described, not a statement about the future.
 */
const FA_HABITUAL =
  `(?<!${FA_NOT_BEFORE}(?:وقتی|هر${FA_SPACE}(?:وقتی?|بار|موقع))${FA_NOT_AFTER}${FA_SAME_SENTENCE}{0,20})`;
/**
 * Placed in front of a buy / sell / enter command: skips it when the sentence is a "before you …" clause
 * ("پیش از آنکه وارد معامله شوید، چک‌لیست را بخوانید"), which warns against acting too soon rather than telling anyone to act.
 */
const FA_BEFORE_YOU_ACT =
  `(?<!(?:پیش|قبل)${FA_SPACE}از${FA_SPACE}(?:آنکه|اینکه|آن${FA_SPACE}که|این${FA_SPACE}که)${FA_SPACE})`;
/**
 * Placed after a buy / sell command: lets through the "if you …" half of a warning, where the command ends the if-clause
 * and a comma follows ("اگر باز هم بدون پلن خرید کنید، آن را نقض قانون علامت بزنید"). An if-clause whose answer promises
 * a gain ("اگر بخرید، سود می‌کنید") still counts as advice.
 */
const FA_NOT_AN_IF_CLAUSE =
  `(?:(?<!${FA_NOT_BEFORE}اگر${FA_NOT_AFTER}[^،,.!؟?\\n]{0,60})|` +
  `(?!${FA_SPACE}[،,](?!${FA_SAME_SENTENCE}{0,40}?(?:سود|برد|برنده|موفق|ثروت))))`;

/**
 * Folds Arabic-keyboard letters and decoration to plain Persian before matching: Arabic yeh and alef maksura to ی, Arabic
 * kaf to ک, and tatweel and diacritics removed. Without it "سيگنال خريد" (typed with Arabic ي) slips past every pattern.
 */
export function normalizePersianText(text: string): string {
  return text
    .replace(/[\u064A\u0649]/g, "\u06CC")
    .replace(/\u0643/g, "\u06A9")
    .replace(/\u0640/g, "")
    .replace(/(?:[\u064B-\u065F]|\u0670)/g, "");
}

/**
 * Certainty / advice patterns that must never appear in *generated* AI output.
 * Broader than the product-scope list; used only to sanitize external model
 * responses at runtime (not to scan source files).
 */
export const aiCertaintyForbiddenPatterns: RegExp[] = [
  /\bguaranteed?\b/i,
  /financial advice/i,
  /\bwill (?:rise|fall|go up|go down|increase|decrease|moon|pump|dump|reach)\b/i,
  /price target/i,
  /signals? to (?:buy|sell)/i,
  /you should (?:buy|sell|short|long)\b/i,
  /\b(?:definitely|certainly|surely) (?:buy|sell|profit|win)/i,
  /risk-?free/i,
  ...persianCertaintyForbiddenPatterns()
];

/** The same certainty / advice / signal language, written in Persian. */
function persianCertaintyForbiddenPatterns(): RegExp[] {
  const sp = FA_SPACE;
  /** An instruction to trade: not a "before you …" clause and not the "if you …," half of a warning (see FA_NOT_AN_IF_CLAUSE). */
  const command = (core: string): RegExp =>
    new RegExp(`${FA_BEFORE_YOU_ACT}${FA_NOT_BEFORE}(?:${core})${FA_NOT_AFTER}${FA_NOT_AN_IF_CLAUSE}`);
  return [
    /تضمین|ضمانت/, // guarantee
    new RegExp(`(?:مشاوره|توصیه)${sp}(?:ی${sp})?مالی`), // financial advice
    /سیگنال/, // signal
    new RegExp(`بدون${sp}ریسک`), // risk-free
    new RegExp(`قیمت${sp}(?:ی${sp})?هدف`), // price target
    new RegExp(`(?:بالا|پایین)${sp}خواهد${sp}(?:رفت|آمد)`), // will go up / down
    new RegExp(`(?:صعودی|نزولی)${sp}خواهد${sp}(?:بود|شد)`), // will be bullish / bearish
    new RegExp(`(?:افزایش|کاهش|صعود|نزول|رشد|افت|ریزش|سقوط|جهش)${sp}خواهد${sp}(?:یافت|کرد)`), // will rise / fall / grow
    new RegExp(`قیمت${FA_SAME_SENTENCE}{0,50}?خواهد${sp}رسید`), // the price will reach
    // The present tense used for the future: "قیمت به زودی بالا می‌رود", "فردا ریزش می‌کند", "قیمت هفته آینده به ۷۰ هزار می‌رسد".
    new RegExp(`${FA_FUTURE_CUE}${FA_SAME_SENTENCE}{0,40}?${persianPriceMovesNow(sp)}`),
    new RegExp(`${persianPriceMovesNow(sp)}${FA_SAME_SENTENCE}{0,20}?${FA_FUTURE_CUE}`),
    new RegExp(`${FA_FUTURE_CUE}${FA_SAME_SENTENCE}{0,30}?قیمت${FA_SAME_SENTENCE}{0,40}?می${sp}رسد`),
    new RegExp(`قیمت${FA_SAME_SENTENCE}{0,30}?${FA_FUTURE_CUE}${FA_SAME_SENTENCE}{0,40}?می${sp}رسد`),
    // definitely buy / profit / win / enter; a bare "حتما وارد ژورنال کنید" is not about trading, so "وارد" needs a trade word
    new RegExp(
      `(?:حتماً?|قطعاً?|یقیناً?)${sp}(?:بخر|بفروش|سود|برد|برنده|وارد${sp}(?:شو|معامله|پوزیشن|خرید|فروش|لانگ|شورت|بازار)|لانگ|شورت)`
    ),
    // you should buy / sell, with or without the object clitic ("بخریدش")
    command(`(?:بخرید|بخرین|بفروشید|بفروشین|بخر|بفروش)(?:شون|شو|ش)?`),
    // Compound verbs: "خرید کنید", "فروش کنید".
    command(`(?:خرید|فروش)${sp}(?:کن${FA_YOU}|نمایید|کن)`),
    // "وارد معامله خرید شوید", "وارد شورت شوید"; a bare "وارد شوید" is "log in", so a trade word is required.
    command(
      `وارد${sp}(?:(?:معامله|پوزیشن)${sp}(?:(?:خرید|فروش|لانگ|شورت)${sp})?|(?:خرید|فروش|لانگ|شورت)${sp})(?:شو${FA_YOU}|شو)`
    ),
    // "لانگ بگیرید", "شورت بزنید", "لانگ کنید".
    command(`(?:لانگ|شورت)${sp}(?:بگیر|بزن|کن)(?:${FA_YOU})?`),
    // "یک پوزیشن لانگ باز کنید", "معامله خرید باز کنید".
    command(`(?:پوزیشن|معامله)${sp}(?:خرید|فروش|لانگ|شورت)${sp}باز${sp}کن(?:${FA_YOU})?`)
  ];
}

/**
 * "بالا می‌رود", "پایین میره", "می‌رود بالا", "رشد می‌کند", "ریزش می‌کند", "می‌ریزد": a movement stated as happening, in the
 * present tense. Skipped after a "when / whenever" clause (see FA_HABITUAL).
 */
function persianPriceMovesNow(sp: string): string {
  return (
    `${FA_HABITUAL}(?:(?:بالا|پایین)${sp}می${sp}(?:رود|ره)|` +
    `${FA_NOT_BEFORE}می${sp}(?:رود|ره)${sp}(?:بالا|پایین)|` +
    `(?:رشد|صعود|افت|ریزش|نزول|افزایش|کاهش|سقوط|جهش)${sp}می${sp}(?:کند|کنه)|` +
    `${FA_NOT_BEFORE}می${sp}(?:ریزد|ریزه))`
  );
}

const aiOutputForbiddenPatterns = [...productScopeForbiddenPatterns, ...aiCertaintyForbiddenPatterns];

function collectStrings(response: AiResponse): string {
  return [response.summary, ...response.observations, ...response.risks, ...response.nextActions].join("\n");
}

/**
 * Returns whether generated AI output is within product scope. A single match of
 * any forbidden pattern fails the check, so callers can fall back to local output.
 */
export function sanitizeAiResponse(response: AiResponse): { ok: boolean; matched?: string } {
  const haystack = normalizePersianText(collectStrings(response));
  for (const pattern of aiOutputForbiddenPatterns) {
    if (pattern.test(haystack)) {
      return { ok: false, matched: pattern.source };
    }
  }
  return { ok: true };
}

/**
 * Request-intent patterns that must be REFUSED **before any provider call**. The coach reviews
 * already-taken trades and educates - it never gives buy/sell signals, price targets, market
 * predictions, or execution instructions. Bounded wildcards (no catastrophic backtracking).
 * These match *requests* (e.g. "should I buy") and not past-tense review notes (e.g. "I bought").
 */
export const aiRequestForbiddenPatterns: RegExp[] = [
  /\bshould i\s+(?:buy|sell|short|long|enter|exit|hold|trade)\b/i,
  /\bwhat (?:should|do) i (?:buy|sell|trade|short|long)\b/i,
  /\b(?:give|send|provide|want|need)\b.{0,20}\bsignals?\b/i,
  /\b(?:buy|sell|entry|trade|trading)\s+signals?\b/i,
  /\bprice target\b/i,
  /\bwill\b.{0,30}\b(?:go up|go down|rise|fall|moon|pump|dump|reach|hit)\b/i,
  /\b(?:buy|sell)\s+now\b/i,
  /\b(?:execute|place|open)\s+(?:a\s+|the\s+)?(?:trade|order|position)\b/i,
  /\btell me (?:to|what to|when to)\s+(?:buy|sell|trade)\b/i,
  /\bguaranteed?\s+(?:profit|win|return|money)\b/i,
  ...persianRequestForbiddenPatterns()
];

/**
 * The same requests, written in Persian ("آیا بخرم؟", "سیگنال خرید بده"). Past-tense notes ("خریدم") are not requests, and
 * neither is a note in the subjunctive: "تصمیم گرفتم بخرم" and "می‌خواستم زودتر بفروشم" are ordinary journal narration. So the
 * first-person verbs only count with a question cue shortly before them (آیا، به نظرت، باید، الان، چی، چه، کی، کدام) or a
 * question mark shortly after, and never right after a narrating phrase ("تصمیم گرفتم", "مجبور شدم", "قرار بود"), even when
 * the note also contains a cue word or ends in a question mark ("تصمیم گرفتم بخرم، درست بود؟").
 */
function persianRequestForbiddenPatterns(): RegExp[] {
  const sp = FA_SPACE;
  const cue = `${FA_NOT_BEFORE}(?:آیا|به${sp}نظرت|به${sp}نظر${sp}شما|باید|الان|اکنون|همین${sp}حالا|چی|چه|کی|کدام)${FA_NOT_AFTER}`;
  const asked = (verbs: string, extraCue = cue): RegExp =>
    new RegExp(`${extraCue}${FA_SAME_SENTENCE}{0,30}?${verbs}|${verbs}${FA_SAME_SENTENCE}{0,15}?[؟?]`);
  // "I decided to buy", "I was forced to sell", "I wanted to sell", "I knew I should": the writer is telling what they did.
  const narrated =
    `(?<!${FA_NOT_BEFORE}(?:تصمیم${sp}(?:گرفتم|داشتم)|قصد${sp}داشتم|مجبور${sp}شدم|قرار${sp}بود|ن?می${sp}(?:خواستم|دانستم|توانستم)|` +
    `خواستم|نتوانستم)${FA_NOT_AFTER}${FA_SAME_SENTENCE}{0,25})`;
  const iBuyOrSell = `${FA_NOT_BEFORE}(?:بخرم|بفروشم)(?:شون|شو|ش)?${FA_NOT_AFTER}`;
  const youBuyOrSell = `${FA_NOT_BEFORE}(?:بخر|بفروش)${FA_NOT_AFTER}`;
  const iTradeCompound = `${FA_NOT_BEFORE}(?:خرید|فروش)${sp}کنم${FA_NOT_AFTER}`;
  const iEnter = `${FA_NOT_BEFORE}وارد${sp}(?:(?:معامله|پوزیشن)${sp})?(?:(?:خرید|فروش|لانگ|شورت)${sp})?(?:بشم|شوم|شم)${FA_NOT_AFTER}`;
  const iGoLongShort = `${FA_NOT_BEFORE}(?:لانگ|شورت)${sp}(?:کنم|بگیرم|بزنم)${FA_NOT_AFTER}`;
  const futureTime = `${FA_NOT_BEFORE}(?:فردا|هفته${sp}(?:آینده|بعد)|ماه${sp}(?:آینده|بعد)|سال${sp}آینده)${FA_NOT_AFTER}`;
  const goesUpOrDown = `(?:${persianPriceMovesNow(sp)}|(?:بالا|پایین)${sp}خواهد${sp}رفت)`;
  return [
    asked(`${narrated}(?:${iBuyOrSell}|${youBuyOrSell}|${iTradeCompound}|${iEnter}|${iGoLongShort})`), // should I buy / sell / enter / go long
    asked(goesUpOrDown, `(?:${cue}|${futureTime})`), // will it go up / down
    new RegExp(`سیگنال${sp}(?:خرید|فروش|ورود|معامله)`), // buy / sell / entry / trade signal
    new RegExp(`سیگنال.{0,20}(?:بده|بدهید|بفرست|بفرستید|می${sp}(?:خواهم|خوام)|نیاز${sp}دارم|لازم${sp}دارم)`), // give / send me a signal
    new RegExp(`قیمت${sp}هدف`), // price target
    new RegExp(`(?:الان|اکنون|همین${sp}حالا)${sp}(?:بخر|بفروش)${FA_NOT_AFTER}`), // buy / sell now
    new RegExp(`(?:معامله|سفارش|پوزیشن)${sp}(?:را${sp})?باز${sp}کن(?:ید)?${FA_NOT_AFTER}`), // open a trade for me
    new RegExp(`سود${sp}تضمین`) // guaranteed profit
  ];
}

/** Screen user-supplied free text *before* invoking any AI provider. */
export function screenAiRequest(text: string): { allowed: boolean; matched?: string } {
  const t = normalizePersianText(text ?? "");
  for (const pattern of aiRequestForbiddenPatterns) {
    if (pattern.test(t)) {
      return { allowed: false, matched: pattern.source };
    }
  }
  return { allowed: true };
}

/** Deterministic, provider-free refusal returned when a request is out of scope. */
export function buildRefusalResponse(mode: AiResponse["mode"], locale: Locale = "en"): AiResponse {
  if (locale === "fa") {
    return {
      disclaimer: CANONICAL_AI_DISCLAIMER_FA,
      mode,
      summary:
        "این درخواست یک توصیه خرید و فروش، پیش‌بینی بازار یا دستور سفارش می‌خواهد که مربی ارائه نمی‌دهد. " +
        "مربی فرایند شما را مرور می‌کند و به یادگیری‌تان کمک می‌کند.",
      observations: [
        "مربی معامله‌هایی را که انجام داده‌اید، پلن‌ها و ژورنال‌تان را تحلیل می‌کند.",
        "مربی بازار را پیش‌بینی نمی‌کند، هدف قیمتی تعیین نمی‌کند و دستور سفارش نمی‌دهد."
      ],
      risks: ["عمل بر پایه پیش‌بینی، به‌جای یک پلن مکتوب و ریسک‌مدیریت‌شده، راه رایج از دست رفتن سرمایه حساب‌های کوچک است."],
      nextActions: [
        "سؤال را فرایندی بپرسید، مثلاً «مرور کن که این معامله از پلن و قوانین ریسک من پیروی کرد یا نه».",
        "پیش از معامله، ورود، ابطال و ریسک را در استراتژی یا پلن‌تان مشخص کنید.",
        "معامله و یک درس را در ژورنال ثبت کنید تا تحلیل‌ها بتوانند الگوها را پیدا کنند."
      ]
    };
  }
  return {
    disclaimer: CANONICAL_AI_DISCLAIMER,
    mode,
    summary:
      "This request asks for a trade call, market prediction, or order instruction, which the " +
      "coach does not provide. It reviews your process and helps you learn.",
    observations: [
      "The coach analyzes trades you have already taken, your plans, and your journal.",
      "It does not predict markets, set targets, or instruct orders."
    ],
    risks: [
      "Acting on predictions instead of a written, risk-managed plan is how small accounts get ruined."
    ],
    nextActions: [
      "Rephrase as a process question, e.g. 'review whether this trade followed my plan and risk rules'.",
      "Define entry, invalidation, and risk in your strategy/plan before trading.",
      "Record the trade and one lesson in the journal so analytics can find patterns."
    ]
  };
}
