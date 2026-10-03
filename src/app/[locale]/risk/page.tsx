import { notFound } from "next/navigation";
import { PlanRiskDesk } from "@/features/risk/plan-desk";
import { planIdFromQuery } from "@/features/risk/plan-sizing";
import { RiskScreen } from "@/features/risk/risk-screen";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function RiskPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ plan?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { plan } = await searchParams;
  return (
    <div className="space-y-6">
      <RiskScreen locale={locale} messages={getMessages(locale)} />
      <PlanRiskDesk locale={locale} planId={planIdFromQuery(plan)} />
    </div>
  );
}
