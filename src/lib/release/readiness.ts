/**
 * Phase Zeta — release-readiness gate. Pure: maps which hardening items are in place to a single
 * READY / NOT_READY verdict, separating safety-blocking gates (privacy, account deletion, data
 * export, AI-refusal guard) from advisory store-release items (PWA, TWA docs, store metadata).
 * Honest by construction — it reports gaps, it does not fake readiness. No DB, no network.
 */
export type ReleaseInputs = {
  privacyPolicy: boolean;
  accountDeletion: boolean;
  dataExport: boolean;
  aiRefusalGuard: boolean;
  pwaManifest: boolean;
  twaDocs: boolean;
  storeMetadata: boolean;
};

export type ReleaseGate = { key: keyof ReleaseInputs; label: string; ready: boolean; blocking: boolean };

export type ReleaseReadiness = {
  state: "READY" | "NOT_READY";
  gates: ReleaseGate[];
  blockingGaps: string[];
  advisoryGaps: string[];
};

const GATE_META: { key: keyof ReleaseInputs; label: string; blocking: boolean }[] = [
  { key: "privacyPolicy", label: "Privacy policy", blocking: true },
  { key: "accountDeletion", label: "Account deletion path", blocking: true },
  { key: "dataExport", label: "Data export", blocking: true },
  { key: "aiRefusalGuard", label: "AI refusal guard", blocking: true },
  { key: "pwaManifest", label: "PWA manifest + assets", blocking: false },
  { key: "twaDocs", label: "TWA packaging docs", blocking: false },
  { key: "storeMetadata", label: "Store metadata", blocking: false }
];

export function buildReleaseReadiness(inputs: Partial<ReleaseInputs> = {}): ReleaseReadiness {
  const gates: ReleaseGate[] = GATE_META.map((g) => ({
    key: g.key,
    label: g.label,
    blocking: g.blocking,
    ready: inputs[g.key] === true
  }));
  const blockingGaps = gates.filter((g) => g.blocking && !g.ready).map((g) => g.label);
  const advisoryGaps = gates.filter((g) => !g.blocking && !g.ready).map((g) => g.label);
  return {
    state: blockingGaps.length === 0 ? "READY" : "NOT_READY",
    gates,
    blockingGaps,
    advisoryGaps
  };
}
