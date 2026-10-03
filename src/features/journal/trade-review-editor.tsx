"use client";

import { useState, type FormEvent } from "react";
import { PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api/client";
import type { Locale } from "@/lib/i18n/locales";

type RuleResult = "followed" | "broken" | "mixed" | "unknown";

export type ReviewableTrade = {
  id: string;
  ruleFollowed: RuleResult;
  lessonsLearned: string | null;
  journalEntry?: { lessonsLearned?: string | null; mistakes?: string[] } | null;
};

/** Reviews written automatically (not by the trader) start with this tag. */
const AUTOMATIC_TAG = "[خودکار · Claude]";

const faDigits = (value: number) => new Intl.NumberFormat("fa-IR").format(value);

const copy = {
  en: {
    edit: "Edit review",
    verdict: "Rule verdict",
    verdicts: { followed: "Followed", mixed: "Mixed", broken: "Broken", unknown: "Not reviewed" },
    lesson: "Lesson",
    mistakes: "Mistakes (tags, comma separated)",
    applyToEntry: (legs: number) => `Apply to all ${legs} legs of this entry`,
    partial: (saved: number, total: number) => `Saved ${saved} of ${total} legs.`,
    automatic: "This review was written automatically from the report data. Edit it so it reflects your own judgment.",
    save: "Save review",
    saving: "Saving...",
    cancel: "Cancel"
  },
  fa: {
    edit: "ویرایش مرور",
    verdict: "وضعیت قانون",
    verdicts: { followed: "رعایت شد", mixed: "بخشی رعایت شد", broken: "شکسته شد", unknown: "مرور نشده" },
    lesson: "درس",
    mistakes: "برچسب خطاها (با ویرگول جدا کنید)",
    applyToEntry: (legs: number) => `برای هر ${faDigits(legs)} پله‌ی این ورود اعمال شود`,
    partial: (saved: number, total: number) => `${faDigits(saved)} از ${faDigits(total)} پله ذخیره شد.`,
    automatic: "این مرور به‌صورت خودکار از داده‌های گزارش نوشته شده است. ویرایشش کنید تا نظر خودتان باشد.",
    save: "ذخیره مرور",
    saving: "در حال ذخیره...",
    cancel: "انصراف"
  }
} as const;

const splitTags = (value: string) =>
  value
    .split(/[,،]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

/**
 * Edits a trade's rule verdict, lesson and mistake tags (PATCH /api/trades). For a leg of a ladder entry the
 * verdict and lesson can go to every leg (entryTrades, the trade itself included). Mistake tags stay per leg:
 * the other legs keep their own, gain the tags added here and lose only the ones removed here.
 */
export function TradeReviewEditor<T extends { id: string }>({
  trade,
  entryTrades,
  locale,
  onSaved
}: {
  trade: ReviewableTrade;
  entryTrades: ReviewableTrade[];
  locale: Locale;
  onSaved: (trades: T[]) => void;
}) {
  const c = copy[locale];
  const lesson = trade.journalEntry?.lessonsLearned ?? trade.lessonsLearned ?? "";
  const [open, setOpen] = useState(false);
  const [applyToEntry, setApplyToEntry] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <PencilLine className="me-2 size-4" aria-hidden="true" />
        {c.edit}
      </Button>
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ruleFollowed = String(form.get("ruleFollowed")) as RuleResult;
    const lessonsLearned = String(form.get("lessonsLearned") ?? "").trim();
    const entered = splitTags(String(form.get("mistakes") ?? ""));
    const original = trade.journalEntry?.mistakes ?? [];
    const added = entered.filter((tag) => !original.includes(tag));
    const removed = original.filter((tag) => !entered.includes(tag));
    const tagsFor = (leg: ReviewableTrade) => {
      if (leg.id === trade.id) return entered;
      const own = (leg.journalEntry?.mistakes ?? []).filter((tag) => !removed.includes(tag));
      return [...own, ...added.filter((tag) => !own.includes(tag))];
    };
    const legs = applyToEntry && entryTrades.length > 1 ? entryTrades : [trade];
    setSaving(true);
    setError(null);
    const saved: T[] = [];
    try {
      for (const leg of legs) {
        const body = { id: leg.id, ruleFollowed, lessonsLearned, journal: { ruleFollowed, lessonsLearned, mistakes: tagsFor(leg) } };
        const data = await apiFetch<{ trade: T }>("/api/trades", { method: "PATCH", body: JSON.stringify(body) });
        saved.push(data.trade);
      }
      onSaved(saved);
      setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Legs saved before the failure are saved: show them, and say how far it got (a retry resaves them harmlessly).
      if (saved.length) onSaved(saved);
      setError(saved.length ? `${c.partial(saved.length, legs.length)} ${message}` : message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-3 rounded-md border border-border bg-muted/20 p-3" onSubmit={save}>
      {lesson.startsWith(AUTOMATIC_TAG) ? <p className="text-xs leading-5 text-warning">{c.automatic}</p> : null}
      <Field label={c.verdict}>
        <Select name="ruleFollowed" defaultValue={trade.ruleFollowed}>
          {(Object.keys(c.verdicts) as RuleResult[]).map((value) => (
            <option key={value} value={value}>
              {c.verdicts[value]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={c.lesson}>
        <Textarea name="lessonsLearned" defaultValue={lesson} rows={3} />
      </Field>
      <Field label={c.mistakes}>
        <Input name="mistakes" defaultValue={(trade.journalEntry?.mistakes ?? []).join(", ")} />
      </Field>
      {entryTrades.length > 1 ? (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={applyToEntry} onChange={(event) => setApplyToEntry(event.target.checked)} />
          {c.applyToEntry(entryTrades.length)}
        </label>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? c.saving : c.save}
        </Button>
        <Button type="button" variant="secondary" disabled={saving} onClick={() => setOpen(false)}>
          {c.cancel}
        </Button>
      </div>
    </form>
  );
}
