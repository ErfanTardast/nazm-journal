import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { SectionPanel } from "@/components/ui/section-panel";
import { paymentsEnabled } from "@/lib/billing/enabled";
import { isLocale, type Locale } from "@/lib/i18n/locales";

const copy = {
  en: {
    title: "Terms of Use",
    description: "Nazm is an educational journaling, planning, and review workspace for traders.",
    updated: "Last updated: October 3, 2026",
    draft: "Draft: to be reviewed by a lawyer before public launch.",
    privacyLink: "Privacy Policy",
    sections: [
      {
        title: "What the service is",
        body: [
          "Nazm helps you plan trades, keep a journal, review your process, and follow your own risk rules.",
          "It is not a broker, an exchange, or an investment adviser, and it never holds your money or assets."
        ]
      },
      {
        title: "This is not financial advice",
        body: [
          "Nothing in the app, including AI coach output, reviews, and calculators, is financial advice, a recommendation, or a trade signal.",
          "You make your own trading decisions and you are responsible for their results. Trading can lose more money than you expect."
        ]
      },
      {
        title: "No order execution",
        body: [
          "Nazm never places, modifies, or cancels orders and never connects to a broker or exchange to execute trades.",
          "Trades you record or import are for your own review only."
        ]
      },
      {
        title: "Your account",
        body: [
          "Keep your password private and use your own details. One account is for one person.",
          "Accounts used to abuse or attack the service may be suspended."
        ]
      },
      {
        title: "Paid plans",
        body: [
          "Pro and Elite unlock extra features for the period you pay for. Prices are shown in Toman and USDT before you pay.",
          "You pay by card-to-card transfer or by sending USDT on the TRC20 (Tron) network. Each transfer is checked by hand, and the plan turns on after that check.",
          "For USDT you first get an exact amount reserved for you for 48 hours. Send exactly that amount; a transfer of a different amount cannot be matched to you.",
          "USDT sent on any other network cannot be recovered. Always copy the address from the app and check the network before you send.",
          "A paid plan does not renew automatically. When it ends, your account returns to Free and your data stays.",
          "Your first paid plan has a money-back guarantee: ask for a refund within 7 days of approval and you get the full amount back, in the same way you paid (USDT refunds go to a TRC20 address you give us).",
          "If you are charged but your plan is not activated, contact support and it will be activated or the payment returned."
        ],
        trial: ["Paid plans are not available during this trial. Every feature open in the trial is free to use."]
      },
      {
        title: "Your data",
        body: [
          "How your data is stored and used is described in the Privacy Policy.",
          "You can export your data or permanently delete your account from Settings at any time."
        ]
      },
      {
        title: "Changes to the service",
        body: [
          "Features may change as the product develops. When these terms change, the date at the top of this page changes."
        ]
      }
    ]
  },
  fa: {
    title: "شرایط استفاده",
    description: "اپ نظم یک محیط آموزشی برای ژورنال، برنامه‌ریزی و مرور معامله‌گران است.",
    updated: "آخرین به‌روزرسانی: ۳ اکتبر ۲۰۲۶",
    draft: "پیش‌نویس: پیش از انتشار عمومی باید مشاور حقوقی آن را بررسی کند.",
    privacyLink: "سیاست حریم خصوصی",
    sections: [
      {
        title: "این سرویس چیست",
        body: [
          "اپ نظم به شما کمک می‌کند معامله‌ها را برنامه‌ریزی کنید، ژورنال بنویسید، روند کارتان را مرور کنید و به قوانین ریسک خودتان پایبند بمانید.",
          "این سرویس کارگزار، صرافی یا مشاور سرمایه‌گذاری نیست و هیچ پول یا دارایی‌ای از شما نگه نمی‌دارد."
        ]
      },
      {
        title: "این توصیه مالی نیست",
        body: [
          "هیچ بخشی از برنامه، از جمله خروجی مربی AI، مرورها و ماشین‌حساب‌ها، توصیه مالی نیست و پیشنهاد یا سیگنال معاملاتی هم نیست.",
          "تصمیم‌های معاملاتی را خودتان می‌گیرید و مسئول نتیجه آن‌ها هستید. معامله می‌تواند بیش از انتظارتان زیان داشته باشد."
        ]
      },
      {
        title: "بدون اجرای سفارش",
        body: [
          "اپ نظم هیچ‌وقت سفارشی ثبت، ویرایش یا لغو نمی‌کند و برای اجرای معامله به کارگزار یا صرافی وصل نمی‌شود.",
          "معامله‌هایی که ثبت یا وارد می‌کنید فقط برای مرور خودتان است."
        ]
      },
      {
        title: "حساب کاربری",
        body: [
          "رمز عبورتان را محرمانه نگه دارید و از اطلاعات خودتان استفاده کنید. هر حساب مخصوص یک نفر است.",
          "حساب‌هایی که برای سوءاستفاده یا حمله به سرویس به کار روند ممکن است مسدود شوند."
        ]
      },
      {
        title: "پلن‌های پولی",
        body: [
          "پلن‌های Pro و Elite امکانات بیشتری را برای مدتی که پرداخت کرده‌اید فعال می‌کنند. قیمت‌ها پیش از پرداخت به تومان و USDT نمایش داده می‌شوند.",
          "پرداخت با کارت‌به‌کارت یا ارسال USDT روی شبکه TRC20 (ترون) انجام می‌شود. هر واریز دستی بررسی می‌شود و پلن بعد از آن فعال می‌شود.",
          "برای USDT اول یک مبلغ دقیق برای ۴۸ ساعت به نام شما رزرو می‌شود. دقیقاً همان مبلغ را بفرستید؛ واریز با مبلغ دیگر قابل تطبیق با شما نیست.",
          "USDT ارسال‌شده روی هر شبکه دیگری قابل برگشت نیست. همیشه آدرس را از داخل برنامه کپی کنید و پیش از ارسال شبکه را چک کنید.",
          "پلن پولی خودکار تمدید نمی‌شود. وقتی تمام شود، حساب شما به Free برمی‌گردد و داده‌هایتان حفظ می‌شود.",
          "اولین پلن پولی شما ضمانت بازگشت وجه دارد: تا ۷ روز بعد از تأیید، درخواست بازگشت بدهید تا کل مبلغ به همان روش پرداخت برگردد (بازگشت USDT به آدرس TRC20‌ای که اعلام می‌کنید).",
          "اگر مبلغ از حساب شما کسر شد ولی پلن فعال نشد، با پشتیبانی تماس بگیرید تا پلن فعال شود یا مبلغ برگردانده شود."
        ],
        trial: ["پلن پولی در این نسخه‌ی آزمایشی فعال نیست. همه‌ی امکاناتی که در نسخه‌ی آزمایشی باز است رایگان است."]
      },
      {
        title: "داده‌های شما",
        body: [
          "نحوه نگهداری و استفاده از داده‌هایتان در سیاست حریم خصوصی آمده است.",
          "هر زمان بخواهید می‌توانید از صفحه تنظیمات از داده‌هایتان خروجی بگیرید یا حسابتان را برای همیشه حذف کنید."
        ]
      },
      {
        title: "تغییرات سرویس",
        body: [
          "امکانات ممکن است با توسعه محصول تغییر کنند. هر وقت این شرایط تغییر کند، تاریخ بالای این صفحه هم عوض می‌شود."
        ]
      }
    ]
  }
} as const;

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const c = copy[locale as Locale];

  return (
    <div className="space-y-6">
      <PageHeader title={c.title} description={c.description} />
      <p className="text-sm text-muted-foreground">{c.updated}</p>
      <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">{c.draft}</p>
      <div className="grid gap-4">
        {c.sections.map((section) => (
          <SectionPanel key={section.title} title={section.title}>
            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
              {("trial" in section && !paymentsEnabled() ? section.trial : section.body).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </SectionPanel>
        ))}
      </div>
      <Link href={`/${locale}/privacy`} className="text-sm font-semibold text-primary hover:underline">
        {c.privacyLink}
      </Link>
    </div>
  );
}
