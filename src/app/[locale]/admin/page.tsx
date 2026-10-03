import { notFound } from "next/navigation";
import { AccessRequestsPanel } from "@/features/admin/access-requests-panel";
import { AdminScreen } from "@/features/admin/admin-screen";
import { AdminPaymentsPanel } from "@/features/billing/admin-payments-panel";
import { getMessages } from "@/lib/i18n/messages";
import { paymentsEnabled } from "@/lib/billing/enabled";
import { isLocale } from "@/lib/i18n/locales";

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <div className="space-y-6">
      {/* The access requests are what the owner opens this page for, so the overview shows them right under its heading. */}
      <AdminScreen locale={locale} messages={getMessages(locale)}>
        <AccessRequestsPanel locale={locale} />
      </AdminScreen>
      {paymentsEnabled() ? <AdminPaymentsPanel locale={locale} /> : null}
    </div>
  );
}
