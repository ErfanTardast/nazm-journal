import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { SectionPanel } from "@/components/ui/section-panel";
import { contactEmail } from "@/features/access/contact-email";
import { ContactEmail } from "@/features/access/contact-email-link";
import { paymentsEnabled } from "@/lib/billing/enabled";
import { isLocale, type Locale } from "@/lib/i18n/locales";

// The contact address is read from the environment for each request, never at build time.
export const dynamic = "force-dynamic";

const copy = {
  en: {
    title: "Privacy Policy",
    description: "Nazm is a private planning, journaling, learning, and review workspace for traders.",
    updated: "Last updated: October 3, 2026",
    sections: [
      {
        title: "What we store",
        body: [
          "Account profile details such as email, name, locale, timezone, theme, and risk defaults.",
          "Your first-run answers, if you give them: how you trade (MT5, another platform or a manual journal), your main goal, and when you finished or skipped the first-run steps.",
          "User-entered trading records: plans, trades, journal notes, reviews, playbooks, watchlists, ideas, alerts, sessions, simulated scenarios, portfolios, and attachment metadata.",
          "Security records such as active sign-in sessions, password reset tokens, and user-scoped audit logs."
        ]
      },
      {
        title: "Access requests",
        body: [
          "If you ask for an invite on the request-access page, we store the name and email you type, the page language (English or Persian), and the platform and note if you fill them in. No IP address or browser details are saved with the request.",
          "We use your email only to answer that request, for example to send you an invite code if a place opens.",
          "A request that is still waiting is kept until it has been answered. Once it is answered (invited or declined), it is deleted automatically 30 days later."
        ],
        // Shown only when NEXT_PUBLIC_CONTACT_EMAIL is set: without an address there is no way to ask, so no promise of one.
        contactLine: "You can ask us to delete your request at"
      },
      {
        title: "How the data is used",
        body: [
          "Data is used to operate the product's discipline workflow: readiness, journaling, review, mistake memory, risk calculators, and safe coaching.",
          "Nazm does not place orders, connect to brokers for execution, sell user trading data, or provide financial advice.",
          "External AI and news providers are optional. Missing provider configuration uses local fallback providers instead of sending data externally."
        ]
      },
      {
        title: "Payments",
        body: [
          "When you buy a plan we store the plan, amount, payment method, the time you entered, and the bank reference number or USDT transaction hash you submit. We never store card numbers or wallet keys.",
          "Payment records are kept for accounting after you delete your account, unlinked from your name and email."
        ],
        paymentsOff: ["This server takes no payments, so no payment records are stored."]
      },
      {
        title: "Export and deletion",
        body: [
          "Signed-in users can export their own data from Settings as a JSON file. Sample data loaded into an account is not part of the export.",
          "Signed-in users can permanently delete their account from Settings after password, email, and DELETE confirmation.",
          "Account deletion removes user-scoped records and active sessions, and also the access request made with the same email. The deletion cannot be reversed."
        ]
      },
      {
        title: "AI safety",
        body: [
          "AI outputs are for educational analytics and process review only.",
          "The AI coach refuses requests for trade calls, price targets, market predictions, and order instructions before any external provider call.",
          "Safety disclaimer text is set server-side and is not trusted from model output."
        ]
      }
    ]
  },
  fa: {
    title: "سیاست حریم خصوصی",
    description: "اپ نظم یک محیط خصوصی برای برنامه‌ریزی، ژورنال، یادگیری و مرور معامله‌گران است.",
    updated: "آخرین به‌روزرسانی: ۳ اکتبر ۲۰۲۶",
    sections: [
      {
        title: "چه داده‌ای نگه می‌داریم",
        body: [
          "جزئیات حساب مثل ایمیل، نام، زبان، منطقه زمانی، پوسته و پیش‌فرض‌های ریسک.",
          "پاسخ‌های شروع کار، اگر آن‌ها را بدهید: چطور معامله می‌کنید (MT5، پلتفرم دیگر یا ژورنال دستی)، هدف اصلی‌تان و زمانی که گام‌های شروع را تمام کردید یا رد کردید.",
          "رکوردهای واردشده توسط کاربر: پلن‌ها، معاملات، یادداشت‌های ژورنال، مرورها، پلی‌بوک‌ها، واچ‌لیست‌ها، ایده‌ها، هشدارها، جلسات، سناریوهای شبیه‌سازی‌شده، پورتفولیوها و فراداده پیوست‌ها.",
          "رکوردهای امنیتی مثل نشست‌های ورود فعال، توکن‌های بازیابی رمز و لاگ‌های امنیتی مربوط به کاربر."
        ]
      },
      {
        title: "درخواست دسترسی",
        body: [
          "اگر در صفحه‌ی درخواست دسترسی دعوت بخواهید، نام و ایمیلی را که وارد می‌کنید، زبان صفحه (فارسی یا انگلیسی) و در صورت پر کردن، پلتفرم و توضیح را ذخیره می‌کنیم. آدرس IP و مشخصات مرورگر همراه درخواست ذخیره نمی‌شود.",
          "ایمیل شما فقط برای پاسخ به همین درخواست استفاده می‌شود، مثلاً برای فرستادن کد دعوت اگر جایی باز شود.",
          "درخواستی که هنوز پاسخ نگرفته است تا زمان پاسخ نگه داشته می‌شود. ۳۰ روز پس از پاسخ (دعوت یا رد)، خودکار حذف می‌شود."
        ],
        // Same rule as the English entry: shown only when NEXT_PUBLIC_CONTACT_EMAIL is set.
        contactLine: "برای حذف درخواست‌تان می‌توانید به این نشانی ایمیل بفرستید:"
      },
      {
        title: "داده چگونه استفاده می‌شود",
        body: [
          "داده برای اجرای چرخه انضباط استفاده می‌شود: آمادگی، ژورنال، مرور، حافظه خطا، ماشین‌حساب‌های ریسک و مربی امن.",
          "اپ نظم سفارش ثبت نمی‌کند، برای اجرای معامله به کارگزار وصل نمی‌شود، داده معاملاتی کاربر را نمی‌فروشد و توصیه مالی ارائه نمی‌دهد.",
          "ارائه‌دهنده‌های خارجی AI و خبر اختیاری هستند. نبود تنظیمات ارائه‌دهنده یعنی استفاده از ارائه‌دهنده محلی، نه ارسال داده به بیرون."
        ]
      },
      {
        title: "پرداخت‌ها",
        body: [
          "وقتی پلنی می‌خرید، پلن، مبلغ، روش پرداخت، زمانی که وارد می‌کنید و شماره مرجع بانک یا هش تراکنش USDT را ذخیره می‌کنیم. شماره کارت یا کلید کیف پول هرگز ذخیره نمی‌شود.",
          "سوابق پرداخت پس از حذف حساب، برای حسابداری و بدون ارتباط با نام و ایمیل شما نگه داشته می‌شود."
        ],
        paymentsOff: ["این سرور پرداختی دریافت نمی‌کند، پس سابقه‌ی پرداختی ذخیره نمی‌شود."]
      },
      {
        title: "خروجی و حذف",
        body: [
          "کاربران واردشده می‌توانند از صفحه تنظیمات، داده‌های خود را به صورت JSON خروجی بگیرند. داده نمونه‌ای که در حساب بارگذاری شده باشد در خروجی نیست.",
          "کاربران واردشده می‌توانند پس از تایید رمز، ایمیل و عبارت DELETE حساب خود را برای همیشه حذف کنند.",
          "حذف حساب رکوردهای مربوط به کاربر و نشست‌های فعال، و درخواست دسترسی ثبت‌شده با همان ایمیل را حذف می‌کند. این کار برگشت‌پذیر نیست."
        ]
      },
      {
        title: "ایمنی AI",
        body: [
          "خروجی‌های AI فقط برای تحلیل آموزشی و مرور فرایند هستند.",
          "مربی AI درخواست‌های مربوط به دستور معامله، هدف قیمت، پیش‌بینی بازار و دستور سفارش را پیش از تماس با ارائه‌دهنده خارجی رد می‌کند.",
          "متن سلب مسئولیت ایمنی در سمت سرور تنظیم می‌شود و از خروجی مدل پذیرفته نمی‌شود."
        ]
      }
    ]
  }
} as const;

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const c = copy[locale as Locale];
  const contact = contactEmail();

  return (
    <div className="space-y-6">
      <PageHeader title={c.title} description={c.description} />
      <p className="text-sm text-muted-foreground">{c.updated}</p>
      <div className="grid gap-4">
        {c.sections.map((section) => (
          <SectionPanel key={section.title} title={section.title}>
            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
              {("paymentsOff" in section && !paymentsEnabled() ? section.paymentsOff : section.body).map((item) => (
                <li key={item}>{item}</li>
              ))}
              {"contactLine" in section && contact ? (
                <li>
                  {section.contactLine} <ContactEmail email={contact} />
                  {locale === "en" ? "." : null}
                </li>
              ) : null}
            </ul>
          </SectionPanel>
        ))}
      </div>
    </div>
  );
}
