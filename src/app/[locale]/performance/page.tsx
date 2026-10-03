import { notFound } from "next/navigation";
import { PerformanceScreen } from "@/features/performance/performance-screen";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function PerformancePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <PerformanceScreen locale={locale} messages={getMessages(locale)} />;
}

