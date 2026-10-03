import { notFound } from "next/navigation";
import { ReviewsScreen } from "@/features/reviews/reviews-screen";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function ReviewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ReviewsScreen locale={locale} messages={getMessages(locale)} />;
}
