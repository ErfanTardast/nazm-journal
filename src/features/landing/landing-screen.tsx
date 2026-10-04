import Link from "next/link";
import { CheckCircle2, Download, EyeOff, Server, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { RegistrationMode } from "@/lib/auth/registration";
import { DEMO_MODE } from "@/lib/demo";
import { isOpenAiConfigured } from "@/lib/env";
import type { Locale } from "@/lib/i18n/locales";
import { EquityStage } from "./equity-stage";
import { landingCopy } from "./landing-copy";
import { ImportRows, LoopRail, RHistogram, RiskMeter } from "./landing-motion";

const primaryButton = "inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90";
const quietButton = "inline-flex min-h-11 items-center rounded-md border border-border px-5 text-sm font-semibold text-foreground hover:bg-muted";

/** The four privacy facts are things the product does (Settings export and deletion, upload-only import, where the coach runs). */
const privacyIcons: LucideIcon[] = [Download, Trash2, EyeOff, Server];

/**
 * The public front page: what the product is (a trader's operating system, not only a journal), its three strengths,
 * the loop it supports, and how to get in. The charts read one labelled sample month.
 *
 * `registration` is the server's sign-up mode (see registrationMode()): with an invite code the page speaks of the
 * private beta and the two ways in (the code, or a request); open, it offers plain "Create account"; closed, it says
 * the administrator creates the accounts. Without it the page keeps the invite wording, the owner's own server.
 * `freeTrial` is true when nothing is charged on this build (the page decides from the build's switch): only
 * then does the private-beta line add "free during the trial", so the page never claims more than the code
 * guarantees. `externalAi` says whether the operator set up an outside AI service; the page only promises that the
 * journal stays on this server when it does.
 */
export function LandingScreen({
  locale,
  signedIn = false,
  externalAi = isOpenAiConfigured(),
  registration = "invite",
  freeTrial = false
}: {
  locale: Locale;
  signedIn?: boolean;
  externalAi?: boolean;
  registration?: RegistrationMode;
  freeTrial?: boolean;
}) {
  const c = landingCopy[locale];
  const privacyPoints = [...c.privacy.points, externalAi ? c.privacy.coach.outside : c.privacy.coach.builtIn];
  const betaLine = freeTrial ? `${c.beta} ${c.freeTrial}` : c.beta;
  const heroNote = registration === "invite" ? betaLine : registration === "closed" ? c.closed.note : null;

  return (
    <div className="pb-6">
      <section id="product" className="grid items-center gap-8 py-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)] lg:py-12">
        <div>
          <h1 className="m-0 text-balance text-3xl font-extrabold leading-[1.35] tracking-normal text-foreground sm:text-4xl sm:leading-[1.32] xl:text-[2.75rem] xl:leading-[1.3]">{c.title}</h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg sm:leading-9">{c.lead}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            {signedIn ? (
              /* A signed-in visitor has no use for sign-up and sign-in. */
              <Link href={`/${locale}/dashboard`} className={primaryButton}>
                {c.openDashboard}
              </Link>
            ) : DEMO_MODE ? (
              <>
                <Link href={`/${locale}/demo`} className={primaryButton}>
                  {c.openDemo}
                </Link>
                <Link href={`/${locale}/login`} className={quietButton}>
                  {c.demoSignIn}
                </Link>
              </>
            ) : registration === "open" ? (
              <>
                {/* Anyone can sign up on this server: plain wording, nothing about invites or a beta. */}
                <Link href={`/${locale}/register`} className={primaryButton}>
                  {c.createAccount}
                </Link>
                <Link href={`/${locale}/login`} className={quietButton}>
                  {c.signIn}
                </Link>
              </>
            ) : registration === "closed" ? (
              <>
                {/* Sign-up is closed here: no sign-up button, only a request and sign-in. */}
                <Link href={`/${locale}/request-access`} className={primaryButton}>
                  {c.requestAccess}
                </Link>
                <Link href={`/${locale}/login`} className={quietButton}>
                  {c.signIn}
                </Link>
              </>
            ) : (
              <>
                {/* Sign-up is invite-only, so the two buttons name the two real ways in. */}
                <Link href={`/${locale}/register`} className={primaryButton}>
                  {c.withInvite}
                </Link>
                <Link href={`/${locale}/request-access`} className={quietButton}>
                  {c.requestAccess}
                </Link>
              </>
            )}
          </div>
          {signedIn || DEMO_MODE || !heroNote ? null : <p className="mt-4 text-sm text-muted-foreground">{heroNote}</p>}
        </div>
        <EquityStage locale={locale} />
      </section>

      {/* One row split by rules, not three boxed cards: these are the three reasons to use the product. */}
      <section id="features" className="grid border-y border-border md:grid-cols-3">
        {c.pillars.map((pillar) => (
          <div key={pillar.title} className="border-border py-6 max-md:border-t max-md:first:border-t-0 md:border-s md:px-6 md:first:border-s-0 md:first:ps-0 md:last:pe-0">
            <h2 className="m-0 text-lg font-bold">{pillar.title}</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">{pillar.body}</p>
          </div>
        ))}
      </section>

      <section id="how" className="pt-16">
        <h2 className="m-0 text-balance text-2xl font-bold sm:text-3xl">{c.loop.title}</h2>
        <p className="mb-8 mt-2 max-w-2xl leading-8 text-muted-foreground">{c.loop.body}</p>
        <LoopRail locale={locale} />
      </section>

      <section className="pt-16">
        <h2 className="m-0 text-balance text-2xl font-bold sm:text-3xl">{c.charts.title}</h2>
        <p className="mb-6 mt-2 max-w-2xl leading-8 text-muted-foreground">{c.charts.body}</p>
        <div className="grid gap-4 lg:grid-cols-3">
          <ChartPanel title={c.charts.importTitle} body={c.charts.importBody}>
            <ImportRows locale={locale} />
          </ChartPanel>
          <ChartPanel title={c.charts.histogramTitle} body={c.charts.histogramBody}>
            <RHistogram locale={locale} />
          </ChartPanel>
          <ChartPanel title={c.charts.riskTitle} body={c.charts.riskBody}>
            <RiskMeter locale={locale} />
          </ChartPanel>
        </div>
      </section>

      <section id="privacy" className="pt-16">
        <h2 className="m-0 text-balance text-2xl font-bold sm:text-3xl">{c.privacy.title}</h2>
        <p className="mb-6 mt-2 max-w-2xl leading-8 text-muted-foreground">{c.privacy.body}</p>
        <ul className="m-0 grid list-none gap-x-10 gap-y-6 p-0 sm:grid-cols-2">
          {privacyPoints.map((point, index) => {
            const Icon = privacyIcons[index] ?? CheckCircle2;
            return (
              <li key={point.title} className="flex gap-4">
                <Icon className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="m-0 font-semibold">{point.title}</p>
                  <p className="m-0 mt-1 text-sm leading-7 text-muted-foreground">{point.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {signedIn || DEMO_MODE ? null : (
        <section id="access" className="mt-16 rounded-lg border border-border bg-card/70 p-6 sm:p-8">
          {registration === "open" ? (
            <>
              <h2 className="m-0 text-2xl font-bold sm:text-3xl">{c.open.title}</h2>
              <p className="mt-2 max-w-2xl leading-8 text-muted-foreground">{c.open.body}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={`/${locale}/register`} className={primaryButton}>
                  {c.createAccount}
                </Link>
                <Link href={`/${locale}/login`} className={quietButton}>
                  {c.signIn}
                </Link>
              </div>
            </>
          ) : registration === "closed" ? (
            <>
              <h2 className="m-0 text-2xl font-bold sm:text-3xl">{c.closed.title}</h2>
              <p className="mt-2 max-w-2xl leading-8 text-muted-foreground">{c.closed.body}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={`/${locale}/request-access`} className={primaryButton}>
                  {c.requestAccess}
                </Link>
                <Link href={`/${locale}/login`} className={quietButton}>
                  {c.signIn}
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="m-0 text-2xl font-bold sm:text-3xl">{c.access.title}</h2>
              <p className="mt-2 max-w-2xl leading-8 text-muted-foreground">{c.access.body(freeTrial)}</p>
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div>
                  <p className="m-0 font-semibold">{c.access.haveCode}</p>
                  <p className="mb-4 mt-1 text-sm leading-7 text-muted-foreground">{c.access.haveCodeBody}</p>
                  <Link href={`/${locale}/register`} className={primaryButton}>
                    {c.withInvite}
                  </Link>
                </div>
                <div className="border-border max-md:border-t max-md:pt-6 md:border-s md:ps-6">
                  <p className="m-0 font-semibold">{c.access.noCode}</p>
                  <p className="mb-4 mt-1 text-sm leading-7 text-muted-foreground">{c.access.noCodeBody}</p>
                  <Link href={`/${locale}/request-access`} className={quietButton}>
                    {c.requestAccess}
                  </Link>
                </div>
              </div>
              <p className="mb-0 mt-6 text-sm text-muted-foreground">
                {c.access.already}{" "}
                <Link href={`/${locale}/login`} className="font-semibold text-primary hover:underline">
                  {c.signIn}
                </Link>
              </p>
            </>
          )}
        </section>
      )}

      {DEMO_MODE ? (
        <section className="mt-10 rounded-lg border border-success/25 bg-success/10 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
              <span>
                {c.demoUser}: <bdi dir="ltr">demo@nazm.example / DemoPassword123!</bdi>
              </span>
            </span>
            <Link href={`/${locale}/dashboard`} className="text-sm font-semibold text-primary hover:underline">
              {c.openWorkspace}
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ChartPanel({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-5">
      <h3 className="m-0 text-base font-bold">{title}</h3>
      <p className="mb-4 mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}
