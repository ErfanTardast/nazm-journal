import type { Locale } from "@/lib/i18n/locales";
import type { SampleMistakeKey } from "./types";
import type { SampleStrategyKey } from "./trade-table";

/**
 * Every word of the sample workspace, in English and Persian. The numbers a sentence mentions come in as arguments,
 * already written in the digits of the language, so the text can never disagree with the data. Nothing here is a
 * market call: these are one trader's own rules, notes and reviews of trades already taken.
 */
export type StrategyText = {
  name: string;
  description: string;
  entryRules: string[];
  exitRules: string[];
  invalidationRules: string[];
  riskRules: string[];
  allowedSessions: string[];
  checklist: string[];
  idealMarketConditions: string[];
  tags: string[];
};

/** Writes a whole number in the digits of the language. */
type Digits = (value: number) => string;

type NoteVariants = { pre: string[]; post: string[]; lesson: string[] };

export type SampleCopy = {
  /** Ends every strategy name and every review title, so a row is never mistaken for the person's own. */
  suffix: string;
  mistakes: Record<SampleMistakeKey, string>;
  emotions: { calm: string; focused: string; confident: string; impatient: string; anxious: string; hopeful: string; frustrated: string };
  sessions: { london: string; newYork: string };
  setups: Record<SampleStrategyKey, string>;
  outcomes: { win: string; loss: string; late: string; stop: string; revenge: string };
  strategies: Record<SampleStrategyKey, StrategyText>;
  notes: {
    clean: string;
    win: Record<SampleStrategyKey, NoteVariants>;
    loss: { post: string[]; lesson: string[] };
    late: { pre: string; post: string; lesson: string; review: string };
    stop: { pre: string; post: (loss: string) => string; lesson: (loss: string) => string; review: string };
    revenge: { pre: string; post: (loss: string) => string; lesson: string; review: (risk: string, limit: string) => string };
  };
  plans: {
    complete: { bias: string; invalidationRule: string; notes: string };
    missing: { bias: string; notes: string };
  };
  reviews: {
    weekly: {
      summary: (count: number, wins: number, losses: number, net: string, n: Digits) => string;
      rules: (followed: number, total: number, n: Digits) => string;
      mistakes: (list: string) => string;
      noMistakes: string;
      ruleBreaks: (count: number, n: Digits) => string;
      noRuleBreaks: string;
      lessons: string[];
      nextActions: string[];
      notes: { mistakes: (list: string) => string; noMistakes: string; focus: string; guardrail: string };
    };
    daily: {
      summary: (count: number, net: string, n: Digits) => string;
      ruleBreaks: (count: number, n: Digits) => string;
      noRuleBreaks: string;
      nextActions: string[];
    };
  };
};

const en: SampleCopy = {
  suffix: "(sample)",
  mistakes: { late: "Late entry", stop: "Moved stop", revenge: "Revenge trade" },
  emotions: {
    calm: "Calm",
    focused: "Focused",
    confident: "Confident",
    impatient: "Impatient",
    anxious: "Anxious",
    hopeful: "Hopeful",
    frustrated: "Frustrated"
  },
  sessions: { london: "London", newYork: "New York" },
  setups: { "strategy-range": "Range breakout", "strategy-gold": "Trend pullback" },
  outcomes: {
    win: "Plan followed, closed in profit",
    loss: "Stopped out at the planned stop",
    late: "Entered late, stopped out",
    stop: "Stop moved, larger loss",
    revenge: "Rule broken, larger loss"
  },
  strategies: {
    "strategy-range": {
      name: "London range breakout",
      description: "Rules for trading the break of the Asian-session range at the London open, with a fixed stop and a 3R target.",
      entryRules: [
        "Mark the Asian-session high and low before London opens.",
        "Wait for a 15-minute candle to close outside the range.",
        "Check the news calendar for high-impact releases in the next 30 minutes."
      ],
      exitRules: ["Set the target at 3R.", "Close whatever is still open at the end of the London session."],
      invalidationRules: ["A 15-minute candle closing back inside the range cancels the setup."],
      riskRules: [
        "Risk at most 1% of the account per trade.",
        "After two losses in a row on this setup, stop for the day.",
        "No more than two positions open at once.",
        "Never move the stop further away after entry."
      ],
      allowedSessions: ["London"],
      checklist: ["Asian range marked", "News calendar checked", "Stop and size set before entry", "Risk at or below 1%"],
      idealMarketConditions: ["An Asian range of at least 25 pips", "No high-impact news at the open"],
      tags: ["breakout", "london"]
    },
    "strategy-gold": {
      name: "Gold trend pullback",
      description: "Rules for trading pullbacks in the direction of the hourly trend on gold, with a fixed stop and a 3R target.",
      entryRules: [
        "Price and the 50-period average agree on direction on the hourly chart.",
        "Wait for a pullback toward the 20-period average.",
        "Wait for a candle to close back in the direction of the trend."
      ],
      exitRules: ["Set the target at 3R.", "Close whatever is still open at the end of the session it was opened in."],
      invalidationRules: ["An hourly candle closing on the other side of the 50-period average cancels the setup."],
      riskRules: [
        "Risk at most 0.75% of the account per trade.",
        "One gold position open at a time.",
        "Never move the stop further away after entry."
      ],
      allowedSessions: ["London", "New York"],
      checklist: ["Trend direction confirmed on the hourly chart", "News calendar checked", "Stop and size set before entry", "Risk at or below 0.75%"],
      idealMarketConditions: ["A clear hourly trend", "No high-impact news in the next hour"],
      tags: ["pullback", "gold"]
    }
  },
  notes: {
    clean: "Checklist ticked before entry.",
    win: {
      "strategy-range": {
        pre: [
          "Asian range marked and the news calendar is clear. Waiting for a 15-minute candle to close outside the range.",
          "The range is wide enough and the stop is set before entry. Risk at 1%.",
          "Same plan as the last clean trade: a close outside the range, the stop on the other side of the candle."
        ],
        post: [
          "Left it alone after entry and closed at a profit before the 3R target. The stop was never touched.",
          "Price stayed outside the range while I was in. Took the profit before the target without adjusting anything."
        ],
        lesson: ["Waiting for the candle close kept the entry clean.", "Setting the stop before entry made the rest of the trade easy to sit through."]
      },
      "strategy-gold": {
        pre: [
          "The hourly trend and the 50-period average agree. Waiting for a pullback toward the 20-period average.",
          "Trend intact on the hourly chart. Stop and size are set before entry, risk at 0.75%."
        ],
        post: [
          "The pullback held and I entered after a candle closed back in the trend direction. Took the profit before the 3R target.",
          "A shallow pullback, and I left the stop alone. Took the profit before the 3R target."
        ],
        lesson: [
          "Entering after the pullback gave a shorter stop than chasing the move would have.",
          "Not touching the stop kept the result inside the plan."
        ]
      }
    },
    loss: {
      post: [
        "Stopped out at the planned stop. The setup was valid, so this is one ordinary loss.",
        "Price came back through the entry and hit the stop. Nothing about the process was off."
      ],
      lesson: ["A stop-out that follows the rules is not a mistake. Nothing to change.", "One loss inside the plan; the risk was what it was meant to be."]
    },
    late: {
      pre: "The breakout candle closed and I hesitated.",
      post: "Entered several candles after the breakout, once price had already moved away from the range. It pulled back and hit the stop.",
      lesson: "If I miss the candle close, I let this trade go.",
      review: "Late means a worse entry price for the same stop. It broke the entry rule."
    },
    stop: {
      pre: "The plan was clear: the stop sits below the range low.",
      post: (loss) => `Price moved toward the stop and I moved it further away, hoping for a bounce. The loss grew to ${loss}R.`,
      lesson: (loss) => `Moving the stop turned a planned 1R loss into ${loss}R. The stop stays where the plan put it.`,
      review: "The stop was moved after entry, which the strategy's risk rules do not allow."
    },
    revenge: {
      pre: "Two losses in a row. I wanted to win the money back.",
      post: (loss) =>
        `Entered right after the stop-out with a larger size than my rule allows, on a setup that did not meet the entry rules, and let it run past the stop. Lost ${loss}R.`,
      lesson: "After two losses in a row on this setup the rule says stop for the day. Writing the next trade down before taking it would have caught this.",
      review: (risk, limit) => `Risked ${risk}% on this trade; the strategy's limit is ${limit}%.`
    }
  },
  plans: {
    complete: {
      bias: "Uptrend bias while price holds above the Asian-session range",
      invalidationRule: "A 15-minute candle closing back inside the Asian range cancels the plan.",
      notes: "Size from the 1% limit and set the stop before entry."
    },
    missing: {
      bias: "Uptrend intact; waiting for a pullback toward the 20-period average",
      notes: "Still to do: write the invalidation rule."
    }
  },
  reviews: {
    weekly: {
      summary: (count, wins, losses, net, n) =>
        `${n(count)} ${count === 1 ? "trade" : "trades"} closed this week: ${n(wins)} ${wins === 1 ? "win" : "wins"} and ${n(losses)} ${losses === 1 ? "loss" : "losses"}, ${net}R net.`,
      rules: (followed, total, n) => `Rules were followed on ${n(followed)} of ${n(total)} ${total === 1 ? "trade" : "trades"}.`,
      mistakes: (list) => `Tagged mistakes this week: ${list}.`,
      noMistakes: "No tagged mistakes this week.",
      ruleBreaks: (count, n) => `${n(count)} ${count === 1 ? "trade" : "trades"} broke or only partly followed the rules.`,
      noRuleBreaks: "No rules were broken this week.",
      lessons: ["Waiting for the candle close keeps the entry clean.", "A stop that is hit as planned is not a mistake."],
      nextActions: ["Keep the stop where the plan put it.", "After two losses in a row on this setup, stop for the day."],
      notes: {
        mistakes: (list) => `Recorded: ${list}.`,
        noMistakes: "No tagged mistakes.",
        focus: "Focus for next week: wait for the candle close before entering.",
        guardrail: "After two losses in a row on this setup, no more trades that day."
      }
    },
    daily: {
      summary: (count, net, n) => `Last trading day in this journal: ${n(count)} ${count === 1 ? "trade" : "trades"}, ${net}R net.`,
      ruleBreaks: (count, n) => `${n(count)} ${count === 1 ? "trade" : "trades"} broke or only partly followed the rules that day.`,
      noRuleBreaks: "No rules were broken that day.",
      nextActions: ["Write one lesson from that day before the next session."]
    }
  }
};

const fa: SampleCopy = {
  suffix: "(نمونه)",
  mistakes: { late: "ورود دیرهنگام", stop: "جابه‌جایی حد ضرر", revenge: "معامله انتقامی" },
  emotions: {
    calm: "آرام",
    focused: "متمرکز",
    confident: "مطمئن",
    impatient: "بی‌صبر",
    anxious: "مضطرب",
    hopeful: "امیدوار",
    frustrated: "کلافه"
  },
  sessions: { london: "لندن", newYork: "نیویورک" },
  setups: { "strategy-range": "شکست محدوده", "strategy-gold": "پولبک در روند" },
  outcomes: {
    win: "طبق پلن، با سود بسته شد",
    loss: "با حد ضرر پلن بسته شد",
    late: "دیر وارد شدم و حد ضرر خورد",
    stop: "حد ضرر جابه‌جا شد و ضرر بزرگ‌تر شد",
    revenge: "قانون نقض شد و ضرر بزرگ‌تر شد"
  },
  strategies: {
    "strategy-range": {
      name: "شکست محدوده‌ی لندن",
      description: "قوانین معامله‌ی شکست محدوده‌ی جلسه‌ی آسیا در بازگشایی لندن، با حد ضرر ثابت و هدف ۳R.",
      entryRules: [
        "سقف و کف محدوده‌ی جلسه‌ی آسیا را پیش از بازگشایی لندن علامت می‌زنم.",
        "منتظر می‌مانم تا یک کندل ۱۵ دقیقه‌ای بیرون از محدوده ببندد.",
        "تقویم اخبار را برای خبرهای مهم ۳۰ دقیقه‌ی بعد بررسی می‌کنم."
      ],
      exitRules: ["هدف را روی ۳R می‌گذارم.", "هر معامله‌ای را که تا پایان جلسه‌ی لندن هنوز باز است، می‌بندم."],
      invalidationRules: ["بسته شدن یک کندل ۱۵ دقیقه‌ای دوباره داخل محدوده، این سناریو را باطل می‌کند."],
      riskRules: [
        "ریسک هر معامله را حداکثر ۱٪ حساب نگه می‌دارم.",
        "بعد از دو ضرر پشت‌سرهم با این ستاپ، همان روز معامله نمی‌کنم.",
        "حداکثر دو معامله را هم‌زمان باز نگه می‌دارم.",
        "بعد از ورود، حد ضرر را دورتر نمی‌برم."
      ],
      allowedSessions: ["لندن"],
      checklist: ["محدوده‌ی آسیا علامت‌گذاری شد", "تقویم اخبار بررسی شد", "حد ضرر و حجم پیش از ورود تعیین شد", "ریسک ۱٪ یا کمتر است"],
      idealMarketConditions: ["محدوده‌ی آسیا دست‌کم ۲۵ پیپ", "بدون خبر مهم در زمان بازگشایی"],
      tags: ["شکست", "لندن"]
    },
    "strategy-gold": {
      name: "پولبک طلا در جهت روند",
      description: "قوانین معامله‌ی پولبک طلا در جهت روند ساعتی، با حد ضرر ثابت و هدف ۳R.",
      entryRules: [
        "قیمت و میانگین ۵۰ دوره‌ای در نمودار ساعتی هم‌جهت‌اند.",
        "منتظر پولبک تا نزدیکی میانگین ۲۰ دوره‌ای می‌مانم.",
        "منتظر می‌مانم تا کندلی در جهت روند ببندد."
      ],
      exitRules: ["هدف را روی ۳R می‌گذارم.", "هر معامله‌ای را که تا پایان همان جلسه هنوز باز است، می‌بندم."],
      invalidationRules: ["بسته شدن یک کندل ساعتی در سمت دیگر میانگین ۵۰ دوره‌ای، این سناریو را باطل می‌کند."],
      riskRules: ["ریسک هر معامله را حداکثر ۰٫۷۵٪ حساب نگه می‌دارم.", "هم‌زمان فقط یک معامله‌ی طلا باز نگه می‌دارم.", "بعد از ورود، حد ضرر را دورتر نمی‌برم."],
      allowedSessions: ["لندن", "نیویورک"],
      checklist: ["جهت روند در نمودار ساعتی تأیید شد", "تقویم اخبار بررسی شد", "حد ضرر و حجم پیش از ورود تعیین شد", "ریسک ۰٫۷۵٪ یا کمتر است"],
      idealMarketConditions: ["روند ساعتی روشن", "بدون خبر مهم در یک ساعت بعد"],
      tags: ["پولبک", "طلا"]
    }
  },
  notes: {
    clean: "چک‌لیست پیش از ورود تیک خورد.",
    win: {
      "strategy-range": {
        pre: [
          "محدوده‌ی آسیا علامت‌گذاری شده و تقویم اخبار خالی است. منتظر بسته شدن کندل ۱۵ دقیقه‌ای بیرون از محدوده هستم.",
          "محدوده به اندازه‌ی کافی بزرگ است و حد ضرر را پیش از ورود گذاشته‌ام. ریسک ۱٪.",
          "همان پلن معامله‌ی تمیز قبلی: بسته شدن بیرون از محدوده و حد ضرر در سمت دیگر کندل."
        ],
        post: [
          "بعد از ورود دست نزدم و پیش از رسیدن به هدف ۳R با سود بستم. به حد ضرر نرسید.",
          "قیمت تا وقتی در معامله بودم بیرون از محدوده ماند. پیش از هدف سود گرفتم و چیزی را تغییر ندادم."
        ],
        lesson: ["صبر برای بسته شدن کندل، ورود را تمیز نگه داشت.", "گذاشتن حد ضرر پیش از ورود، ماندن در معامله را آسان‌تر کرد."]
      },
      "strategy-gold": {
        pre: [
          "روند ساعتی و میانگین ۵۰ دوره‌ای هم‌جهت‌اند. منتظر پولبک تا نزدیکی میانگین ۲۰ دوره‌ای هستم.",
          "روند در نمودار ساعتی برقرار است. حد ضرر و حجم را پیش از ورود تعیین کرده‌ام؛ ریسک ۰٫۷۵٪."
        ],
        post: [
          "قیمت در پولبک حمایت شد و بعد از بسته شدن کندل در جهت روند وارد شدم. پیش از هدف ۳R سود گرفتم.",
          "پولبک کم‌عمق بود و به حد ضرر دست نزدم. پیش از هدف ۳R سود گرفتم."
        ],
        lesson: ["ورود بعد از پولبک حد ضرر کوتاه‌تری داد تا دنبال کردن حرکت.", "دست نزدن به حد ضرر، نتیجه را داخل پلن نگه داشت."]
      }
    },
    loss: {
      post: [
        "با حد ضرر پلن بسته شد. ستاپ معتبر بود و این فقط یک ضرر عادی است.",
        "قیمت از نقطه‌ی ورود برگشت و حد ضرر خورد. فرایند مشکلی نداشت."
      ],
      lesson: ["ضرری که طبق قوانین بسته شود، خطا نیست. چیزی برای تغییر نیست.", "یک ضرر داخل پلن؛ ریسک همان‌قدر بود که قرار بود."]
    },
    late: {
      pre: "کندل شکست بسته شد و من تردید کردم.",
      post: "چند کندل بعد از شکست وارد شدم، وقتی قیمت از محدوده دور شده بود. قیمت برگشت و حد ضرر خورد.",
      lesson: "اگر بسته شدن کندل را از دست بدهم، این معامله را رها می‌کنم.",
      review: "ورود دیرهنگام یعنی قیمت ورود بدتر با همان حد ضرر. قانون ورود نقض شد."
    },
    stop: {
      pre: "پلن روشن بود: حد ضرر زیر کف محدوده.",
      post: (loss) => `قیمت به حد ضرر نزدیک شد و من آن را دورتر بردم، به امید برگشت. ضرر به ${loss}R رسید.`,
      lesson: (loss) => `جابه‌جایی حد ضرر، ضرر ۱R پلن را به ${loss}R رساند. حد ضرر همان‌جا می‌ماند که پلن گذاشته است.`,
      review: "حد ضرر بعد از ورود دورتر رفت؛ قوانین ریسک استراتژی این را اجازه نمی‌دهند."
    },
    revenge: {
      pre: "دو ضرر پشت‌سرهم. می‌خواستم ضرر را جبران کنم.",
      post: (loss) =>
        `بلافاصله بعد از خورده شدن حد ضرر وارد شدم، با حجمی بیشتر از سقف قانونم و روی ستاپی که شرایط ورود را نداشت. گذاشتم قیمت از حد ضرر عبور کند. ${loss}R باختم.`,
      lesson: "بعد از دو ضرر پشت‌سرهم با این ستاپ، قانون می‌گوید همان روز تمام. نوشتن معامله‌ی بعدی پیش از ورود، جلوی این را می‌گرفت.",
      review: (risk, limit) => `ریسک این معامله ${risk}٪ بود؛ سقف استراتژی ${limit}٪ است.`
    }
  },
  plans: {
    complete: {
      bias: "سناریوی صعودی، تا وقتی قیمت بالای محدوده‌ی جلسه‌ی آسیا بماند",
      invalidationRule: "بسته شدن یک کندل ۱۵ دقیقه‌ای دوباره داخل محدوده‌ی آسیا، این پلن را باطل می‌کند.",
      notes: "حجم از سقف ریسک ۱٪ محاسبه می‌شود و حد ضرر پیش از ورود تعیین می‌شود."
    },
    missing: {
      bias: "روند صعودی برقرار است؛ منتظر پولبک تا نزدیکی میانگین ۲۰ دوره‌ای هستم",
      notes: "کار باقی‌مانده: نوشتن قانون ابطال."
    }
  },
  reviews: {
    weekly: {
      summary: (count, wins, losses, net, n) => `${n(count)} معامله در این هفته بسته شد: ${n(wins)} برد و ${n(losses)} باخت، در مجموع ${net}R.`,
      rules: (followed, total, n) => `در ${n(followed)} معامله از ${n(total)} معامله، قوانین رعایت شد.`,
      mistakes: (list) => `خطاهای ثبت‌شده‌ی این هفته: ${list}.`,
      noMistakes: "این هفته خطایی ثبت نشد.",
      ruleBreaks: (count, n) => `${n(count)} معامله با نقض یا رعایت ناقص قوانین همراه بود.`,
      noRuleBreaks: "این هفته قانونی نقض نشد.",
      lessons: ["صبر برای بسته شدن کندل، ورود را تمیز نگه می‌دارد.", "حد ضرری که طبق پلن خورده شود، خطا نیست."],
      nextActions: ["حد ضرر همان‌جا بماند که پلن گذاشته است.", "بعد از دو ضرر پشت‌سرهم با این ستاپ، همان روز معامله نکنم."],
      notes: {
        mistakes: (list) => `ثبت‌شده: ${list}.`,
        noMistakes: "خطایی ثبت نشده بود.",
        focus: "تمرکز هفته‌ی بعد: صبر برای بسته شدن کندل پیش از ورود.",
        guardrail: "بعد از دو ضرر پشت‌سرهم با این ستاپ، همان روز معامله‌ی دیگری نکنم."
      }
    },
    daily: {
      summary: (count, net, n) => `آخرین روز معاملاتی این ژورنال: ${n(count)} معامله، در مجموع ${net}R.`,
      ruleBreaks: (count, n) => `${n(count)} معامله در آن روز با نقض یا رعایت ناقص قوانین همراه بود.`,
      noRuleBreaks: "در آن روز قانونی نقض نشد.",
      nextActions: ["پیش از جلسه‌ی بعد، یک درس از آن روز بنویسم."]
    }
  }
};

export const sampleCopy: Record<Locale, SampleCopy> = { en, fa };
