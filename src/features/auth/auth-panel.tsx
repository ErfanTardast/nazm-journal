"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiErrorCode, authErrorMessage } from "@/features/auth/auth-errors";
import { apiFetch } from "@/lib/api/client";
import { safeNextPath } from "@/lib/auth/return-to";
import { DEMO_MODE } from "@/lib/demo";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";
import { toAsciiDigits } from "@/lib/validation/number-input";

type Messages = ReturnType<typeof getMessages>;

/** Beside the invite-code field: where someone without a code goes. */
const requestAccessCopy = {
  en: { question: "No code?", link: "Request access" },
  fa: { question: "کد دعوت ندارید؟", link: "درخواست دسترسی" }
} as const;

type AuthPanelProps = {
  locale: Locale;
  messages: Messages;
  mode: "login" | "register";
  /** True while sign-up needs an invite code (the invite-only trial): the field is labelled and validated as required. */
  inviteRequired?: boolean;
  /** Where to go after signing in (from `?next=`); anything that is not a page of this language is ignored. */
  nextPath?: string;
};

export function AuthPanel({ locale, messages, mode, inviteRequired = false, nextPath }: AuthPanelProps) {
  const router = useRouter();
  const returnTo = safeNextPath(nextPath, locale);
  const passwordHintId = useId();
  const [email, setEmail] = useState(DEMO_MODE ? "demo@nazm.example" : "");
  const [name, setName] = useState(DEMO_MODE ? "Demo Trader" : "");
  const [password, setPassword] = useState(DEMO_MODE ? "DemoPassword123!" : "");
  const [inviteCode, setInviteCode] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        body: JSON.stringify(
          mode === "login"
            ? { email, password, ...(needsTotp && totpCode.trim() ? { totpCode: toAsciiDigits(totpCode.trim()) } : {}) }
            : { email, password, name, locale, ...(inviteCode.trim() ? { inviteCode } : {}) }
        )
      });
      // replace, not push: Back after signing in must not land on the empty form again.
      // A new account starts in the guided first run (it can be skipped); a safe `next` page still wins, and signing in is unchanged.
      router.replace(returnTo ?? `/${locale}/${mode === "register" ? "onboarding" : "dashboard"}`);
      router.refresh();
    } catch (err) {
      if (mode === "login" && apiErrorCode(err) === "TWO_FACTOR_REQUIRED") setNeedsTotp(true);
      setError(authErrorMessage(err, messages, mode));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>{mode === "login" ? t(messages, "auth.signIn") : t(messages, "auth.register")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            {mode === "register" ? (
              <label className="block space-y-2 text-sm">
                <span className="text-muted-foreground">{t(messages, "auth.name")}</span>
                <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required minLength={2} maxLength={80} />
              </label>
            ) : null}
            <label className="block space-y-2 text-sm">
              <span className="text-muted-foreground">{t(messages, "auth.email")}</span>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
            </label>
            <div className="space-y-2">
              <label className="block space-y-2 text-sm">
                <span className="text-muted-foreground">{t(messages, "auth.password")}</span>
                <Input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  {...(mode === "register" ? { minLength: 12, maxLength: 128, "aria-describedby": passwordHintId } : {})}
                />
              </label>
              {mode === "register" ? (
                <p id={passwordHintId} className="text-xs leading-5 text-muted-foreground">
                  {t(messages, "auth.passwordHint")}
                </p>
              ) : null}
            </div>
            {mode === "login" && needsTotp ? (
              <label className="block space-y-2 text-sm">
                <span className="text-muted-foreground">{t(messages, "auth.totpCode")}</span>
                <Input
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                />
              </label>
            ) : null}
            {mode === "register" ? (
              <div className="space-y-2">
                <label className="block space-y-2 text-sm">
                  <span className="text-muted-foreground">{t(messages, inviteRequired ? "auth.inviteCodeRequired" : "auth.inviteCode")}</span>
                  <Input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} autoComplete="off" required={inviteRequired} />
                </label>
                <p className="text-xs text-muted-foreground">
                  {requestAccessCopy[locale].question}{" "}
                  <Link href={`/${locale}/request-access`} className="font-semibold text-primary hover:underline">
                    {requestAccessCopy[locale].link}
                  </Link>
                </p>
              </div>
            ) : null}
            {error ? (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button className="w-full" disabled={loading || !hydrated}>
              {loading ? "..." : mode === "login" ? t(messages, "auth.signIn") : t(messages, "auth.register")}
            </Button>
            {mode === "login" ? <p className="text-xs leading-5 text-muted-foreground">{t(messages, "auth.forgotPassword")}</p> : null}
            {mode === "register" ? (
              <p className="text-xs text-muted-foreground">
                {t(messages, "auth.termsNotice")}{" "}
                <Link href={`/${locale}/terms`} className="font-semibold text-primary hover:underline">
                  {t(messages, "auth.termsLink")}
                </Link>
              </p>
            ) : null}
            {DEMO_MODE ? <p className="text-xs text-muted-foreground">{t(messages, "auth.demoHint")}</p> : null}
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === "login" ? t(messages, "auth.noAccount") : t(messages, "auth.haveAccount")}{" "}
            <Link
              href={`/${locale}/${mode === "login" ? "register" : "login"}${returnTo ? `?next=${encodeURIComponent(returnTo)}` : ""}`}
              className="font-semibold text-primary hover:underline"
            >
              {mode === "login" ? t(messages, "auth.register") : t(messages, "auth.signIn")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
