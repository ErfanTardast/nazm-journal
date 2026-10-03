import { notFound } from "next/navigation";
import { BillingScreen } from "@/features/billing/billing-screen";
import { paymentsEnabled } from "@/lib/billing/enabled";
import { isLocale } from "@/lib/i18n/locales";

export default async function BillingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !paymentsEnabled()) notFound();
  return <BillingScreen locale={locale} />;
}
