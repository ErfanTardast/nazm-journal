import { notFound } from "next/navigation";
import { TradePlansScreen } from "@/features/trade-plans/trade-plans-screen";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function PlansPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ strategy?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // A strategy row links here with ?strategy=<id>; the screen only uses it when the id is one of the user's strategies.
  const { strategy } = await searchParams;
  const initialStrategyId = (Array.isArray(strategy) ? strategy[0] : strategy)?.trim() || undefined;
  return <TradePlansScreen locale={locale} messages={getMessages(locale)} initialStrategyId={initialStrategyId} />;
}
