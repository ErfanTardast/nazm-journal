"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionPanel } from "@/components/ui/section-panel";
import { Select } from "@/components/ui/select";
import { apiFetch } from "@/lib/api/client";
import type { Locale } from "@/lib/i18n/locales";

type Status = "pending" | "approved" | "rejected" | "refunded";
type Action = "approve" | "reject" | "refund";

type AdminPayment = {
  id: string;
  tier: string;
  amount: number;
  currency: "toman" | "usdt";
  method: "card_to_card" | "usdt_trc20";
  trackingCode: string;
  paidAt: string;
  status: Status;
  reviewNote: string | null;
  userEmail: string | null;
  refundEligible: boolean;
};

const copy = {
  en: {
    title: "Payments to review",
    description: "Match each transfer against your bank SMS or Tronscan before approving. Approval turns the plan on.",
    filter: "Status",
    statuses: { pending: "Pending", approved: "Approved", rejected: "Rejected", refunded: "Refunded" } as Record<Status, string>,
    none: "Nothing here.",
    deletedUser: "deleted account",
    note: "Note (optional)",
    approve: "Approve",
    reject: "Reject",
    refund: "Refund",
    tronscan: "Open on Tronscan",
    exactAmount: "Approve only if Tronscan shows this exact amount sent to your address.",
    paidAt: "Transferred"
  },
  fa: {
    title: "پرداخت‌های منتظر بررسی",
    description: "پیش از تأیید، هر واریز را با پیامک بانک یا Tronscan تطبیق دهید. تأیید، پلن کاربر را فعال می‌کند.",
    filter: "وضعیت",
    statuses: { pending: "منتظر", approved: "تأییدشده", rejected: "ردشده", refunded: "بازگشت‌داده‌شده" } as Record<Status, string>,
    none: "موردی نیست.",
    deletedUser: "حساب حذف‌شده",
    note: "یادداشت (اختیاری)",
    approve: "تأیید",
    reject: "رد",
    refund: "بازگشت وجه",
    tronscan: "مشاهده در Tronscan",
    exactAmount: "فقط وقتی تأیید کنید که Tronscan دقیقاً همین مبلغ را به آدرس شما نشان دهد.",
    paidAt: "زمان واریز"
  }
} as const;

function formatAmount(locale: Locale, amount: number, currency: "toman" | "usdt") {
  if (currency === "usdt") return `${amount} USDT`;
  return `${amount.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")} ${locale === "fa" ? "تومان" : "Toman"}`;
}

/** Admin-only review queue. Renders nothing when the viewer is not an admin (the API answers 403). */
export function AdminPaymentsPanel({ locale }: { locale: Locale }) {
  const c = copy[locale];
  const [status, setStatus] = useState<Status>("pending");
  const [rows, setRows] = useState<AdminPayment[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const latest = useRef(0);
  const currentStatus = useRef<Status>(status);
  currentStatus.current = status;

  const load = useCallback(async (filter: Status) => {
    const request = ++latest.current;
    try {
      const data = await apiFetch<AdminPayment[]>(`/api/admin/payments?status=${filter}`);
      if (request !== latest.current) return; // a newer filter was chosen while this was in flight
      setRows(data);
      setLoadError(null);
    } catch (err) {
      if (request !== latest.current) return;
      if ((err as { status?: number }).status === 403) setForbidden(true);
      else setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load(status);
  }, [load, status]);

  async function act(id: string, action: Action) {
    setBusy(id);
    setActionError(null);
    try {
      const note = notes[id]?.trim();
      await apiFetch(`/api/admin/payments/${id}`, { method: "POST", body: JSON.stringify(note ? { action, note } : { action }) });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
    // Reload either way (with the filter shown now) so a row another admin already reviewed loses its stale buttons.
    await load(currentStatus.current);
  }

  if (forbidden) return null;

  return (
    <SectionPanel
      title={c.title}
      description={c.description}
      action={
        <Select aria-label={c.filter} value={status} onChange={(event) => setStatus(event.target.value as Status)}>
          {(["pending", "approved", "rejected", "refunded"] as const).map((value) => (
            <option key={value} value={value}>
              {c.statuses[value]}
            </option>
          ))}
        </Select>
      }
    >
      {actionError ? <p className="mb-3 text-sm text-destructive">{actionError}</p> : null}
      {loadError ? <p className="mb-3 text-sm text-destructive">{loadError}</p> : null}
      {!rows ? null : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{c.none}</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {rows.map((row) => (
            <li key={row.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground">{row.userEmail ?? c.deletedUser}</span>
                <Badge>{row.tier}</Badge>
                <span className="text-foreground">{formatAmount(locale, row.amount, row.currency)}</span>
                <span className="text-xs text-muted-foreground">
                  {c.paidAt}: {new Date(row.paidAt).toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span dir="ltr" className="break-all font-mono text-xs text-muted-foreground">{row.trackingCode}</span>
                {row.method === "usdt_trc20" ? (
                  <a
                    href={`https://tronscan.org/#/transaction/${row.trackingCode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {c.tronscan}
                  </a>
                ) : null}
              </div>
              {row.method === "usdt_trc20" && row.status === "pending" ? (
                <p className="text-xs text-warning">{c.exactAmount}</p>
              ) : null}
              {row.status === "pending" || row.refundEligible ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={c.note}
                    placeholder={c.note}
                    className="max-w-xs"
                    value={notes[row.id] ?? ""}
                    onChange={(event) => setNotes((prev) => ({ ...prev, [row.id]: event.target.value }))}
                  />
                  {row.status === "pending" ? (
                    <>
                      <Button type="button" disabled={busy === row.id} onClick={() => act(row.id, "approve")}>
                        {c.approve}
                      </Button>
                      <Button type="button" variant="secondary" disabled={busy === row.id} onClick={() => act(row.id, "reject")}>
                        {c.reject}
                      </Button>
                    </>
                  ) : (
                    <Button type="button" variant="danger" disabled={busy === row.id} onClick={() => act(row.id, "refund")}>
                      {c.refund}
                    </Button>
                  )}
                </div>
              ) : row.reviewNote ? (
                <p className="text-xs text-muted-foreground">{row.reviewNote}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SectionPanel>
  );
}
