import { fallbackCopy } from "@/lib/i18n/fallback-copy";
import { localeConfig } from "@/lib/i18n/locales";

// The service worker serves this one cached page whatever language the visitor was using, so it states itself in both.
// The links are plain anchors on purpose: a soft navigation would keep this page's <html lang dir> on the workspace.
export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        {(["fa", "en"] as const).map((locale) => {
          const c = fallbackCopy[locale];
          return (
            <section key={locale} lang={locale} dir={localeConfig[locale].dir} className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">{c.offlineEyebrow}</p>
              <h1 className="mt-3 text-3xl font-semibold">{c.offlineTitle}</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{c.offlineBody}</p>
              <a href={`/${locale}/dashboard`} className="mt-6 inline-flex h-10 w-fit items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
                {c.returnToWorkspace}
              </a>
            </section>
          );
        })}
      </div>
    </main>
  );
}
