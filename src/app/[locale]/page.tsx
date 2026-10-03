import { notFound } from "next/navigation";
import { LandingScreen } from "@/features/landing/landing-screen";
import { getCurrentUser } from "@/lib/auth/session";
import { isLocale } from "@/lib/i18n/locales";

export default async function LocaleIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <LandingScreen locale={locale} signedIn={Boolean(await getCurrentUser())} />;
}
