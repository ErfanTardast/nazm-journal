import { notFound } from "next/navigation";
import { IdeasScreen } from "@/features/ideas/ideas-screen";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function IdeasPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <IdeasScreen locale={locale} messages={getMessages(locale)} />;
}
