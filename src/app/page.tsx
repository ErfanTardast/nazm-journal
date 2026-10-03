import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LOCALE_COOKIE, entryLocale, isLocale } from "@/lib/i18n/locales";

// The proxy normally redirects "/" first; this is the same rule for the case it does not: the saved language, else Persian.
export default async function HomePage() {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  redirect(`/${isLocale(saved) ? saved : entryLocale}`);
}
