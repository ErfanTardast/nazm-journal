import { notFound, redirect } from "next/navigation";
import { AuthPanel } from "@/features/auth/auth-panel";
import { registrationMode } from "@/lib/auth/registration";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/return-to";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function LoginPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const nextPath = safeNextPath((await searchParams).next, locale);
  // Someone who is already signed in has no use for the form.
  if (await getCurrentUser()) redirect(nextPath ?? `/${locale}/dashboard`);
  // Where sign-up is closed, "No account yet?" leads to the request-access page rather than to a form that cannot work.
  return <AuthPanel locale={locale} messages={getMessages(locale)} mode="login" registration={registrationMode()} nextPath={nextPath ?? undefined} />;
}
