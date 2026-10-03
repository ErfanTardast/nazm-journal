import { notFound } from "next/navigation";
import { SettingsScreen } from "@/features/settings/settings-screen";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <SettingsScreen locale={locale} messages={getMessages(locale)} />;
}
