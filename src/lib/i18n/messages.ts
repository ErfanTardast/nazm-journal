import en from "@/messages/en.json";
import fa from "@/messages/fa.json";
import { defaultLocale, isLocale, type Locale } from "./locales";

type Messages = typeof en;

const dictionaries: Record<Locale, Messages> = {
  en,
  fa
};

export function getMessages(locale: string): Messages {
  return dictionaries[isLocale(locale) ? locale : defaultLocale];
}

export function t(messages: Messages, key: string): string {
  const value = key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, messages);

  return typeof value === "string" ? value : key;
}

