"use client";

import { useRef, type CSSProperties } from "react";
import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";
import { landingCopy } from "./landing-copy";
import { sampleMonth } from "./sample-month";
import { useLandingMotion, type MotionSetup } from "./use-landing-motion";

const numberTag = (locale: Locale) => (locale === "fa" ? "fa-IR" : "en-US");

/** A result in R, always read left to right: "+1.6R", "−1.0R". */
function formatR(value: number, locale: Locale) {
  const number = new Intl.NumberFormat(numberTag(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(value));
  return `${value < 0 ? "−" : "+"}${number}R`;
}

/* ---- the loop: seven steps, the line is drawn by scrolling ---- */

/** A one-time entrance is for charts the visitor has not seen yet; one already on screen stays as it is. */
function alreadyInView(root: HTMLElement, startRatio: number) {
  return root.getBoundingClientRect().top < window.innerHeight * startRatio;
}

const railMotion: MotionSetup = ({ gsap, root }) => {
  const steps = [...root.querySelectorAll<HTMLElement>("[data-step]")];
  const light = (progress: number) => {
    steps.forEach((step, index) => {
      step.dataset.lit = String(progress >= index / (steps.length - 1) - 0.01);
    });
  };
  // The line starts empty, so the steps start unlit with it; a page opened further down gets its place on refresh.
  light(0);
  gsap.fromTo(
    root,
    { "--p": 0 },
    {
      "--p": 1,
      ease: "none",
      scrollTrigger: {
        trigger: root,
        start: "top 85%",
        end: "top 35%",
        scrub: 0.6,
        onUpdate: (self) => light(self.progress),
        onRefresh: (self) => light(self.progress)
      }
    }
  );
};

export function LoopRail({ locale }: { locale: Locale }) {
  const steps = landingCopy[locale].loop.steps;
  const ref = useRef<HTMLDivElement>(null);
  useLandingMotion(ref, railMotion);
  const number = new Intl.NumberFormat(numberTag(locale));

  return (
    <div ref={ref} className="relative" style={{ "--p": 1 } as CSSProperties}>
      {/* The rail runs through the centres of the first and last step; the teal part grows with --p. */}
      <div aria-hidden="true" className="absolute inset-x-[7.14%] top-[21px] hidden h-0.5 bg-border md:block" />
      <div aria-hidden="true" className="absolute inset-x-[7.14%] top-[21px] hidden h-0.5 origin-left bg-primary [transform:scaleX(var(--p))] rtl:origin-right md:block" />
      <div aria-hidden="true" className="absolute bottom-6 start-[21px] top-6 w-0.5 bg-border md:hidden" />
      <div aria-hidden="true" className="absolute bottom-6 start-[21px] top-6 w-0.5 origin-top bg-primary [transform:scaleY(var(--p))] md:hidden" />

      <ol className="relative m-0 grid list-none gap-5 p-0 md:grid-cols-7 md:gap-2">
        {steps.map((step, index) => (
          <li
            key={step.title}
            data-step
            data-outside={step.outside ? "true" : undefined}
            className="group flex items-center gap-4 md:flex-col md:gap-3 md:text-center"
          >
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-full border-2 text-sm font-bold transition-colors",
                step.outside
                  ? "border-dashed border-muted-foreground/60 bg-background text-muted-foreground"
                  : "border-primary bg-[hsl(169_60%_16%)] text-foreground group-data-[lit=false]:bg-card"
              )}
            >
              {number.format(index + 1)}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-sm font-semibold", step.outside && "text-muted-foreground")}>{step.title}</span>
              <span className="block text-xs leading-5 text-muted-foreground">{step.hint}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---- import: rows arrive, a duplicate is skipped ---- */

const sampleRows: { symbol: string; side: "buy" | "sell"; r: number; duplicate?: boolean }[] = [
  { symbol: "XAUUSD", side: "buy", r: 1.6 },
  { symbol: "EURUSD", side: "sell", r: -1.0 },
  { symbol: "GBPUSD", side: "buy", r: 0.8 },
  { symbol: "XAUUSD", side: "buy", r: 1.6, duplicate: true },
  { symbol: "USDJPY", side: "sell", r: 2.1 }
];
const SAMPLE_DUPLICATES = 3;

const rowsMotion: MotionSetup = ({ gsap, root }) => {
  if (alreadyInView(root, 0.88)) return;
  const fromStart = getComputedStyle(root).direction === "rtl" ? 28 : -28;
  gsap.from(root.querySelectorAll("[data-row]"), {
    x: fromStart,
    opacity: 0,
    duration: 0.6,
    stagger: 0.09,
    ease: "power2.out",
    scrollTrigger: { trigger: root, start: "top 88%", once: true }
  });
};

export function ImportRows({ locale }: { locale: Locale }) {
  const c = landingCopy[locale].charts;
  const ref = useRef<HTMLDivElement>(null);
  useLandingMotion(ref, rowsMotion);
  const whole = new Intl.NumberFormat(numberTag(locale));

  return (
    <div ref={ref}>
      <ul className="m-0 grid list-none gap-1.5 p-0 text-sm">
        {sampleRows.map((row, index) => (
          <li
            key={index}
            data-row
            className={cn("grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2", row.duplicate && "border-dashed bg-transparent")}
          >
            <span className="min-w-0">
              <bdi dir="ltr" className={cn("font-semibold", row.duplicate && "text-muted-foreground line-through")}>
                {row.symbol}
              </bdi>{" "}
              <span className="text-xs text-muted-foreground">{c[row.side]}</span>
            </span>
            <bdi dir="ltr" className="tabular-nums text-muted-foreground">
              {formatR(row.r, locale)}
            </bdi>
            <span className={cn("whitespace-nowrap rounded-full border px-2 py-0.5 text-xs", row.duplicate ? "border-border text-muted-foreground" : "border-primary/40 text-primary")}>
              {row.duplicate ? c.duplicate : c.imported}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-foreground">{c.importSummary(whole.format(sampleMonth.trades.length), whole.format(SAMPLE_DUPLICATES))}</p>
    </div>
  );
}

/* ---- results in R: bars grow from the baseline ---- */

const HISTOGRAM = { width: 320, height: 190, baseline: 150, bar: 26, gap: 4, left: 12, tallest: 120 };

const barsMotion: MotionSetup = ({ gsap, root }) => {
  if (alreadyInView(root, 0.88)) return;
  // One column grows as one piece, so the amber part never hangs above a teal part that is still growing.
  gsap.from(root.querySelectorAll("[data-bar]"), {
    scaleY: 0,
    transformOrigin: "50% 100%",
    duration: 0.6,
    stagger: 0.04,
    ease: "power2.out",
    scrollTrigger: { trigger: root, start: "top 88%", once: true }
  });
};

export function RHistogram({ locale }: { locale: Locale }) {
  const c = landingCopy[locale].charts;
  const ref = useRef<HTMLDivElement>(null);
  useLandingMotion(ref, barsMotion);
  const bins = sampleMonth.histogram;
  const most = Math.max(...bins.map((bin) => bin.clean + bin.broken));
  const tick = new Intl.NumberFormat(numberTag(locale), { maximumFractionDigits: 1 });

  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${HISTOGRAM.width} ${HISTOGRAM.height}`} role="img" aria-label={c.histogramLabel} className="block h-auto w-full">
        {bins.map((bin, index) => {
          const x = HISTOGRAM.left + index * (HISTOGRAM.bar + HISTOGRAM.gap);
          const clean = (bin.clean / most) * HISTOGRAM.tallest;
          const broken = (bin.broken / most) * HISTOGRAM.tallest;
          return (
            <g key={bin.from}>
              <g data-bar>
                {clean > 0 ? (
                  <rect x={x} y={HISTOGRAM.baseline - clean} width={HISTOGRAM.bar} height={clean} rx={2} className={bin.from < 0 ? "fill-muted-foreground/50" : "fill-primary"} />
                ) : null}
                {broken > 0 ? <rect x={x} y={HISTOGRAM.baseline - clean - broken} width={HISTOGRAM.bar} height={broken} rx={2} className="fill-warning" /> : null}
              </g>
              {index % 2 === 0 ? (
                <text x={x + HISTOGRAM.bar / 2} y={HISTOGRAM.baseline + 17} textAnchor="middle" fontSize={10.5} direction="ltr" className="fill-muted-foreground">
                  {`${bin.from > 0 ? "+" : bin.from < 0 ? "−" : ""}${tick.format(Math.abs(bin.from))}R`}
                </text>
              ) : null}
            </g>
          );
        })}
        <line x1={6} x2={HISTOGRAM.width - 6} y1={HISTOGRAM.baseline} y2={HISTOGRAM.baseline} className="stroke-border" />
      </svg>
    </div>
  );
}

/* ---- the daily loss limit: the bar fills to today's loss ---- */

const RISK_SAMPLE = { lossPct: 1.4, limitPct: 2, nextRiskPct: 0.5, lots: 0.42 };

const meterMotion: MotionSetup = ({ gsap, root }) => {
  const fill = root.querySelector("[data-fill]");
  if (!fill || alreadyInView(root, 0.9)) return;
  gsap.from(fill, { scaleX: 0, duration: 1.1, ease: "power2.out", scrollTrigger: { trigger: root, start: "top 90%", once: true } });
};

export function RiskMeter({ locale }: { locale: Locale }) {
  const c = landingCopy[locale].charts;
  const ref = useRef<HTMLDivElement>(null);
  useLandingMotion(ref, meterMotion);
  const tag = numberTag(locale);
  const one = new Intl.NumberFormat(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const two = new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = locale === "fa" ? "٪" : "%";
  const percent = (value: number) => `${one.format(value)}${sign}`;

  return (
    <div ref={ref}>
      {/* The bar always fills left to right, like the scale under it. */}
      <div dir="ltr">
        <div className="relative h-3.5 overflow-hidden rounded-full border border-border bg-muted" aria-hidden="true">
          <div
            data-fill
            className="absolute inset-y-0 left-0 origin-left bg-gradient-to-r from-primary to-warning"
            style={{ width: `${(RISK_SAMPLE.lossPct / RISK_SAMPLE.limitPct) * 100}%` }}
          />
        </div>
        {/* Each number is its own left-to-right island, so the percent sign stays with its digits in Persian. */}
        <div data-scale className="mt-1.5 flex justify-between text-xs text-muted-foreground">
          <bdi dir="ltr">{percent(0)}</bdi>
          <span dir={locale === "fa" ? "rtl" : "ltr"}>
            {c.limit}: <bdi dir="ltr">{percent(RISK_SAMPLE.limitPct)}</bdi>
          </span>
        </div>
      </div>
      <dl className="m-0 mt-4 grid gap-1.5 text-sm">
        <Row label={c.lossToday} value={`−${percent(RISK_SAMPLE.lossPct)}`} />
        <Row label={c.nextRisk} value={percent(RISK_SAMPLE.nextRiskPct)} />
        <Row label={c.size} value={`${two.format(RISK_SAMPLE.lots)} ${c.lots}`} strong />
      </dl>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 border-b border-dashed border-border pb-1.5 last:border-b-0", strong && "font-semibold text-primary")}>
      <dt>{label}</dt>
      <dd className="m-0 tabular-nums">
        <bdi>{value}</bdi>
      </dd>
    </div>
  );
}
