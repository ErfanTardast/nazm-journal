import { notFound } from "next/navigation";
import { JournalScreen } from "@/features/journal/journal-screen";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function JournalPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <JournalScreen locale={locale} messages={getMessages(locale)} />;
}

