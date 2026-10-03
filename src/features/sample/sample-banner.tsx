"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";
import {
  fetchSampleWorkspaceState,
  onSampleChange,
  onSampleRecheck,
  onSampleRemoved,
  type SampleWorkspaceState
} from "./sample-workspace-client";

const copy = {
  en: {
    region: "Sample data notice",
    badge: "Sample data",
    // True on every page the strip sits above, also on those that show no sample rows (Settings, Import, the risk desk).
    text: "Sample data is loaded. The trades, strategies, plans and reviews you see are samples, not your own. They are removed automatically when you record or import your first real trade.",
    remove: "Remove sample data",
    removing: "Removing…",
    confirm: "Remove all sample data? Only the sample rows are deleted; anything you added yourself stays.",
    confirmYes: "Yes, remove",
    cancel: "Cancel",
    removed: "Sample data removed.",
    removedByTrade: "Sample data was removed because you saved your first real trade.",
    removeFailed: "Could not remove the sample data. Try again."
  },
  fa: {
    region: "اعلان داده نمونه",
    badge: "داده نمونه",
    text: "داده نمونه بارگذاری شده است. معاملات، استراتژی‌ها، پلن‌ها و مرورهایی که می‌بینید نمونه‌اند، نه مال شما. با ثبت اولین معامله‌ی واقعی‌تان یا ورود معاملات از فایل، خودکار پاک می‌شوند.",
    remove: "حذف داده نمونه",
    removing: "در حال حذف…",
    confirm: "همه‌ی داده نمونه حذف شود؟ فقط ردیف‌های نمونه پاک می‌شوند؛ هرچه خودتان ثبت کرده‌اید می‌ماند.",
    confirmYes: "بله، حذف شود",
    cancel: "انصراف",
    removed: "داده نمونه حذف شد.",
    removedByTrade: "با ثبت اولین معامله‌ی واقعی‌تان، داده نمونه حذف شد.",
    removeFailed: "حذف داده نمونه انجام نشد. دوباره تلاش کنید."
  }
} as const;

/**
 * The small mark the workspace shell keeps in its sticky header while sample data is loaded, so that something on
 * screen says "sample" however far the page is scrolled. The strip itself scrolls away with the page.
 */
export function SampleMark({ locale, className }: { locale: Locale; className?: string }) {
  return (
    <span data-sample-mark="" className={className}>
      <Badge tone="warning">{copy[locale].badge}</Badge>
    </span>
  );
}

/**
 * While sample data is loaded the strip is checked again this often, and when the window comes back to the front: a
 * trade added in another tab, or by a page that does not tell the strip, removes the sample data, and the label must
 * not outlive it. Nothing is asked once there is no sample data.
 */
const RECHECK_MS = 15_000;

const buttonBase =
  "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton = `${buttonBase} border border-border bg-background text-foreground hover:bg-muted`;
const dangerButton = `${buttonBase} bg-destructive text-white hover:brightness-110`;

type Step = "idle" | "confirm" | "removing";
type Result = { text: string };

/**
 * The label on sample data, mounted once in the workspace shell above the page. While sample data is loaded it is
 * always on screen, says what it is and how it goes away, and offers the one-click removal (confirmed in the strip,
 * not with the browser's dialog). It renders nothing when there is no sample data, while it is still asking, and when
 * the first question failed.
 *
 * `onChanged` is called after the sample data was removed here or loaded from a page, so the page can fetch its own
 * data again (the shell remounts it). `onActiveChange` says whether the strip is showing, so the shell can keep a
 * mark in its sticky header while it is.
 *
 * When the sample data goes without this strip removing it, the strip says why instead of vanishing: a page that saved
 * the first real trade tells it (`announceSampleRemoved`), and a later check that finds it gone says so too (an
 * import, a plan turned into a trade, another tab).
 */
export function SampleBanner({
  locale,
  onChanged,
  onActiveChange
}: {
  locale: Locale;
  onChanged?: () => void;
  onActiveChange?: (active: boolean) => void;
}) {
  const c = copy[locale];
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<SampleWorkspaceState | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [result, setResult] = useState<Result | null>(null);
  const asked = useRef(0);
  const mounted = useRef(true);
  const knownActive = useRef(false);
  const removeButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const resultLine = useRef<HTMLParagraphElement>(null);
  const handBackFocus = useRef(false);
  const focusResult = useRef(false);
  const changed = useRef(onChanged);
  changed.current = onChanged;
  const activeChanged = useRef(onActiveChange);
  activeChanged.current = onActiveChange;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A failed check keeps what is already known; only an answer replaces it. A late answer to an older question is dropped.
  const check = useCallback(async () => {
    const ticket = ++asked.current;
    const next = await fetchSampleWorkspaceState();
    if (!next || !mounted.current || ticket !== asked.current) return;
    if (knownActive.current && !next.active) {
      // It was here and is gone, and this strip did not remove it. An account that can no longer load sample data has a
      // trade of its own: that trade removed it. One that still can had it removed on purpose (the button, in another tab).
      setResult({ text: next.canLoad ? c.removed : c.removedByTrade });
    }
    knownActive.current = next.active;
    setState(next);
  }, [c]);

  // On mount and on every page change; a confirmation or a result belongs to the page it was shown on.
  useEffect(() => {
    setStep("idle");
    setResult(null);
    void check();
  }, [pathname, check]);

  const active = state?.active === true;
  useEffect(() => {
    activeChanged.current?.(active);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void check(), RECHECK_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [active, check]);

  // A page saved something that may have removed the sample data (a plan converted to a trade): look now, but only
  // while there is a label to take down, so accounts without sample data pay no extra request.
  useEffect(
    () =>
      onSampleRecheck(() => {
        if (knownActive.current) void check();
      }),
    [check]
  );

  // Sample data loaded from a page (the offer): show the label, and have the page fetch its data again.
  useEffect(
    () =>
      onSampleChange((change) => {
        change.handled = true;
        void check();
        changed.current?.();
      }),
    [check]
  );

  // A page saved the person's first real trade and the server removed the sample data with it. The label goes at once
  // (an answer still on its way was asked before, so it is dropped) and the removal is said. Focus stays where it is.
  useEffect(
    () =>
      onSampleRemoved(() => {
        asked.current += 1;
        knownActive.current = false;
        setState({ active: false, loadedAt: null, canLoad: false });
        setStep("idle");
        setResult({ text: c.removedByTrade });
      }),
    [c]
  );

  useEffect(() => {
    if (step === "confirm") cancelButton.current?.focus();
    else if (step === "idle") {
      if (focusResult.current) {
        // The buttons that held focus went with the label: the result line is the next place to be.
        focusResult.current = false;
        resultLine.current?.focus();
      } else if (handBackFocus.current) {
        handBackFocus.current = false;
        removeButton.current?.focus();
      }
    }
  }, [step]);

  function cancel() {
    handBackFocus.current = true;
    setStep("idle");
  }

  async function remove() {
    handBackFocus.current = true;
    setStep("removing");
    setResult(null);
    try {
      await apiFetch("/api/sample-workspace", { method: "DELETE" });
      if (!mounted.current) return;
      handBackFocus.current = false;
      focusResult.current = true;
      asked.current += 1; // an answer still on its way was asked before the delete
      knownActive.current = false;
      setState({ active: false, loadedAt: null, canLoad: true });
      setResult({ text: c.removed });
      setStep("idle");
      router.refresh();
      changed.current?.();
    } catch (error) {
      if (!mounted.current) return;
      setResult({ text: apiErrorText(error, locale, c.removeFailed) });
      setStep("idle");
    }
  }

  if (!active && !result) return null;

  return (
    <section aria-label={c.region} className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm first:mt-0">
      {active ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Badge tone="warning">{c.badge}</Badge>
          <p className="min-w-0 flex-1 basis-60 leading-6 text-foreground">{step === "idle" ? c.text : c.confirm}</p>
          {step === "idle" ? (
            <button ref={removeButton} type="button" className={secondaryButton} onClick={() => setStep("confirm")}>
              {c.remove}
            </button>
          ) : (
            <div
              className="flex flex-wrap gap-2"
              onKeyDown={(event) => {
                if (event.key === "Escape" && step === "confirm") cancel();
              }}
            >
              <button type="button" className={dangerButton} disabled={step === "removing"} onClick={() => void remove()}>
                {step === "removing" ? c.removing : c.confirmYes}
              </button>
              <button ref={cancelButton} type="button" className={secondaryButton} disabled={step === "removing"} onClick={cancel}>
                {c.cancel}
              </button>
            </div>
          )}
        </div>
      ) : null}
      {/* Always here while the strip is, empty until there is a result: a live region that arrives with its text in it is
          not reliably announced, one that is already in the page and then changes is. */}
      <p
        ref={resultLine}
        role="status"
        tabIndex={-1}
        className={cn(
          "rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          result && "leading-6 text-foreground",
          result && active && "mt-2"
        )}
      >
        {result?.text}
      </p>
    </section>
  );
}
