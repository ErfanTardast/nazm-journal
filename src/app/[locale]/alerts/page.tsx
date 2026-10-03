import { notFound } from "next/navigation";
import { AlertsScreen } from "@/features/alerts/alerts-screen";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function AlertsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AlertsScreen locale={locale} messages={getMessages(locale)} />;
}

