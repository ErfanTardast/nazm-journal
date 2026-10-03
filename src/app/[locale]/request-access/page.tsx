import { notFound, redirect } from "next/navigation";
import { contactEmail } from "@/features/access/contact-email";
import { RequestAccessScreen } from "@/features/access/request-access-screen";
import { getCurrentUser } from "@/lib/auth/session";
import { isLocale } from "@/lib/i18n/locales";

/** Public: ask for a trial invite. Someone who is already signed in has no use for it and goes to the dashboard. */
export default async function RequestAccessPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (await getCurrentUser()) redirect(`/${locale}/dashboard`);
  return <RequestAccessScreen locale={locale} contactEmail={contactEmail()} />;
}
