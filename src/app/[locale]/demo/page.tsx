import { notFound } from "next/navigation";
import { DemoScreen } from "@/features/demo/demo-screen";
import { getMessages } from "@/lib/i18n/messages";
import { demoModeEnabled } from "@/lib/demo";
import { isLocale } from "@/lib/i18n/locales";

export default async function DemoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !demoModeEnabled()) notFound();
  return <DemoScreen locale={locale} messages={getMessages(locale)} />;
}
