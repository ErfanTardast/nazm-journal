import type { Locale } from "@/lib/i18n/locales";
import type { MistakeTag } from "./sample-month";

/** One step of the trader's loop; `outside` marks the step that happens in the trader's own platform. */
type LoopStep = { title: string; hint: string; outside?: boolean };

type LandingCopy = {
  title: string;
  lead: string;
  withInvite: string;
  requestAccess: string;
  signIn: string;
  openDashboard: string;
  beta: string;
  openDemo: string;
  demoSignIn: string;
  demoUser: string;
  openWorkspace: string;
  stage: {
    label: string;
    caption: string;
    net: string;
    drawdown: string;
    adherence: string;
    repeated: string;
    times: string;
    mistakes: Record<MistakeTag, string>;
  };
  pillars: { title: string; body: string }[];
  loop: { title: string; body: string; steps: LoopStep[] };
  charts: {
    title: string;
    body: string;
    importTitle: string;
    importBody: string;
    imported: string;
    duplicate: string;
    importSummary: (imported: string, duplicates: string) => string;
    buy: string;
    sell: string;
    histogramTitle: string;
    histogramBody: string;
    histogramLabel: string;
    riskTitle: string;
    riskBody: string;
    lossToday: string;
    limit: string;
    nextRisk: string;
    size: string;
    lots: string;
  };
  privacy: {
    title: string;
    body: string;
    points: { title: string; body: string }[];
    /** The fourth point, by where reviews run: this server's built-in rules, or an outside AI service the operator set up. */
    coach: { builtIn: { title: string; body: string }; outside: { title: string; body: string } };
  };
  access: { title: string; body: string; haveCode: string; haveCodeBody: string; noCode: string; noCodeBody: string; already: string };
};

export const landingCopy: Record<Locale, LandingCopy> = {
  fa: {
    title: "سیستم عملیاتی معامله‌گر برای برنامه‌ریزی، ثبت، تحلیل و بهبود معاملات",
    lead: "معاملات MT5 را وارد کنید، اشتباه‌های تکراری را پیدا کنید، ریسک را کنترل کنید و استراتژی خود را با دادهٔ واقعی خودتان بهتر کنید.",
    withInvite: "ثبت‌نام با کد دعوت",
    requestAccess: "درخواست دسترسی",
    signIn: "ورود",
    openDashboard: "باز کردن محیط کار",
    beta: "بتای خصوصی. در دورهٔ آزمایشی رایگان است.",
    openDemo: "باز کردن دموی کنفرانس",
    demoSignIn: "ورود با حساب نمایشی",
    demoUser: "حساب نمایشی",
    openWorkspace: "باز کردن محیط کار",
    stage: {
      label: "نمودار نمونه: نتیجهٔ یک ماه معامله به واحد R، با اشتباه‌های علامت‌خورده",
      caption: "دادهٔ نمونه: یک ماه معامله، به واحد R",
      net: "نتیجهٔ ماه",
      drawdown: "بیشترین افت",
      adherence: "پایبندی به قوانین",
      repeated: "تکرارشده",
      times: "بار",
      mistakes: { late: "ورود دیر", stop: "جابه‌جایی حد ضرر", revenge: "معاملهٔ انتقامی" }
    },
    pillars: [
      {
        title: "ورود معاملات از MT5",
        body: "گزارش تاریخچهٔ MT5 را بارگذاری کنید. پله‌های یک ورود یک معامله حساب می‌شوند و بارگذاری دوباره، معاملهٔ تکراری نمی‌سازد."
      },
      {
        title: "مرور و پیدا کردن اشتباه تکراری",
        body: "مربی، ژورنال و قوانین شما را کنار هم می‌گذارد و نشان می‌دهد کدام اشتباه تکرار می‌شود و میانگین نتیجهٔ آن چند R بوده است."
      },
      {
        title: "انضباط ریسک و استراتژی",
        body: "حجم معامله را از ریسک مجاز حساب کنید و پیش از معامله ببینید چقدر به سقف ضرر روزانه نزدیک‌اید."
      }
    ],
    loop: {
      title: "یک چرخه، هفت قدم",
      body: "معامله را در MT5 یا بروکر خودتان انجام می‌دهید. اپ نظم قبل و بعد از آن کنار شماست.",
      steps: [
        { title: "آماده‌سازی", hint: "استراتژی و قوانین ریسک" },
        { title: "پلن", hint: "ورود، حد ضرر، هدف" },
        { title: "اجرا", hint: "در MT5، بیرون از اینجا", outside: true },
        { title: "ورود معاملات", hint: "گزارش MT5 یا ثبت دستی" },
        { title: "ژورنال", hint: "یادداشت، احساس، تصویر" },
        { title: "مرور", hint: "پایبندی و اشتباه‌ها" },
        { title: "بهبود", hint: "به‌روزرسانی قوانین" }
      ]
    },
    charts: {
      title: "سه نمایی که هر روز می‌بینید",
      body: "این سه نما با دادهٔ نمونه پر شده‌اند؛ در حساب شما با معاملات خودتان پر می‌شوند.",
      importTitle: "ورود از گزارش MT5",
      importBody: "پیش‌نمایش، تشخیص تکراری و خلاصهٔ ورود.",
      imported: "وارد شد",
      duplicate: "تکراری، رد شد",
      importSummary: (imported, duplicates) => `${imported} معامله وارد شد، ${duplicates} تکراری رد شد.`,
      buy: "خرید",
      sell: "فروش",
      histogramTitle: "توزیع نتیجه‌ها به R",
      histogramBody: "ستون‌های کهربایی، معامله‌هایی‌اند که قانونی در آن‌ها شکسته شده.",
      histogramLabel: "توزیع نتیجهٔ معامله‌های نمونه به واحد R",
      riskTitle: "سقف ضرر روزانه",
      riskBody: "پیش از معاملهٔ بعدی، فاصله تا سقف را می‌بینید.",
      lossToday: "ضرر امروز",
      limit: "سقف",
      nextRisk: "ریسک معاملهٔ بعدی",
      size: "حجم محاسبه‌شده",
      lots: "لات"
    },
    privacy: {
      title: "دادهٔ معاملات شما، مال شماست",
      body: "ژورنال معاملاتی خصوصی‌ترین دادهٔ یک معامله‌گر است. این چهار چیز در محصول ساخته شده، نه فقط وعده داده شده.",
      points: [
        { title: "خروجی، هر زمان", body: "معامله‌ها، ژورنال، پلن‌ها، مرورها و تنظیمات‌تان را از صفحهٔ تنظیمات در یک فایل دریافت کنید." },
        { title: "حذف حساب و داده", body: "حساب و همهٔ معاملات و یادداشت‌ها را خودتان از تنظیمات پاک می‌کنید." },
        { title: "بدون دسترسی به حساب معاملاتی", body: "اپ نظم به بروکر شما وصل نمی‌شود و هیچ سفارشی ثبت نمی‌کند؛ فقط گزارشی را می‌خواند که خودتان بارگذاری می‌کنید." }
      ],
      coach: {
        builtIn: { title: "مربی روی همین سرور", body: "مرور و تحلیل با قواعد داخلی انجام می‌شود و ژورنال شما برای سرویس هوش مصنوعی بیرونی فرستاده نمی‌شود." },
        outside: {
          title: "مربی و سرویس هوش مصنوعی",
          body: "این سایت برای مربی از یک سرویس هوش مصنوعی بیرونی کمک می‌گیرد. فقط آمار خلاصه و جزئیات معامله‌ای که خودتان برای مرور می‌فرستید به آن سرویس می‌رود."
        }
      }
    },
    access: {
      title: "دسترسی",
      body: "اپ نظم در بتای خصوصی است و در دورهٔ آزمایشی رایگان است. ثبت‌نام فقط با کد دعوت انجام می‌شود.",
      haveCode: "کد دعوت دارم",
      haveCodeBody: "با کد دعوت حساب بسازید و از همین امروز معاملات خود را وارد کنید.",
      noCode: "کد دعوت ندارم",
      noCodeBody: "درخواست بدهید. اگر جا باز شود، کد دعوت به ایمیل شما فرستاده می‌شود.",
      already: "حساب دارید؟"
    }
  },
  en: {
    title: "The trader's operating system for planning, logging, reviewing and improving trades",
    lead: "Import your MT5 trades, find the mistakes you keep repeating, keep risk inside your limits, and improve your strategy with your own data.",
    withInvite: "Sign up with an invite code",
    requestAccess: "Request access",
    signIn: "Sign in",
    openDashboard: "Open dashboard",
    beta: "Private beta. Free during the trial.",
    openDemo: "Open conference demo",
    demoSignIn: "Sign in with demo user",
    demoUser: "Demo user",
    openWorkspace: "Open workspace",
    stage: {
      label: "Sample chart: one month of trades in R, with tagged mistakes",
      caption: "Sample data: one month of trades, in R",
      net: "Month result",
      drawdown: "Deepest drawdown",
      adherence: "Rules followed",
      repeated: "repeated",
      times: "times",
      mistakes: { late: "Late entry", stop: "Moved stop", revenge: "Revenge trade" }
    },
    pillars: [
      {
        title: "Import trades from MT5",
        body: "Upload your MT5 history report. Ladder legs count as one entry, and uploading the same report again creates no duplicates."
      },
      {
        title: "Review and find repeated mistakes",
        body: "The coach reads your journal against your own rules and shows which mistake repeats and its average result in R."
      },
      {
        title: "Risk and strategy discipline",
        body: "Size the position from the risk you allow, and see how close you are to your daily loss limit before the next trade."
      }
    ],
    loop: {
      title: "One loop, seven steps",
      body: "You place the trade in MT5 or with your own broker. Nazm is with you before and after it.",
      steps: [
        { title: "Prepare", hint: "Strategy and risk rules" },
        { title: "Plan", hint: "Entry, stop, target" },
        { title: "Trade", hint: "In MT5, outside this app", outside: true },
        { title: "Import", hint: "MT5 report or manual" },
        { title: "Journal", hint: "Notes, emotion, chart" },
        { title: "Review", hint: "Rules and mistakes" },
        { title: "Improve", hint: "Update the rules" }
      ]
    },
    charts: {
      title: "Three views you use every day",
      body: "These three views show sample data. In your account they fill with your own trades.",
      importTitle: "Import from an MT5 report",
      importBody: "Preview, duplicate detection and an import summary.",
      imported: "Imported",
      duplicate: "Duplicate, skipped",
      importSummary: (imported, duplicates) => `${imported} trades imported, ${duplicates} duplicates skipped.`,
      buy: "Buy",
      sell: "Sell",
      histogramTitle: "Results in R",
      histogramBody: "Amber bars are trades where a rule was broken.",
      histogramLabel: "Distribution of the sample trades' results in R",
      riskTitle: "Daily loss limit",
      riskBody: "See the distance to your limit before the next trade.",
      lossToday: "Loss today",
      limit: "Limit",
      nextRisk: "Risk on the next trade",
      size: "Calculated size",
      lots: "lots"
    },
    privacy: {
      title: "Your trading data stays yours",
      body: "A trading journal is the most private data a trader has. These four things are built into the product, not only promised.",
      points: [
        { title: "Export at any time", body: "Download your trades, journal, plans, reviews and settings from the Settings page in one file." },
        { title: "Delete account and data", body: "Remove your account with every trade and note yourself, from Settings." },
        { title: "No access to your trading account", body: "Nazm never connects to your broker and places no orders. It only reads the report you upload." }
      ],
      coach: {
        builtIn: { title: "The coach runs on this server", body: "Reviews use built-in rules, and your journal is not sent to an outside AI service." },
        outside: {
          title: "The coach and the AI service",
          body: "This site uses an outside AI service for the coach. Only summary figures and the trade details you send for a review go to that service."
        }
      }
    },
    access: {
      title: "Access",
      body: "Nazm is in private beta and free during the trial. Sign-up needs an invite code.",
      haveCode: "I have an invite code",
      haveCodeBody: "Create your account with the code and import your trades today.",
      noCode: "I don't have a code",
      noCodeBody: "Send a request. If a place opens, the invite code is sent to your email.",
      already: "Already have an account?"
    }
  }
};
