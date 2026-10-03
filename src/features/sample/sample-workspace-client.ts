import { apiFetch } from "@/lib/api/client";

/** What `GET /api/sample-workspace` says: whether sample data is loaded, and whether this account may load it. */
export type SampleWorkspaceState = { active: boolean; loadedAt: string | null; canLoad: boolean };

/**
 * Asks the server whether sample data is loaded. Never throws: a request that fails, or an answer that is not the
 * expected shape, is `null`, and the callers then show nothing rather than a guess.
 */
export async function fetchSampleWorkspaceState(): Promise<SampleWorkspaceState | null> {
  try {
    const data = await apiFetch<Partial<SampleWorkspaceState> | null>("/api/sample-workspace");
    if (!data || typeof data.active !== "boolean") return null;
    return { active: data.active, loadedAt: typeof data.loadedAt === "string" ? data.loadedAt : null, canLoad: data.canLoad === true };
  } catch {
    return null;
  }
}

/** Sent on `window` after sample data was loaded here, so the strip in the workspace shell can show it and the page can fetch its data again. */
export const SAMPLE_CHANGED_EVENT = "nazm:sample-workspace-changed";
type SampleChange = { handled: boolean };

/**
 * Tells the workspace shell that sample data was loaded. Returns whether something took it on (the shell remounts the
 * page, so its own data is fetched again); when nothing did, the caller reloads the page instead.
 */
export function announceSampleChange(): boolean {
  const detail: SampleChange = { handled: false };
  window.dispatchEvent(new CustomEvent<SampleChange>(SAMPLE_CHANGED_EVENT, { detail }));
  return detail.handled;
}

/** Listens for `announceSampleChange`; the listener marks the change as handled. Returns the cleanup. */
export function onSampleChange(listener: (change: SampleChange) => void) {
  const handle = (event: Event) => listener((event as CustomEvent<SampleChange>).detail);
  window.addEventListener(SAMPLE_CHANGED_EVENT, handle);
  return () => window.removeEventListener(SAMPLE_CHANGED_EVENT, handle);
}

/** Sent on `window` after a page saved the person's first real trade and the server answered `sampleRemoved: true`. */
export const SAMPLE_REMOVED_EVENT = "nazm:sample-workspace-removed";

/**
 * Tells the strip in the workspace shell that the sample data went with the person's first real trade, so the label
 * goes at once instead of waiting for its next check, and says why. The page has loaded its own list already, so
 * nothing is remounted or refreshed. Does nothing when no strip is mounted.
 */
export function announceSampleRemoved() {
  window.dispatchEvent(new CustomEvent(SAMPLE_REMOVED_EVENT));
}

/** Listens for `announceSampleRemoved`. Returns the cleanup. */
export function onSampleRemoved(listener: () => void) {
  window.addEventListener(SAMPLE_REMOVED_EVENT, listener);
  return () => window.removeEventListener(SAMPLE_REMOVED_EVENT, listener);
}

/** Sent on `window` after a page saved a trade whose answer does not say whether the sample data went with it. */
export const SAMPLE_RECHECK_EVENT = "nazm:sample-workspace-recheck";

/**
 * Asks the strip to check the sample data again now, instead of at its next timed check. For a save that may have
 * removed it without saying so (a plan converted to a trade). The strip asks only while it shows sample data, and a
 * check that finds it gone says why. Does nothing when no strip is mounted.
 */
export function askSampleRecheck() {
  window.dispatchEvent(new CustomEvent(SAMPLE_RECHECK_EVENT));
}

/** Listens for `askSampleRecheck`. Returns the cleanup. */
export function onSampleRecheck(listener: () => void) {
  window.addEventListener(SAMPLE_RECHECK_EVENT, listener);
  return () => window.removeEventListener(SAMPLE_RECHECK_EVENT, listener);
}

/** A full reload, for a page whose data lives in its own state and has no shell around it to refetch it. */
export function reloadPage() {
  window.location.reload();
}
