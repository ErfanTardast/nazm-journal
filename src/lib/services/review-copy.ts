import type { Locale } from "@/lib/i18n/locales";
import { formatGeneratedDate } from "@/lib/services/locale";
import type { ReviewTypeValue } from "@/lib/services/reviews";

/**
 * The wording of generated reviews (titles, default checklists, insights, risks, next actions, carry-forward notes and
 * reminders), in English and Persian. Process review only: no market calls, no signals, no advice. English is the
 * original wording. Numbers arrive already written in the digits of the language; names the user typed stay as typed.
 */
export type ReviewChecklistTemplate = { key: string; label: string };

export type ReviewCopy = {
  /** Writes a list of the user's own tags or names. */
  list(values: string[]): string;
  labels: Record<ReviewTypeValue, string>;
  title: { day(label: string, date: string): string; week(label: string, start: string, end: string): string };
  checklist: Record<ReviewTypeValue, ReviewChecklistTemplate[]>;
  insights: {
    noData: string;
    noUpdates: string;
    linked(count: string, closed: string): string;
    mistakes(tags: string): string;
    emotions(states: string): string;
    strategies(names: string): string;
    weekly(open: string, planned: string): string;
  };
  risks: {
    ruleBreaks(count: string): string;
    mixedRules(count: string): string;
    drawdownMoney(amount: string, r: string, pct: string | null): string;
    drawdownR(r: string): string;
    defaults(perTrade: string, daily: string, weekly: string): string;
    none: string;
  };
  nextActions: {
    prevention(mistake: string): string;
    guardrail: string;
    strategy: string;
    weekly: string;
    lesson: string;
  };
  carry: {
    carryForward: string;
    riskNote: string;
    priorLesson: string;
    created(title: string): string;
    lessons(items: string): string;
    nextActions(items: string): string;
  };
  reminder: { message(title: string): string; body(date: string): string };
};

const en: ReviewCopy = {
  list: (values) => values.join(", "),
  labels: {
    daily: "Daily review",
    weekly: "Weekly review",
    mistake: "Mistake review",
    risk: "Risk discipline review",
    strategy: "Strategy review"
  },
  title: {
    day: (label, date) => `${label} - ${date}`,
    week: (label, start, end) => `${label} - ${start} to ${end}`
  },
  checklist: {
    daily: [
      { key: "review_plans", label: "Review today's planned scenarios and invalidation notes." },
      { key: "check_risk_limits", label: "Confirm risk defaults before adding new journal records." },
      { key: "journal_recent_trades", label: "Update notes, mistakes, lessons, and rule discipline." },
      { key: "review_market_context", label: "Read current market context as background, not as an instruction." },
      { key: "write_one_lesson", label: "Write one process lesson for the next review." }
    ],
    weekly: [
      { key: "summarize_metrics", label: "Summarize closed-trade metrics and drawdown context." },
      { key: "review_mistakes", label: "Identify repeated mistakes and their likely triggers." },
      { key: "review_rule_breaks", label: "Review broken or mixed rule-following records." },
      { key: "choose_focus", label: "Choose one practice focus for the next week." },
      { key: "set_guardrail", label: "Set one risk or checklist guardrail for the next week." }
    ],
    mistake: [
      { key: "identify_top_mistake", label: "Name the most repeated mistake in recent journal records." },
      { key: "find_trigger", label: "Write the context that usually appears before the mistake." },
      { key: "write_prevention_rule", label: "Convert the lesson into a simple prevention rule." },
      { key: "update_checklist", label: "Add or adjust one checklist item to prevent recurrence." }
    ],
    risk: [
      { key: "compare_defaults", label: "Compare journal risk with account risk defaults." },
      { key: "review_drawdown", label: "Review drawdown and loss clustering without changing rules impulsively." },
      { key: "check_open_risk", label: "Check open and planned risk before creating new records." },
      { key: "set_next_limit", label: "Set one written risk guardrail for the next session." }
    ],
    strategy: [
      { key: "review_playbook_rules", label: "Review entry, exit, invalidation, and risk rules." },
      { key: "compare_results", label: "Compare recent records against strategy expectations." },
      { key: "find_common_mistake", label: "Identify the mistake most linked to this strategy." },
      { key: "update_invalidation", label: "Clarify one invalidation or no-trade condition." }
    ]
  },
  insights: {
    noData: "No closed journal data yet. Start with one reviewed plan or one complete journal record.",
    noUpdates: "No journal records were updated in this period. Use the review to decide what should be logged next.",
    linked: (count, closed) => `${count} journal records are linked to this period, including ${closed} closed records.`,
    mistakes: (tags) => `Most repeated mistake tags: ${tags}.`,
    emotions: (states) => `Common emotional states recorded: ${states}.`,
    strategies: (names) => `Active strategy playbooks to review: ${names}.`,
    weekly: (open, planned) => `Weekly review context includes ${open} open journal trades and ${planned} planned scenarios.`
  },
  risks: {
    ruleBreaks: (count) => `${count} records show broken rules. Review causes before adding new plans.`,
    mixedRules: (count) => `${count} records show mixed rule-following and need a clearer checklist note.`,
    drawdownMoney: (amount, r, pct) =>
      `Largest drawdown in closed journal records: ${amount} in account currency (${r}R${pct === null ? "" : `, ${pct}% of the starting balance`}).`,
    drawdownR: (r) => `Largest drawdown in closed journal records: ${r}R (no money values recorded).`,
    defaults: (perTrade, daily, weekly) => `Current defaults: ${perTrade}% per trade, ${daily}% daily loss, ${weekly}% weekly loss.`,
    none: "No risk exceptions were detected from the available journal records."
  },
  nextActions: {
    prevention: (mistake) => `Write one prevention rule for "${mistake}".`,
    guardrail: "Review risk defaults and write the next-session guardrail before adding new journal records.",
    strategy: "Choose one active strategy and update one invalidation or no-trade condition.",
    weekly: "Choose one practice focus for the next week and keep it visible in the next daily review.",
    lesson: "Record one concise lesson and one next action before closing the review."
  },
  carry: {
    carryForward: "Carry forward",
    riskNote: "Risk note",
    priorLesson: "Prior lesson",
    created: (title) => `Carry-forward review created from: ${title}.`,
    lessons: (items) => `Lessons carried forward: ${items}.`,
    nextActions: (items) => `Next actions carried forward: ${items}.`
  },
  reminder: {
    message: (title) => `${title} is ready for review.`,
    body: (date) => `Review period: ${date}`
  }
};

const fa: ReviewCopy = {
  list: (values) => values.join("، "),
  labels: {
    daily: "مرور روزانه",
    weekly: "مرور هفتگی",
    mistake: "مرور اشتباه‌ها",
    risk: "مرور انضباط ریسک",
    strategy: "مرور استراتژی"
  },
  title: {
    day: (label, date) => `${label} - ${formatGeneratedDate(date, "fa")}`,
    week: (label, start, end) => `${label} - ${formatGeneratedDate(start, "fa")} تا ${formatGeneratedDate(end, "fa")}`
  },
  checklist: {
    daily: [
      { key: "review_plans", label: "سناریوهای برنامه‌ریزی‌شده و یادداشت‌های ابطال امروز را مرور کنید." },
      { key: "check_risk_limits", label: "پیش از افزودن رکوردهای جدید ژورنال، پیش‌فرض‌های ریسک را تأیید کنید." },
      { key: "journal_recent_trades", label: "یادداشت‌ها، اشتباه‌ها، درس‌ها و پایبندی به قوانین را به‌روز کنید." },
      { key: "review_market_context", label: "زمینه فعلی بازار را پس‌زمینه بدانید، نه دستور." },
      { key: "write_one_lesson", label: "یک درس فرایندی برای مرور بعدی بنویسید." }
    ],
    weekly: [
      { key: "summarize_metrics", label: "معیارهای معامله‌های بسته‌شده و زمینه افت سرمایه را خلاصه کنید." },
      { key: "review_mistakes", label: "اشتباه‌های تکراری و محرک‌های احتمالی‌شان را شناسایی کنید." },
      { key: "review_rule_breaks", label: "رکوردهایی را که قوانین در آن‌ها نقض شده یا فقط بخشی از آن‌ها رعایت شده مرور کنید." },
      { key: "choose_focus", label: "یک محور تمرین برای هفته بعد انتخاب کنید." },
      { key: "set_guardrail", label: "یک قانون محافظ ریسک یا چک‌لیست برای هفته بعد تعیین کنید." }
    ],
    mistake: [
      { key: "identify_top_mistake", label: "تکرارشده‌ترین اشتباه رکوردهای اخیر ژورنال را نام ببرید." },
      { key: "find_trigger", label: "زمینه‌ای را که معمولاً پیش از اشتباه پیش می‌آید بنویسید." },
      { key: "write_prevention_rule", label: "درس را به یک قانون ساده پیشگیری تبدیل کنید." },
      { key: "update_checklist", label: "برای جلوگیری از تکرار، یک مورد چک‌لیست اضافه یا اصلاح کنید." }
    ],
    risk: [
      { key: "compare_defaults", label: "ریسک ژورنال را با پیش‌فرض‌های ریسک حساب مقایسه کنید." },
      { key: "review_drawdown", label: "افت سرمایه و ضررهای پشت‌سرهم را بدون تغییر عجولانه قوانین مرور کنید." },
      { key: "check_open_risk", label: "پیش از ساخت رکورد جدید، ریسک باز و برنامه‌ریزی‌شده را بررسی کنید." },
      { key: "set_next_limit", label: "یک قانون محافظ ریسک مکتوب برای جلسه بعد تعیین کنید." }
    ],
    strategy: [
      { key: "review_playbook_rules", label: "قوانین ورود، خروج، ابطال و ریسک را مرور کنید." },
      { key: "compare_results", label: "رکوردهای اخیر را با انتظارات استراتژی مقایسه کنید." },
      { key: "find_common_mistake", label: "اشتباهی را که بیشتر به این استراتژی مربوط است شناسایی کنید." },
      { key: "update_invalidation", label: "یک شرط ابطال یا «معامله نکن» را روشن‌تر بنویسید." }
    ]
  },
  insights: {
    noData: "هنوز داده بسته‌شده‌ای در ژورنال نیست. با یک پلن مرورشده یا یک رکورد کامل ژورنال شروع کنید.",
    noUpdates: "در این بازه هیچ رکورد ژورنالی به‌روز نشده است. از این مرور برای تصمیم درباره‌ی رکوردهای بعدی استفاده کنید.",
    linked: (count, closed) => `${count} رکورد ژورنال به این بازه مربوط است که ${closed} رکورد بسته‌شده را شامل می‌شود.`,
    mistakes: (tags) => `پرتکرارترین برچسب‌های اشتباه: ${tags}.`,
    emotions: (states) => `حالت‌های احساسی رایجی که ثبت شده است: ${states}.`,
    strategies: (names) => `پلی‌بوک‌های فعالی که باید مرور شوند: ${names}.`,
    weekly: (open, planned) => `زمینه مرور هفتگی شامل ${open} معامله باز ژورنال و ${planned} سناریوی برنامه‌ریزی‌شده است.`
  },
  risks: {
    ruleBreaks: (count) => `${count} رکورد نقض قوانین را نشان می‌دهد. پیش از افزودن پلن‌های جدید، علت‌ها را مرور کنید.`,
    mixedRules: (count) => `${count} رکورد پایبندی ترکیبی به قوانین را نشان می‌دهد و به یادداشت روشن‌تری در چک‌لیست نیاز دارد.`,
    drawdownMoney: (amount, r, pct) =>
      `بزرگ‌ترین افت در رکوردهای بسته‌شده‌ی ژورنال: ${amount} به واحد پول حساب (${r}R${pct === null ? "" : `، ${pct}٪ از موجودی اولیه`}).`,
    drawdownR: (r) => `بزرگ‌ترین افت در رکوردهای بسته‌شده‌ی ژورنال: ${r}R (مقدار پولی ثبت نشده است).`,
    defaults: (perTrade, daily, weekly) => `پیش‌فرض‌های فعلی: ${perTrade}٪ ریسک هر معامله، ${daily}٪ ضرر روزانه، ${weekly}٪ ضرر هفتگی.`,
    none: "با رکوردهای موجود ژورنال، هیچ استثنای ریسکی دیده نشد."
  },
  nextActions: {
    prevention: (mistake) => `برای «${mistake}» یک قانون پیشگیری بنویسید.`,
    guardrail: "پیش‌فرض‌های ریسک را مرور کنید و پیش از افزودن رکوردهای جدید ژورنال، قانون محافظ جلسه بعد را بنویسید.",
    strategy: "یک استراتژی فعال را انتخاب کنید و یک شرط ابطال یا «معامله نکن» را به‌روز کنید.",
    weekly: "یک محور تمرین برای هفته بعد انتخاب کنید و آن را در مرور روزانه بعدی جلوی چشم نگه دارید.",
    lesson: "پیش از بستن مرور، یک درس کوتاه و یک اقدام بعدی ثبت کنید."
  },
  carry: {
    carryForward: "انتقال به این مرور",
    riskNote: "یادداشت ریسک",
    priorLesson: "درس قبلی",
    created: (title) => `مرور انتقالی از این مرور ساخته شد: ${title}.`,
    lessons: (items) => `درس‌های منتقل‌شده: ${items}.`,
    nextActions: (items) => `اقدامات منتقل‌شده: ${items}.`
  },
  reminder: {
    message: (title) => `${title} آماده مرور است.`,
    body: (date) => `بازه مرور: ${formatGeneratedDate(date, "fa")}`
  }
};

export const reviewCopy: Record<Locale, ReviewCopy> = { en, fa };
