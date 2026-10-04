import { notFound, redirect } from "next/navigation";
import { contactEmail } from "@/features/access/contact-email";
import { RequestAccessScreen } from "@/features/access/request-access-screen";
import { registrationMode } from "@/lib/auth/registration";
import { getCurrentUser } from "@/lib/auth/session";
import { isLocale } from "@/lib/i18n/locales";

/**
 * Public: ask for access. What the page says follows the server's sign-up mode (an invite code, open, or closed).
 * Someone who is already signed in has no use for it and goes to the dashboard.
 */
export default async function RequestAccessPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (await getCurrentUser()) redirect(`/${locale}/dashboard`);
  return <RequestAccessScreen locale={locale} contactEmail={contactEmail()} registration={registrationMode()} />;
}
