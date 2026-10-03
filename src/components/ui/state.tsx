"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, LockKeyhole } from "lucide-react";
import { safeNextPath } from "@/lib/auth/return-to";
import { Card, CardContent } from "./card";

const stateCopy = {
  en: {
    loading: "Loading",
    authTitle: "Sign in required",
    authDescription: "Sign in with your account to see this page.",
    signIn: "Sign in"
  },
  fa: {
    loading: "در حال بارگذاری",
    authTitle: "ورود لازم است",
    authDescription: "برای دیدن این صفحه با حساب خود وارد شوید.",
    signIn: "ورود"
  }
} as const;

function copyFor(locale?: string) {
  return locale === "fa" ? stateCopy.fa : stateCopy.en;
}

export function LoadingState({ label, locale }: { label?: string; locale?: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center text-muted-foreground">
      <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
      <span>{label ?? copyFor(locale).loading}</span>
    </div>
  );
}

export type EmptyStateAction = { href: string; label: string };

/** A page with no data yet. `actions` are the next steps as links; the first is the main one. */
export function EmptyState({ title, description, actions }: { title: string; description: string; actions?: EmptyStateAction[] }) {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
        {actions?.length ? (
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            {actions.map((action, index) => (
              <Link
                // Two next steps can share a target (e.g. "New plan" and "Plan from a template" both open /plans).
                key={`${action.href}:${action.label}`}
                href={action.href}
                className={
                  index === 0
                    ? "inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                    : "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold text-foreground transition hover:bg-muted"
                }
              >
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ErrorState({ title, description }: { title: string; description: string }) {
  return (
    <Card className="border-destructive/40">
      <CardContent className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 text-destructive" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** The path of the page being shown, known once mounted (the card only appears after a request failed on the client). */
function useCurrentPath() {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    setPath(window.location.pathname);
  }, []);
  return path;
}

export function AuthRequiredState({
  locale,
  title,
  description
}: {
  locale: string;
  title?: string;
  description?: string;
}) {
  const c = copyFor(locale);
  const returnTo = safeNextPath(useCurrentPath(), locale);
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <LockKeyhole className="mt-0.5 size-5 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground">{title ?? c.authTitle}</p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description ?? c.authDescription}</p>
          </div>
        </div>
        <Link
          href={`/${locale}/login${returnTo ? `?next=${encodeURIComponent(returnTo)}` : ""}`}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
        >
          {c.signIn}
        </Link>
      </CardContent>
    </Card>
  );
}
