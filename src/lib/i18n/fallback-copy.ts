import { entryLocale, isLocale, type Locale } from "./locales";

/**
 * Text of the app-level fallbacks (loading, error, 404, offline, install prompt). They render outside the screens that
 * receive translated messages, so they carry their own fa/en copy instead of pulling both message files into the bundle.
 */
export const fallbackCopy = {
  en: {
    loading: "Loading workspace",
    errorTitle: "Something went wrong",
    errorBody: "This page could not be loaded. Try again; if it keeps happening, come back in a moment.",
    errorReference: "Reference",
    tryAgain: "Try again",
    notFoundTitle: "Page not found",
    notFoundBody: "The requested Nazm page does not exist.",
    backToWorkspace: "Back to workspace",
    offlineEyebrow: "Offline shell",
    offlineTitle: "Nazm is offline",
    offlineBody: "The installed app shell is available, but live workspace data needs a connection to the server.",
    returnToWorkspace: "Return to workspace",
    installTitle: "Install Nazm",
    installBody: "Add the Discipline OS to this device for faster daily plan, journal, and review access.",
    install: "Install",
    later: "Later"
  },
  fa: {
    loading: "در حال بارگذاری محیط کار",
    errorTitle: "مشکلی پیش آمد",
    errorBody: "این صفحه بارگذاری نشد. دوباره تلاش کنید؛ اگر ادامه داشت کمی بعد سر بزنید.",
    errorReference: "کد پیگیری",
    tryAgain: "تلاش دوباره",
    notFoundTitle: "صفحه پیدا نشد",
    notFoundBody: "این صفحه در اپ نظم وجود ندارد.",
    backToWorkspace: "بازگشت به محیط کار",
    offlineEyebrow: "حالت آفلاین",
    offlineTitle: "اپ نظم آفلاین است",
    offlineBody: "نسخهٔ نصب‌شده باز است، اما برای دیدن داده‌های به‌روز محیط کار باید به اینترنت وصل باشید.",
    returnToWorkspace: "بازگشت به محیط کار",
    installTitle: "نصب اپ نظم",
    installBody: "سیستم انضباط را برای دسترسی سریع‌تر به پلن، ژورنال و مرور روزانه روی این دستگاه اضافه کنید.",
    install: "نصب",
    later: "بعداً"
  }
} as const satisfies Record<Locale, Record<string, string>>;

export function fallbackCopyFor(locale: string | undefined) {
  return fallbackCopy[isLocale(locale) ? locale : entryLocale];
}
