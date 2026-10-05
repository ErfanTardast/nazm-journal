import { formatPercent } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

/**
 * A ring filled to `value` (0 to 1). Without `locale` the percent is written as it always was ("80%"); with
 * `locale="fa"` it is written in Persian digits ("۸۰٪").
 */
export function ProgressRing({
  value,
  label,
  className,
  locale
}: {
  value: number;
  label?: string;
  className?: string;
  locale?: Locale;
}) {
  const normalized = Math.max(0, Math.min(1, value));
  const degrees = Math.round(normalized * 360);
  const percent = Math.round(normalized * 100);
  const shown = locale === "fa" ? formatPercent(percent / 100, "fa") : `${percent}%`;

  return (
    <div
      className={cn("grid size-24 place-items-center rounded-full", className)}
      style={{
        background: `conic-gradient(hsl(var(--primary)) ${degrees}deg, hsl(var(--muted)) ${degrees}deg)`
      }}
      aria-label={label ?? (locale === "fa" ? `${shown} تکمیل شده` : `${percent} percent complete`)}
      role="img"
    >
      <div className="grid size-20 place-items-center rounded-full bg-card">
        <span className="text-lg font-semibold text-foreground">{shown}</span>
      </div>
    </div>
  );
}
