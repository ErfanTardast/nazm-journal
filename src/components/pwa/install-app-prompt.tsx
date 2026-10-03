"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fallbackCopyFor } from "@/lib/i18n/fallback-copy";
import type { Locale } from "@/lib/i18n/locales";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "nazm-install-dismissed";

function wasDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Storage blocked: the prompt is only hidden for this page view.
  }
}

/** Already running as the installed app: nothing left to offer. */
function isInstalledApp() {
  return Boolean(window.matchMedia?.("(display-mode: standalone)").matches);
}

export function InstallAppPrompt({ locale }: { locale: Locale }) {
  const c = fallbackCopyFor(locale);
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (promptEvent: Event) => {
      // Always hold back the browser's own banner; show ours only to someone who has not said "Later" and is not in the app.
      promptEvent.preventDefault();
      if (isInstalledApp() || wasDismissed()) return;
      setEvent(promptEvent as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!event || dismissed) return null;

  function dismiss() {
    rememberDismissed();
    setDismissed(true);
  }

  async function install() {
    if (!event) return;
    await event.prompt();
    await event.userChoice.catch(() => undefined);
    dismiss();
  }

  return (
    <div className="fixed bottom-20 left-3 right-3 z-40 rounded-lg border border-border bg-card/95 p-3 shadow-lg shadow-black/30 backdrop-blur lg:left-auto lg:right-6 lg:w-80">
      <p className="text-sm font-semibold text-foreground">{c.installTitle}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{c.installBody}</p>
      <div className="mt-3 flex gap-2">
        <Button className="h-9 flex-1" type="button" onClick={install}>
          <Download className="me-2 size-4" aria-hidden="true" />
          {c.install}
        </Button>
        <Button className="h-9" type="button" variant="ghost" onClick={dismiss}>
          {c.later}
        </Button>
      </div>
    </div>
  );
}
