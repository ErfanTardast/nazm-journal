import type { Locale } from "./locales";

export function formatMoney(value: number, locale: Locale = "en", currency = "USD") {
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatPercent(value: number, locale: Locale = "en") {
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", {
    style: "percent",
    maximumFractionDigits: 2
  }).format(value);
}

export function formatDate(value: string | Date, locale: Locale = "en") {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

