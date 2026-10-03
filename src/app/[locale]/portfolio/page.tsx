import { notFound } from "next/navigation";
import { PortfolioScreen } from "@/features/portfolio/portfolio-screen";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function PortfolioPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <PortfolioScreen locale={locale} messages={getMessages(locale)} />;
}

