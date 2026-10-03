"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionPanel } from "@/components/ui/section-panel";
import { Select } from "@/components/ui/select";
import { apiFetch } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import type { Locale } from "@/lib/i18n/locales";
import { accessRequestStatuses, type AccessRequestStatus, type TradingPlatform } from "@/lib/validation/access-fields";

type Filter = AccessRequestStatus | "all";

/** What GET /api/admin/access-requests answers: the newest requests, and how many match in all. */
type AccessRequestPage = { items: AccessRequestRow[]; total: number };

type AccessRequestRow = {
  id: string;
  name: string;
  email: string;
  tradingPlatform: TradingPlatform | null;
  note: string | null;
  locale: Locale;
  status: AccessRequestStatus;
  createdAt: string;
};

const copy = {
  en: {
    title: "Access requests",
    description:
      "People who asked for an invite on the request-access page. Marking a request sends nothing: email the invite code yourself.",
    filter: "Status",
    filters: { all: "All", new: "New", invited: "Invited", declined: "Declined" } as Record<Filter, string>,
    statuses: { new: "New", invited: "Invited", declined: "Declined" } as Record<AccessRequestStatus, string>,
    actions: { invited: "Mark invited", declined: "Mark declined", new: "Back to new" } as Record<AccessRequestStatus, string>,
    platforms: { mt5: "MT5", other: "Another platform", manual: "Manual journal" } as Record<TradingPlatform, string>,
    languages: { fa: "Persian", en: "English" } as Record<Locale, string>,
    none: "No requests yet.",
    cut: (shown: string, total: string) => `Showing the newest ${shown} of ${total} requests.`,
    received: "Received",
    remove: "Delete",
    confirmRemove: "Confirm delete",
    cancel: "Cancel",
    loadFailed: "Could not load the requests. Try again.",
    actionFailed: "That change did not go through. Try again."
  },
  fa: {
    title: "درخواست‌های دسترسی",
    description:
      "کسانی که از صفحه‌ی درخواست دسترسی، دعوت خواسته‌اند. تغییر وضعیت چیزی ارسال نمی‌کند؛ کد دعوت را خودتان به ایمیل او بفرستید.",
    filter: "وضعیت",
    filters: { all: "همه", new: "جدید", invited: "دعوت‌شده", declined: "ردشده" } as Record<Filter, string>,
    statuses: { new: "جدید", invited: "دعوت‌شده", declined: "ردشده" } as Record<AccessRequestStatus, string>,
    actions: { invited: "ثبت به‌عنوان دعوت‌شده", declined: "ثبت به‌عنوان ردشده", new: "بازگشت به جدید" } as Record<AccessRequestStatus, string>,
    platforms: { mt5: "متاتریدر ۵ (MT5)", other: "پلتفرم دیگر", manual: "ژورنال دستی" } as Record<TradingPlatform, string>,
    languages: { fa: "فارسی", en: "انگلیسی" } as Record<Locale, string>,
    none: "هنوز درخواستی نیست.",
    cut: (shown: string, total: string) => `فقط جدیدترین ${shown} درخواست از مجموع ${total} درخواست نمایش داده می‌شود.`,
    received: "زمان ثبت",
    remove: "حذف",
    confirmRemove: "تأیید حذف",
    cancel: "انصراف",
    loadFailed: "بارگذاری درخواست‌ها انجام نشد. دوباره تلاش کنید.",
    actionFailed: "این تغییر انجام نشد. دوباره تلاش کنید."
  }
} as const;

const statusTone = { new: "warning", invited: "success", declined: "default" } as const;
/** The buttons of a row, in this order, minus the one for the status it already has. */
const decisionOrder = ["invited", "declined", "new"] as const satisfies readonly AccessRequestStatus[];

/** Admin-only list of the requests for an invite. Renders nothing when the viewer is not an admin (the API answers 401/403). */
export function AccessRequestsPanel({ locale }: { locale: Locale }) {
  const c = copy[locale];
  const numberLocale = locale === "fa" ? "fa-IR" : "en-US";
  const [filter, setFilter] = useState<Filter>("all");
  const [rows, setRows] = useState<AccessRequestRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const latest = useRef(0);
  const currentFilter = useRef<Filter>(filter);
  currentFilter.current = filter;

  const load = useCallback(async (which: Filter) => {
    const request = ++latest.current;
    try {
      const data = await apiFetch<AccessRequestPage>(`/api/admin/access-requests${which === "all" ? "" : `?status=${which}`}`);
      if (request !== latest.current) return; // a newer filter was chosen while this was in flight
      setRows(data.items);
      setTotal(data.total);
      setLoadError(null);
    } catch (err) {
      if (request !== latest.current) return;
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) setHidden(true);
      else setLoadError(apiErrorText(err, locale, c.loadFailed));
    }
  }, [locale, c.loadFailed]);

  useEffect(() => {
    void load(filter);
  }, [load, filter]);

  async function run(id: string, request: () => Promise<unknown>) {
    setBusy(id);
    setConfirming(null);
    setActionError(null);
    try {
      await request();
    } catch (err) {
      setActionError(apiErrorText(err, locale, c.actionFailed));
    } finally {
      setBusy(null);
    }
    // Reload either way (with the filter shown now) so a row another admin already changed is not left stale.
    await load(currentFilter.current);
  }

  const setStatus = (id: string, status: AccessRequestStatus) =>
    run(id, () => apiFetch(`/api/admin/access-requests/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }));
  const remove = (id: string) => run(id, () => apiFetch(`/api/admin/access-requests/${id}`, { method: "DELETE" }));

  if (hidden) return null;

  return (
    <SectionPanel
      title={c.title}
      description={c.description}
      action={
        <Select aria-label={c.filter} value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
          {(["all", ...accessRequestStatuses] as const).map((value) => (
            <option key={value} value={value}>
              {c.filters[value]}
            </option>
          ))}
        </Select>
      }
    >
      {actionError ? <p className="mb-3 text-sm text-destructive">{actionError}</p> : null}
      {loadError ? <p className="mb-3 text-sm text-destructive">{loadError}</p> : null}
      {rows && total > rows.length ? (
        <p className="mb-3 text-xs text-muted-foreground">{c.cut(rows.length.toLocaleString(numberLocale), total.toLocaleString(numberLocale))}</p>
      ) : null}
      {!rows ? null : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{c.none}</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {rows.map((row) => (
            <li key={row.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 max-w-full break-words font-semibold text-foreground [overflow-wrap:anywhere]">
                  <bdi dir="auto">{row.name}</bdi>
                </span>
                <Badge tone={statusTone[row.status] ?? "default"}>{c.statuses[row.status] ?? row.status}</Badge>
                <span className="text-xs text-muted-foreground">{c.languages[row.locale] ?? row.locale}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span dir="ltr" className="select-all break-all font-mono text-foreground">
                  {row.email}
                </span>
                {row.tradingPlatform ? <span>{c.platforms[row.tradingPlatform] ?? row.tradingPlatform}</span> : null}
                <span>
                  {c.received}: {new Date(row.createdAt).toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}
                </span>
              </div>
              {row.note ? (
                <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                  <bdi dir="auto">{row.note}</bdi>
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                {decisionOrder
                  .filter((status) => status !== row.status)
                  .map((status) => (
                    <Button
                      key={status}
                      type="button"
                      variant={status === "new" ? "ghost" : "secondary"}
                      disabled={busy === row.id}
                      onClick={() => setStatus(row.id, status)}
                    >
                      {c.actions[status]}
                    </Button>
                  ))}
                {confirming === row.id ? (
                  <>
                    <Button type="button" variant="danger" disabled={busy === row.id} onClick={() => remove(row.id)}>
                      {c.confirmRemove}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setConfirming(null)}>
                      {c.cancel}
                    </Button>
                  </>
                ) : (
                  <Button type="button" variant="ghost" disabled={busy === row.id} onClick={() => setConfirming(row.id)}>
                    {c.remove}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionPanel>
  );
}
