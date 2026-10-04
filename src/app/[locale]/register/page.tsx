import { notFound, redirect } from "next/navigation";
import { AuthPanel } from "@/features/auth/auth-panel";
import { getCurrentUser } from "@/lib/auth/session";
import { registrationMode } from "@/lib/auth/registration";
import { safeNextPath } from "@/lib/auth/return-to";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function RegisterPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const nextPath = safeNextPath((await searchParams).next, locale);
  // Submitting the form while signed in would create a second account and swap the session.
  if (await getCurrentUser()) redirect(nextPath ?? `/${locale}/dashboard`);
  const registration = registrationMode();
  return (
    <AuthPanel
      locale={locale}
      messages={getMessages(locale)}
      mode="register"
      registration={registration}
      inviteRequired={registration === "invite"}
      nextPath={nextPath ?? undefined}
    />
  );
}
