import { notFound } from "next/navigation";
import { AiAssistantScreen } from "@/features/ai/ai-assistant-screen";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function AiPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AiAssistantScreen locale={locale} messages={getMessages(locale)} />;
}
