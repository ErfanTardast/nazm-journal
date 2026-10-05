import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingState } from "@/components/ui/state";
import { JournalScreen } from "@/features/journal/journal-screen";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locales";

export default async function JournalPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // The journal reads the address (a Performance row opens it narrowed to the trades behind the row), and a page that
  // reads the address while it is built needs a boundary around it.
  return (
    <Suspense fallback={<LoadingState locale={locale} />}>
      <JournalScreen locale={locale} messages={getMessages(locale)} />
    </Suspense>
  );
}
