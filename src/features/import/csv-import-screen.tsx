"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Columns3, Download, RotateCcw, ShieldCheck, UploadCloud, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MobileDataList } from "@/components/ui/mobile-data-list";
import { PremiumPanel } from "@/components/ui/premium-panel";
import { SectionPanel } from "@/components/ui/section-panel";
import { Select } from "@/components/ui/select";
import { AuthRequiredState } from "@/components/ui/state";
import { Textarea } from "@/components/ui/textarea";
import { announceSampleRemoved } from "@/features/sample/sample-workspace-client";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import { previewTradeCsv, splitCsvLine, suggestMapping } from "@/lib/import/csv";
import { readImportFile } from "@/lib/import/mt5-report";
import { NEW_YORK_CLOSE, timeZoneLabel } from "@/lib/time/zones";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

type Messages = ReturnType<typeof getMessages>;

const requiredTargets = ["symbol", "market", "side", "entryPrice", "quantity", "openedAt"] as const;
const optionalTargets = [
  "status",
  "exitPrice",
  "stopLoss",
  "takeProfit",
  "fees",
  "closedAt",
  "session",
  "setupType",
  "emotionalState",
  "mistakes",
  "tags",
  "notes",
  "postTradeNotes",
  "lessonsLearned",
  "ruleFollowed"
] as const;

const defaultMapping = {
  symbol: "symbol",
  market: "market",
  side: "side",
  status: "status",
  entryPrice: "entryPrice",
  exitPrice: "exitPrice",
  stopLoss: "stopLoss",
  takeProfit: "takeProfit",
  quantity: "quantity",
  fees: "fees",
  openedAt: "openedAt",
  closedAt: "closedAt",
  session: "session",
  setupType: "setupType",
  emotionalState: "emotionalState",
  mistakes: "mistakes",
  tags: "tags",
  notes: "notes",
  postTradeNotes: "postTradeNotes",
  lessonsLearned: "lessonsLearned",
  ruleFollowed: "ruleFollowed"
};

const sampleCsv = [
  "symbol,market,side,status,entryPrice,exitPrice,stopLoss,takeProfit,quantity,fees,openedAt,closedAt,session,setupType,emotionalState,mistakes,tags,notes,postTradeNotes,lessonsLearned,ruleFollowed",
  "BTCUSDT,crypto,long,closed,65000,66000,64000,67000,0.1,8,2026-06-10T09:00:00.000Z,2026-06-10T12:00:00.000Z,New York,Breakout retest,Focused,,breakout|discipline,Followed checklist,Managed according to plan,Wait for retest confirmation,followed",
  "EURUSD,forex,short,closed,1.0820,1.0780,1.0860,1.0740,100000,7,2026-06-09T08:00:00.000Z,2026-06-09T10:00:00.000Z,London,Retest,Calm,late-entry,forex|review,Reviewed calendar context,Reduced size after volatility,Respect event timing,mixed",
  "AAPL,stocks,long,planned,190,,184,199,5,0,2026-06-11T14:30:00.000Z,,New York,Earnings pullback,Patient,,stocks|watchlist,Plan only; review after open,,,unknown"
].join("\n");

const copy = {
  en: {
    eyebrow: "Journal import",
    description:
      "Upload your MT5 history report and check the preview before anything is saved. Positions that make up one laddered entry count as one trade, and uploading the same MT5 report again, or an overlapping one, adds no duplicates.",
    fileTitle: "File and template",
    fileDesc: "Use the sample format or paste exported history. Data stays in the browser until you preview or import.",
    selectCsv: "MT5 report or CSV file",
    mt5Hint: "MetaTrader 5: History tab, switch to Positions, right-click Report, HTML. Upload that file as it is.",
    mt5Converted: (positions: number, skipped: number) =>
      `MT5 report converted: ${positions} closed position${positions === 1 ? "" : "s"}${
        skipped ? `, ${skipped} balance row${skipped === 1 ? "" : "s"} skipped` : ""
      }. Check the preview, then import.`,
    brokerTime: (zone: string) => `MT5 times are read as broker time: ${zone}. Change it in Settings if your broker uses another.`,
    mt5Errors: {
      no_positions_table: "This MT5 file has no Positions table. In History switch the view to Positions, then Report.",
      no_trades: "The MT5 Positions table has no buy or sell rows in this period."
    },
    choose: "Choose the MT5 report or a CSV file",
    chooseHint: "or paste your exported history in the box below",
    csvContent: "CSV content",
    preview: "Preview import",
    importRows: "Import valid rows",
    validation: "Preview and validation",
    mapping: "Column mapping",
    mappingDesc: "Map your CSV headers to Nazm fields before importing.",
    autoMap: "Auto-map columns",
    autoMapHint: "Detected headers are matched to Nazm fields automatically. Adjust any that look wrong.",
    detected: "Detected headers",
    noHeaders: "No headers detected yet. Upload or paste a CSV with a header row.",
    requiredMapped: "required fields mapped",
    unmappedRequired: "Unmapped required fields",
    required: "Required fields",
    optional: "Optional fields",
    messages: "Messages",
    status: "Status",
    row: "Row",
    loadSample: "Load sample (example data)",
    download: "Download sample CSV",
    openJournal: "Open journal",
    privacy: "Private import. This screen reviews records and does not provide trading instructions.",
    validSummary: "valid rows",
    reviewSummary: "need review",
    ready: "Ready",
    alreadyImported: "Already in the journal",
    alreadyImportedDetail: "This position is already in the journal (from an earlier import); it will be skipped.",
    review: "Review",
    invalidGuide: "Fix invalid rows in the CSV text or adjust mapping, then preview again.",
    rowProblem: (columns: string) => `Check these columns: ${columns}`,
    rowCheckValues: "Check the values in this row.",
    listSeparator: ", ",
    requiredHint: "Minimum required columns: symbol, market, side, entryPrice, quantity, openedAt.",
    supportedHint: "Supported markets are forex, crypto, and global stocks.",
    imported: (count: number) => `${count} trade${count === 1 ? "" : "s"} imported into the journal.`,
    duplicates: (count: number) => `${count} already in the journal ${count === 1 ? "was" : "were"} skipped.`,
    previewed: "rows checked.",
    failed: "The import did not go through. Check the file and try again in a moment.",
    rows: "Rows",
    market: "Market",
    requiredBadge: "Required",
    markets: { crypto: "Crypto", forex: "Forex", stocks: "Global stocks" } as Record<string, string>
  },
  fa: {
    eyebrow: "ورود ژورنال",
    description:
      "گزارش تاریخچه MT5 را بارگذاری کنید و پیش از ذخیره، پیش‌نمایش را بررسی کنید. پوزیشن‌هایی که یک ورود پلکانی را می‌سازند یک معامله حساب می‌شوند و بارگذاری دوباره همان گزارش MT5 یا گزارشی هم‌پوشان، معامله تکراری اضافه نمی‌کند.",
    fileTitle: "فایل و قالب",
    fileDesc: "از قالب نمونه استفاده کنید یا خروجی تاریخچه خود را بچسبانید. داده تا زمان پیش‌نمایش یا ورود در مرورگر می‌ماند.",
    selectCsv: "گزارش MT5 یا فایل CSV",
    mt5Hint: "متاتریدر ۵: تب History، نمای Positions، راست‌کلیک Report و HTML. همان فایل را بدون تغییر بارگذاری کنید.",
    mt5Converted: (positions: number, skipped: number) =>
      `گزارش MT5 تبدیل شد: ${positions} پوزیشن بسته${skipped ? `، ${skipped} ردیف موجودی کنار گذاشته شد` : ""}. پیش‌نمایش را چک کنید و بعد وارد کنید.`,
    brokerTime: (zone: string) => `زمان‌های MT5 به وقت بروکر خوانده می‌شوند: ${zone}. اگر بروکر شما زمان دیگری دارد، در تنظیمات عوضش کنید.`,
    mt5Errors: {
      no_positions_table: "این فایل MT5 جدول Positions ندارد. در History نما را روی Positions بگذارید و بعد Report بگیرید.",
      no_trades: "در جدول Positions این بازه هیچ ردیف خرید یا فروشی نیست."
    },
    choose: "انتخاب گزارش MT5 یا فایل CSV",
    chooseHint: "یا تاریخچه صادرشده خود را در کادر زیر بچسبانید",
    csvContent: "محتوای CSV",
    preview: "پیش‌نمایش ورود",
    importRows: "ورود ردیف‌های معتبر",
    validation: "پیش‌نمایش و اعتبارسنجی",
    mapping: "نگاشت ستون‌ها",
    mappingDesc: "قبل از ورود، سرستون‌های CSV را به فیلدهای اپ نظم وصل کنید.",
    autoMap: "نگاشت خودکار ستون‌ها",
    autoMapHint: "سرستون‌های شناسایی‌شده به‌طور خودکار به فیلدهای اپ نظم وصل می‌شوند. موارد نادرست را اصلاح کنید.",
    detected: "سرستون‌های شناسایی‌شده",
    noHeaders: "هنوز سرستونی شناسایی نشده است. یک CSV با ردیف سرستون بارگذاری یا جای‌گذاری کنید.",
    requiredMapped: "فیلد ضروری نگاشت شد",
    unmappedRequired: "فیلدهای ضروری بدون نگاشت",
    required: "فیلدهای ضروری",
    optional: "فیلدهای اختیاری",
    messages: "پیام‌ها",
    status: "وضعیت",
    row: "ردیف",
    loadSample: "بارگذاری داده نمونه (ساختگی)",
    download: "دانلود CSV نمونه",
    openJournal: "باز کردن ژورنال",
    privacy: "ورود خصوصی داده. این صفحه رکوردها را مرور می‌کند و دستور معامله ارائه نمی‌دهد.",
    validSummary: "ردیف معتبر",
    reviewSummary: "نیازمند بررسی",
    ready: "آماده",
    alreadyImported: "از قبل در ژورنال",
    alreadyImportedDetail: "این پوزیشن از یک ورود قبلی در ژورنال هست و کنار گذاشته می‌شود.",
    review: "بررسی",
    invalidGuide: "ردیف‌های نامعتبر را در متن CSV اصلاح کنید یا نگاشت را تغییر دهید، سپس دوباره پیش‌نمایش بگیرید.",
    rowProblem: (columns: string) => `این ستون‌ها را بررسی کنید: ${columns}`,
    rowCheckValues: "مقادیر این ردیف را بررسی کنید.",
    listSeparator: "، ",
    requiredHint: "حداقل ستون‌های ضروری: symbol, market, side, entryPrice, quantity, openedAt.",
    supportedHint: "بازارهای پشتیبانی‌شده: فارکس، کریپتو و سهام جهانی.",
    imported: (count: number) => `${count} معامله وارد ژورنال شد.`,
    duplicates: (count: number) => `${count} مورد از قبل در ژورنال بود و کنار گذاشته شد.`,
    previewed: "ردیف بررسی شد.",
    failed: "ورود انجام نشد. فایل را بررسی کنید و چند لحظه بعد دوباره تلاش کنید.",
    rows: "ردیف‌ها",
    market: "بازار",
    requiredBadge: "ضروری",
    markets: { crypto: "کریپتو", forex: "فارکس", stocks: "سهام جهانی" } as Record<string, string>
  }
} as const;

export function CsvImportScreen({ locale, messages }: { locale: Locale; messages: Messages }) {
  const c = copy[locale];
  // Starts empty: the sample trades are fake, so they are loaded only by the explicit button.
  const [csv, setCsv] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>(defaultMapping);
  const [summary, setSummary] = useState<string | null>(null);
  // The csv and mapping that were imported last; importing the same text again would only add it a second time.
  const [importedInput, setImportedInput] = useState<{ csv: string; mapping: Record<string, string> } | null>(null);
  // Rows the server found already in the journal, for the csv and mapping it checked.
  const [serverDuplicates, setServerDuplicates] = useState<{ csv: string; mapping: Record<string, string>; rows: Set<number> } | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "warning"; text: string } | null>(null);
  // Set while the loaded file is an MT5 report: its zone-less times are the broker's server time.
  const [brokerZone, setBrokerZone] = useState<string | null>(null);
  // True while the broker zone for a just-loaded MT5 report is being read: importing then would parse its times wrongly.
  const [zonePending, setZonePending] = useState(false);

  const headers = useMemo(() => {
    const firstLine = csv.trim().split(/\r?\n/)[0] ?? "";
    return splitCsvLine(firstLine).map((header) => header.trim()).filter(Boolean);
  }, [csv]);

  const preview = useMemo(() => previewTradeCsv(csv, mapping), [csv, mapping]);
  const duplicateRows = serverDuplicates && serverDuplicates.csv === csv && serverDuplicates.mapping === mapping ? serverDuplicates.rows : null;
  const isDuplicate = (rowNumber: number) => duplicateRows?.has(rowNumber) ?? false;
  const alreadyImported = importedInput !== null && importedInput.csv === csv && importedInput.mapping === mapping;
  const validRows = preview.filter((row) => row.isValid).length;
  const invalidRows = preview.length - validRows;

  /**
   * What the Messages column says about a row. The validator's own text is English ("Invalid input: expected number..."),
   * so a rejected row names the columns to check instead; the names are the CSV column names, which stay as spelled.
   */
  const rowMessage = (row: (typeof preview)[number]) => {
    if (row.errors.length > 0) {
      const columns = Array.from(new Set(row.errors.map((problem) => problem.split(":")[0].trim()).filter(Boolean)));
      return columns.length > 0 ? c.rowProblem(columns.join(c.listSeparator)) : c.rowCheckValues;
    }
    return isDuplicate(row.rowNumber) ? c.alreadyImportedDetail : c.ready;
  };

  const unmappedRequired = useMemo(
    () => requiredTargets.filter((field) => !mapping[field] || !headers.includes(mapping[field])),
    [mapping, headers]
  );
  const mappedRequiredCount = requiredTargets.length - unmappedRequired.length;

  function autoMap(source: string[]) {
    if (source.length === 0) return;
    setMapping(suggestMapping(source));
    setSummary(null);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const result = readImportFile(await file.arrayBuffer());
    setSummary(null);
    setError(null);
    if (result.kind === "mt5_error") {
      setNotice({ tone: "warning", text: c.mt5Errors[result.code] });
      return;
    }
    setCsv(result.csv);
    if (result.kind === "mt5") {
      setMapping(result.mapping);
      setNotice({ tone: "success", text: c.mt5Converted(result.positions, result.skippedNonTrades) });
      setBrokerZone(null);
      setZonePending(true);
      const settings = await apiFetch<{ settings: { brokerTimeZone?: string | null } }>("/api/users/me/settings").catch(() => null);
      setBrokerZone(settings?.settings.brokerTimeZone ?? NEW_YORK_CLOSE);
      setZonePending(false);
      return;
    }
    setBrokerZone(null);
    setNotice(null);
    const firstLine = result.csv.trim().split(/\r?\n/)[0] ?? "";
    autoMap(splitCsvLine(firstLine).map((header) => header.trim()).filter(Boolean));
  }

  function updateMapping(target: string, source: string) {
    setMapping((current) => ({ ...current, [target]: source }));
    setSummary(null);
  }

  function loadSample() {
    setBrokerZone(null);
    setCsv(sampleCsv);
    setMapping(defaultMapping);
    setSummary(null);
    setError(null);
  }

  function downloadSample() {
    const blob = new Blob([sampleCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "nazm-sample-trades.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function runImport(previewOnly: boolean) {
    setError(null);
    setSummary(null);
    setBusy(previewOnly ? "preview" : "import");
    try {
      const data = await apiFetch<{
        imported: number;
        duplicates?: number;
        validRows: number;
        invalidRows: number;
        preview?: { rowNumber: number; duplicate?: boolean }[];
        sampleRemoved?: boolean;
      }>("/api/trades/import", {
        method: "POST",
        body: JSON.stringify({ csv, mapping, filename: "nazm-import.csv", previewOnly, ...(brokerZone ? { timeZone: brokerZone } : {}) })
      });
      // The first imported trade removed the sample data: the label in the shell goes now and says why.
      if (data.sampleRemoved) announceSampleRemoved();
      setServerDuplicates({ csv, mapping, rows: new Set((data.preview ?? []).filter((row) => row.duplicate).map((row) => row.rowNumber)) });
      if (!previewOnly) setImportedInput({ csv, mapping });
      // Positions from an overlapping report that were imported before are skipped, not added twice.
      const skipped = data.duplicates ? ` ${c.duplicates(data.duplicates)}` : "";
      setSummary(
        previewOnly
          ? `${data.validRows} ${c.validSummary}, ${data.invalidRows} ${c.reviewSummary}; ${preview.length} ${c.previewed}${skipped}`
          : `${c.imported(data.imported)}${skipped}`
      );
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  if (isAuthError(error)) return <AuthRequiredState locale={locale} />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={c.eyebrow}
        title={t(messages, "pages.import")}
        description={c.description}
        action={
          <Link
            href={`/${locale}/journal`}
            className="inline-flex min-h-11 items-center rounded-md border border-border bg-muted/80 px-4 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {c.openJournal}
            <ArrowRight className="ms-2 size-4" aria-hidden="true" />
          </Link>
        }
      />

      <div className="rounded-lg border border-primary/20 bg-primary/10 p-4 text-sm leading-6 text-foreground">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <p>{c.privacy}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-4">
          <SectionPanel title={c.fileTitle} description={c.fileDesc}>
            <div className="space-y-4">
              <Field label={c.selectCsv} hint={c.requiredHint}>
                <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center transition hover:border-primary/50 hover:bg-primary/5 focus-within:ring-2 focus-within:ring-primary">
                  <UploadCloud className="mb-2 size-6 text-primary" aria-hidden="true" />
                  <span className="text-sm font-semibold text-foreground">{c.choose}</span>
                  <span className="mt-1 text-xs text-muted-foreground">{c.chooseHint}</span>
                  <input className="sr-only" type="file" accept=".csv,.htm,.html,text/csv,text/html" onChange={handleFile} />
                </label>
              </Field>
              <p className="text-xs text-muted-foreground">{c.mt5Hint}</p>
              {notice ? (
                <p
                  className={cn(
                    "rounded-md border p-3 text-sm",
                    notice.tone === "success" ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-foreground"
                  )}
                  aria-live="polite"
                >
                  {notice.text}
                </p>
              ) : null}
              {brokerZone ? <p className="text-xs text-muted-foreground">{c.brokerTime(timeZoneLabel(brokerZone, locale))}</p> : null}

              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" variant="secondary" onClick={downloadSample}>
                  <Download className="me-2 size-4" aria-hidden="true" />
                  {c.download}
                </Button>
                <Button type="button" variant="secondary" onClick={loadSample}>
                  <RotateCcw className="me-2 size-4" aria-hidden="true" />
                  {c.loadSample}
                </Button>
              </div>

              <Field label={c.csvContent} hint={c.supportedHint}>
                <Textarea
                  value={csv}
                  onChange={(event) => {
                    // Hand-edited text is no longer the MT5 report whose times are broker time.
                    setBrokerZone(null);
                    setCsv(event.target.value);
                  }}
                  placeholder={sampleCsv.split("\n")[0]}
                  className="min-h-72 font-mono text-xs leading-5"
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Button type="button" variant="secondary" onClick={() => runImport(true)} disabled={busy !== null || zonePending}>
                  <CheckCircle2 className="me-2 size-4" aria-hidden="true" />
                  {busy === "preview" ? "..." : c.preview}
                </Button>
                <Button type="button" onClick={() => runImport(false)} disabled={busy !== null || zonePending || invalidRows > 0 || validRows === 0 || alreadyImported}>
                  <UploadCloud className="me-2 size-4" aria-hidden="true" />
                  {busy === "import" ? "..." : c.importRows}
                </Button>
              </div>

              {summary ? (
                <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success" aria-live="polite">
                  {summary}
                </p>
              ) : null}
              {error && !isAuthError(error) ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                  {apiErrorText(error, locale, c.failed, { csv: c.csvContent, mapping: c.mapping })}
                </p>
              ) : null}
            </div>
          </SectionPanel>

          <SectionPanel title={c.mapping} description={c.mappingDesc}>
            <div className="mb-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button type="button" variant="secondary" onClick={() => autoMap(headers)} disabled={headers.length === 0}>
                  <Wand2 className="me-2 size-4" aria-hidden="true" />
                  {c.autoMap}
                </Button>
                <Badge tone={unmappedRequired.length === 0 ? "success" : "warning"}>
                  {mappedRequiredCount}/{requiredTargets.length} {c.requiredMapped}
                </Badge>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">{c.autoMapHint}</p>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">{c.detected}</p>
                {headers.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {headers.map((header) => (
                      <span
                        key={header}
                        className={cn(
                          "rounded border px-2 py-0.5 text-[11px] font-medium",
                          Object.values(mapping).includes(header)
                            ? "border-primary/30 bg-primary/10 text-foreground"
                            : "border-border bg-muted/40 text-muted-foreground"
                        )}
                      >
                        {header}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">{c.noHeaders}</p>
                )}
              </div>
              {unmappedRequired.length > 0 ? (
                <p className="rounded-md border border-warning/30 bg-warning/10 p-2.5 text-xs text-foreground" role="status">
                  {c.unmappedRequired}: <span className="font-semibold">{unmappedRequired.join(", ")}</span>
                </p>
              ) : null}
            </div>
            <div className="border-t border-border pt-5">
              <MappingGroup title={c.required} fields={requiredTargets} headers={headers} mapping={mapping} onChange={updateMapping} requiredLabel={c.requiredBadge} />
            </div>
            <div className="mt-5 border-t border-border pt-5">
              <MappingGroup title={c.optional} fields={optionalTargets} headers={headers} mapping={mapping} onChange={updateMapping} />
            </div>
          </SectionPanel>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryPill label={c.rows} value={String(preview.length)} />
            <SummaryPill label={c.validSummary} value={String(validRows)} tone="success" />
            <SummaryPill label={c.reviewSummary} value={String(invalidRows)} tone={invalidRows > 0 ? "danger" : "success"} />
          </div>

          {invalidRows > 0 ? (
            <PremiumPanel className="border-destructive/30 bg-destructive/10 p-4">
              <div className="flex gap-3 text-sm leading-6 text-foreground">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
                <p>{c.invalidGuide}</p>
              </div>
            </PremiumPanel>
          ) : null}

          <SectionPanel title={c.validation} description={`${validRows} ${c.validSummary} / ${invalidRows} ${c.reviewSummary}`}>
            <div className="md:hidden">
              <MobileDataList
                rows={preview}
                getKey={(row) => String(row.rowNumber)}
                emptyTitle={t(messages, "common.emptyTitle")}
                emptyDescription={t(messages, "common.emptyDescription")}
                render={(row) => (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">
                        {c.row} {row.rowNumber}
                      </p>
                      <StatusBadge valid={row.isValid} duplicate={isDuplicate(row.rowNumber)} labels={c} />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{String(row.mapped.symbol ?? "-")}</p>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">{rowMessage(row)}</p>
                  </div>
                )}
              />
            </div>
            <div className="hidden md:block">
              <DataTable
                rows={preview}
                emptyTitle={t(messages, "common.emptyTitle")}
                emptyDescription={t(messages, "common.emptyDescription")}
                columns={[
                  { key: "row", header: c.row, cell: (row) => row.rowNumber },
                  {
                    key: "status",
                    header: c.status,
                    cell: (row) => <StatusBadge valid={row.isValid} duplicate={isDuplicate(row.rowNumber)} labels={c} />
                  },
                  { key: "symbol", header: t(messages, "common.symbol"), cell: (row) => String(row.mapped.symbol ?? "-") },
                  { key: "market", header: c.market, cell: (row) => c.markets[String(row.mapped.market)] ?? String(row.mapped.market ?? "-") },
                  {
                    key: "errors",
                    header: c.messages,
                    cell: (row) => rowMessage(row)
                  }
                ]}
              />
            </div>
          </SectionPanel>
        </div>
      </div>
    </div>
  );
}

function MappingGroup({
  title,
  fields,
  headers,
  mapping,
  onChange,
  requiredLabel
}: {
  title: string;
  fields: readonly string[];
  headers: string[];
  mapping: Record<string, string>;
  onChange: (target: string, source: string) => void;
  /** Shown on every field of the group when the group is the required one. */
  requiredLabel?: string;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Columns3 className="size-4 text-primary" aria-hidden="true" />
        <span>{title}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <Field key={field} label={field} hint={requiredLabel}>
            {headers.length > 0 ? (
              <Select value={mapping[field] ?? ""} onChange={(event) => onChange(field, event.target.value)}>
                <option value="">-</option>
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </Select>
            ) : (
              <Input value={mapping[field] ?? ""} onChange={(event) => onChange(field, event.target.value)} />
            )}
          </Field>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({
  valid,
  duplicate,
  labels
}: {
  valid: boolean;
  duplicate: boolean;
  labels: { ready: string; review: string; alreadyImported: string };
}) {
  if (valid && duplicate) return <Badge tone="warning">{labels.alreadyImported}</Badge>;
  return (
    <Badge tone={valid ? "success" : "danger"}>
      <span className="inline-flex items-center gap-1">
        {valid ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <AlertTriangle className="size-3.5" aria-hidden="true" />}
        {valid ? labels.ready : labels.review}
      </span>
    </Badge>
  );
}

function SummaryPill({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "danger" }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 flex items-center gap-2 text-lg font-semibold tabular-nums", tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "text-foreground")}>
        {tone === "success" ? <CheckCircle2 className="size-4" aria-hidden="true" /> : null}
        {value}
      </p>
    </div>
  );
}
