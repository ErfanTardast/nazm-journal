import { notFound } from "next/navigation";
import { CsvImportScreen } from "@/features/import/csv-import-screen";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function ImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <CsvImportScreen locale={locale} messages={getMessages(locale)} />;
}

