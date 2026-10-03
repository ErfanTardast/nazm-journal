import { notFound } from "next/navigation";
import { GrowthScreen } from "@/features/growth/growth-screen";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function GrowthPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <GrowthScreen locale={locale} messages={getMessages(locale)} />;
}
