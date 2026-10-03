import { notFound } from "next/navigation";
import { StrategyScreen } from "@/features/strategy/strategy-screen";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function StrategiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <StrategyScreen locale={locale} messages={getMessages(locale)} />;
}

