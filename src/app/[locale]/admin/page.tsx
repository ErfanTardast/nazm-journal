import { notFound } from "next/navigation";
import { AccessRequestsPanel } from "@/features/admin/access-requests-panel";
import { AdminForbidden, AdminScreen } from "@/features/admin/admin-screen";
import { AdminPaymentsPanel } from "@/features/billing/admin-payments-panel";
import { AuthRequiredState } from "@/components/ui/state";
import { hasPermission, hasRole } from "@/lib/auth/rbac";
import { getCurrentUser } from "@/lib/auth/session";
import { getMessages } from "@/lib/i18n/messages";
import { paymentsEnabled } from "@/lib/billing/enabled";
import { isLocale } from "@/lib/i18n/locales";

/**
 * Who is looking, decided on the server before any admin data is asked for. It follows the rule of
 * `/api/admin/overview`, which stays the real gate: the admin role or the `admin:read` permission.
 * "unknown" (the session could not be read) leaves the decision to the screen and the API, as it always was.
 */
async function adminAccess(): Promise<"admin" | "denied" | "signed-out" | "unknown"> {
  try {
    const user = await getCurrentUser();
    if (!user) return "signed-out";
    return hasRole(user, "admin") || hasPermission(user, "admin:read") ? "admin" : "denied";
  } catch {
    return "unknown";
  }
}

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Nothing admin-only is mounted for these two, so no request goes out and the browser logs no 401 or 403.
  const access = await adminAccess();
  if (access === "denied") return <AdminForbidden locale={locale} />;
  if (access === "signed-out") return <AuthRequiredState locale={locale} />;

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
