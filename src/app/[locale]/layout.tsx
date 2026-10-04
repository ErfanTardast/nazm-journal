import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { preload } from "react-dom";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/rbac";
import { registrationMode } from "@/lib/auth/registration";
import { brand, sourceUrl } from "@/lib/brand";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale, type Locale } from "@/lib/i18n/locales";

/** The file globals.css loads for Vazirmatn; keep the two in step (tests/unit/locale-layout-font.test.tsx checks it). */
const PERSIAN_FONT = "/fonts/vazirmatn/Vazirmatn-Variable.v1.woff2";

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "fa" }];
}

/** The tab title in the page's own language; the root layout's English title would otherwise sit on every Persian page. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: brand[locale].tagline };
}

export default async function LocaleLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }

  // Persian pages start fetching the font with the document instead of when the stylesheet is parsed, so the first
  // paint is not in a fallback face that then swaps (and shifts the headline). English pages do not need it.
  if (locale === "fa") {
    preload(PERSIAN_FONT, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }

  const messages = getMessages(locale);
  const user = await getCurrentUser();
  return (
    <AppShell
      locale={locale as Locale}
      messages={messages}
      canAccessAdmin={user ? hasRole(user, "admin") : false}
      user={user ? { name: user.name, email: user.email } : null}
      // Read on the server for each request: the public start button follows how sign-up works here, and an operator of a
      // modified copy points the Source code link (AGPL section 13) at that copy with NEXT_PUBLIC_SOURCE_URL.
      registration={registrationMode()}
      sourceUrl={sourceUrl()}
    >
      {children}
    </AppShell>
  );
}
