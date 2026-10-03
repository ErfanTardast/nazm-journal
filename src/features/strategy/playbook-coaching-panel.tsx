"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";
import { localizeMentorReport } from "./mentor-report-text";

type Messages = ReturnType<typeof getMessages>;

type Playbook = {
  strategyId: string;
  name: string;
  tradeCount: number;
  adherenceRate: number | null;
  avgRMultiple: number | null;
  topMistake: string | null;
};

type MentorReport = {
  headline: string;
  processMetrics: string[];
  pnl: string | null;
  playbookHighlight: string | null;
  disciplineNote: string | null;
  improvement: string;
  disclaimer: string;
};

type MentorResponse = { available: boolean; requiredTier?: string; report: MentorReport | null };

const pct = (x: number | null): string => (x == null ? "—" : `${Math.round(x * 100)}%`);

/** Read-only coaching panel: per-playbook adherence + the share-safe mentor report (with hide-P/L
 * toggle + an entitlement-locked state). Consumes GET /api/playbooks/adherence + /api/mentor-report. */
export function PlaybookCoachingPanel({ messages, locale }: { messages: Messages; locale: Locale }) {
  const tr = (key: string) => t(messages, `coaching.${key}`);
  const [playbooks, setPlaybooks] = useState<Playbook[] | null>(null);
  const [mentor, setMentor] = useState<MentorResponse | null>(null);
  const [hidePnl, setHidePnl] = useState(true);
  // The report is requested in the page language. A sentence that still arrives in English (an older server) is
  // translated on the Persian page; one already in Persian is shown as it is.
  const report = mentor?.report ? localizeMentorReport(mentor.report, locale) : null;

  useEffect(() => {
    apiFetch<{ playbooks: Playbook[] }>("/api/playbooks/adherence")
      .then((d) => setPlaybooks(d.playbooks))
      .catch(() => setPlaybooks([]));
  }, []);

  useEffect(() => {
    apiFetch<MentorResponse>(`/api/mentor-report?hidePnl=${hidePnl}&locale=${locale}`)
      .then(setMentor)
      .catch(() => setMentor({ available: false, report: null }));
  }, [hidePnl, locale]);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader><CardTitle>{tr("playbookTitle")}</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          {playbooks == null ? (
            <p className="text-sm text-muted-foreground">{tr("loading")}</p>
          ) : playbooks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr("noPlaybooks")}</p>
          ) : (
            playbooks.map((p) => (
              <div key={p.strategyId} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border p-3 text-sm">
                <span className="font-medium">{p.name}</span>
                <Badge tone="default">{tr("adherence")}: {pct(p.adherenceRate)}</Badge>
                <span className="text-muted-foreground">{tr("trades")}: {p.tradeCount}</span>
                {p.topMistake ? <span className="text-xs text-warning">{tr("watchFor")}: {p.topMistake}</span> : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{tr("mentorTitle")}</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <Button type="button" onClick={() => setHidePnl((v) => !v)} className="w-fit">
            {hidePnl ? tr("showPnl") : tr("hidePnl")}
          </Button>
          {mentor == null ? (
            <p className="text-muted-foreground">{tr("loading")}</p>
          ) : !mentor.available ? (
            <p className="text-muted-foreground">{tr("locked")}</p>
          ) : report ? (
            <div className="grid gap-1">
              <p className="font-medium">{report.headline}</p>
              <ul className="grid gap-0.5 text-xs text-muted-foreground">
                {report.processMetrics.map((m) => <li key={m}>{m}</li>)}
                {report.pnl ? <li>{report.pnl}</li> : null}
              </ul>
              {report.playbookHighlight ? <p className="text-xs">{report.playbookHighlight}</p> : null}
              {report.disciplineNote ? <p className="text-xs">{report.disciplineNote}</p> : null}
              <p className="text-xs">{report.improvement}</p>
              <p className="text-[10px] text-muted-foreground">{report.disclaimer}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
