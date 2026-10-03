import { notFound } from "next/navigation";
import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <OnboardingScreen locale={locale} messages={getMessages(locale)} />;
}
