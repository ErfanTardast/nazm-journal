import { notFound } from "next/navigation";
import { LandingScreen } from "@/features/landing/landing-screen";
import { registrationMode } from "@/lib/auth/registration";
import { getCurrentUser } from "@/lib/auth/session";
import { paymentsEnabled } from "@/lib/billing/enabled";
import { isLocale } from "@/lib/i18n/locales";

/**
 * Rendered per request: it reads the session, and the sign-up mode comes from the server's environment, which a
 * prerendered page would freeze at build time.
 */
export const dynamic = "force-dynamic";

export default async function LocaleIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <LandingScreen
      locale={locale}
      signedIn={Boolean(await getCurrentUser())}
      registration={registrationMode()}
      // "Free during the trial" is only true while this build takes nothing; the same switch the Terms page reads.
      freeTrial={!paymentsEnabled()}
    />
  );
}
