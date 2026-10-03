import { paymentsEnabled } from "@/lib/billing/enabled";
import { demoModeEnabled } from "@/lib/demo";

/** Navigation entries switched off in this build: plan purchases and the demo walkthrough in a production trial. */
export function hiddenNavHrefs(): Set<string> {
  return new Set([...(paymentsEnabled() ? [] : ["billing"]), ...(demoModeEnabled() ? [] : ["demo"])]);
}
