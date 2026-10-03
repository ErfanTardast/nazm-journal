import { notFound } from "next/navigation";
import { NewsScreen } from "@/features/news/news-screen";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function NewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <NewsScreen locale={locale} messages={getMessages(locale)} />;
}

