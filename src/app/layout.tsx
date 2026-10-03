import type { Metadata } from "next";
import { headers } from "next/headers";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { brand } from "@/lib/brand";
import { LOCALE_HEADER, entryLocale, isLocale, localeConfig } from "@/lib/i18n/locales";
import "./globals.css";

export const metadata: Metadata = {
  title: brand.en.tagline,
  description: "A bilingual Discipline OS for traders: plan every trade, journal quickly, review behavior, and improve discipline.",
  manifest: "/manifest.webmanifest",
  applicationName: brand.en.name,
  appleWebApp: {
    capable: true,
    title: brand.en.name,
    statusBarStyle: "black-translucent"
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.svg", type: "image/svg+xml" }
    ],
    apple: [{ url: "/apple-touch-icon.svg", type: "image/svg+xml" }]
  }
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The proxy copies the URL's language prefix into a request header; pages outside a language (/offline) use the entry language.
  const requested = (await headers()).get(LOCALE_HEADER);
  const locale = isLocale(requested) ? requested : entryLocale;
  return (
    <html lang={locale} dir={localeConfig[locale].dir} className="dark" suppressHydrationWarning>
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
