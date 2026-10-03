import { notFound } from "@/lib/api/errors";

/**
 * Payments (plan purchases, pricing, admin review) are on outside production and off in production unless
 * the build sets NEXT_PUBLIC_PAYMENTS_ENABLED=true, so a public trial never shows or accepts payments.
 * Read at call time; Next.js inlines these process.env literals into server and client bundles at build.
 */
export function paymentsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";
}

/** For payment API routes: 404 while payments are off, before any auth or billing work. */
export function requirePaymentsEnabled() {
  if (!paymentsEnabled()) throw notFound();
}
