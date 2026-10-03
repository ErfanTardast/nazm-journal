/**
 * Phase Zeta — privacy + account-deletion transparency. Pure, read-only: declares what data the app
 * stores per user, what a data export covers, and what an account deletion would remove. It produces
 * a deletion **preview** from supplied record counts — it never deletes anything (the actual cascade
 * is a separate, explicitly-gated mutation). No DB, no network here.
 *
 * A data export holds the person's own data. The labelled sample workspace (rows marked `isSample`: trades, journal
 * entries, strategies, plans and reviews a new account can load to look around) is left out of it, and the account
 * row in it carries the first-run answers. An account deletion removes sample rows with everything else.
 */
export type DataCategory = {
  key: string;
  label: string;
  description: string;
  exportable: boolean; // included in a user data export
  deletedOnAccountDeletion: boolean;
};

export const DATA_CATEGORIES: readonly DataCategory[] = [
  { key: "account", label: "Account", description: "Email, name, locale, tier, and your first-run answers (trading platform, main goal, whether setup was finished)", exportable: true, deletedOnAccountDeletion: true },
  { key: "onboardingProfile", label: "Onboarding profile", description: "Starting segment, discipline sprint, and first-week setup", exportable: true, deletedOnAccountDeletion: true },
  { key: "riskProfile", label: "Risk profile", description: "Risk defaults and account-size settings", exportable: true, deletedOnAccountDeletion: true },
  { key: "strategies", label: "Playbooks", description: "Strategy rules and checklists; sample data is not exported", exportable: true, deletedOnAccountDeletion: true },
  { key: "tradePlans", label: "Trade plans", description: "Planned setups before entry; sample data is not exported", exportable: true, deletedOnAccountDeletion: true },
  { key: "tradeImports", label: "Trade imports", description: "CSV import previews and mapped rows", exportable: true, deletedOnAccountDeletion: true },
  { key: "trades", label: "Trades", description: "Logged trades and outcomes; sample data is not exported", exportable: true, deletedOnAccountDeletion: true },
  { key: "journalEntries", label: "Journal", description: "Notes, mistakes, lessons", exportable: true, deletedOnAccountDeletion: true },
  { key: "reviews", label: "Reviews", description: "Daily, weekly, mistake, risk, and strategy reviews; sample data is not exported", exportable: true, deletedOnAccountDeletion: true },
  { key: "ideas", label: "Ideas", description: "Private research and improvement notes", exportable: true, deletedOnAccountDeletion: true },
  { key: "sessions", label: "Trading sessions", description: "Trading session discipline records", exportable: true, deletedOnAccountDeletion: true },
  { key: "watchlists", label: "Watchlists", description: "Saved symbols", exportable: true, deletedOnAccountDeletion: true },
  { key: "portfolios", label: "Portfolios", description: "Manual portfolio, holding, and cash-tracking records", exportable: true, deletedOnAccountDeletion: true },
  { key: "alerts", label: "Alerts", description: "Review reminders and local notification records", exportable: true, deletedOnAccountDeletion: true },
  { key: "backtests", label: "Backtests", description: "Manual strategy test results and equity curves", exportable: true, deletedOnAccountDeletion: true },
  { key: "uploads", label: "Uploads", description: "Attachment metadata and stored screenshot references", exportable: true, deletedOnAccountDeletion: true },
  { key: "payments", label: "Payments", description: "Plan purchases: plan, amount, method, bank reference number or transaction hash. Kept for accounting after account deletion, unlinked from your account", exportable: true, deletedOnAccountDeletion: false },
  { key: "aiAudits", label: "AI audit log", description: "Coach request/refusal audit entries", exportable: false, deletedOnAccountDeletion: true },
  { key: "auditLogs", label: "Security audit log", description: "User-scoped security and settings events", exportable: false, deletedOnAccountDeletion: true },
  { key: "authSessions", label: "Sign-in sessions", description: "Active authentication sessions and reset tokens", exportable: false, deletedOnAccountDeletion: true }
];

export type DeletionPreviewRow = { key: string; label: string; count: number; willDelete: boolean };
export type DeletionPreview = {
  totalRecords: number;
  categories: DeletionPreviewRow[];
  reversible: boolean;
};

export function exportableCategories(): DataCategory[] {
  return DATA_CATEGORIES.filter((c) => c.exportable);
}

/** Build a read-only preview of what an account deletion would remove, from supplied counts. */
export function buildDeletionPreview(counts: Record<string, number> = {}): DeletionPreview {
  const categories: DeletionPreviewRow[] = DATA_CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    count: Math.max(0, Math.trunc(counts[c.key] ?? 0)),
    willDelete: c.deletedOnAccountDeletion
  }));
  const totalRecords = categories.filter((c) => c.willDelete).reduce((sum, c) => sum + c.count, 0);
  return { totalRecords, categories, reversible: false };
}
