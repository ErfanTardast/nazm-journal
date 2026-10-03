import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BacktestScreen } from "@/features/backtesting/backtest-screen";
import { getMessages, t } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";
import { brand } from "@/lib/brand";

// The URL stays /backtests; the page is called the scenario simulator in both languages.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: `${t(getMessages(locale), "pages.backtests")} | ${brand[locale].name}` };
}

export default async function BacktestsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <BacktestScreen locale={locale} messages={getMessages(locale)} />;
}
