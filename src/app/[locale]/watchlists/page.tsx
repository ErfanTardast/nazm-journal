import { notFound } from "next/navigation";
import { WatchlistsScreen } from "@/features/watchlists/watchlists-screen";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function WatchlistsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <WatchlistsScreen locale={locale} messages={getMessages(locale)} />;
}

