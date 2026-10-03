import { notFound } from "next/navigation";
import { LearningScreen } from "@/features/learning/learning-screen";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function LearningPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <LearningScreen locale={locale} messages={getMessages(locale)} />;
}

