import type { Locale } from "@/lib/i18n/locales";

/**
 * The product's name in each language. «نظم» is also an ordinary Persian word ("order, discipline"), so a Persian
 * sentence where the bare word could be read as that word says «اپ نظم» instead, never «برنامه» plus the name (the
 * product avoids «برنامه» for both a plan and an app). The wordmark, page titles and metadata use the bare name;
 * running text uses «اپ نظم».
 */
export const brand: Record<Locale, { name: string; tagline: string }> = {
  en: { name: "Nazm", tagline: "Nazm — the trader's discipline journal" },
  fa: { name: "نظم", tagline: "نظم — دفتر انضباط معامله‌گر" }
};

/** Where the public source code lives. The AGPL asks that people who use a hosted copy can get its source. */
export const DEFAULT_SOURCE_URL = "https://github.com/ErfanTardast/nazm-journal";

/**
 * The address the "Source code" links point at: NEXT_PUBLIC_SOURCE_URL when an operator who runs a modified copy sets
 * it to where that copy's source is published, otherwise the public repository. Only a plain https address is taken
 * (no other scheme, no spaces, no embedded user name or password); anything else is ignored. Read on the server for
 * each request, like the contact address; the shell in the browser gets it as a prop, so it is not read there.
 */
export function sourceUrl(env: Record<string, string | undefined> = process.env): string {
  const value = (env.NEXT_PUBLIC_SOURCE_URL ?? "").trim();
  if (!/^https:\/\/[^\s/?#@]+/i.test(value) || /\s/.test(value)) return DEFAULT_SOURCE_URL;
  try {
    const url = new URL(value);
    const authority = value.slice("https://".length).split(/[/?#]/)[0];
    return url.protocol === "https:" && url.hostname !== "" && !authority.includes("@") ? value : DEFAULT_SOURCE_URL;
  } catch {
    return DEFAULT_SOURCE_URL;
  }
}
