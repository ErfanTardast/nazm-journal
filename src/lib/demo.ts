/**
 * Demo mode controls the seeded demo account (demo@nazm.example) and the login prefill/hints that
 * advertise its password. It is on outside production and off in production unless a build opts in
 * with NEXT_PUBLIC_DEMO_MODE=true, so a real deployment
 * never ships a publicly known login.
 */
export type DemoEnv = { NODE_ENV?: string; NEXT_PUBLIC_DEMO_MODE?: string; DEMO_SEED?: string };

export function isDemoEnabled(env: DemoEnv): boolean {
  return env.NODE_ENV !== "production" || env.NEXT_PUBLIC_DEMO_MODE === "true";
}

/**
 * Whether prisma/seed.ts may create the demo data, including an admin with a published password. In production a
 * runtime NEXT_PUBLIC_DEMO_MODE is not enough: the Docker entrypoint also passes DEMO_SEED=true, and only when the
 * image itself was built as a demo (the flag baked into .build-demo-mode).
 */
export function demoSeedAllowed(env: DemoEnv): boolean {
  if (env.NODE_ENV !== "production") return true;
  return isDemoEnabled(env) && env.DEMO_SEED === "true";
}

/** The same rule read at call time (process.env literals are inlined by Next.js; tests can stub them). */
export function demoModeEnabled(): boolean {
  return isDemoEnabled({ NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE });
}

// Direct process.env reads so Next.js can inline them into client bundles.
export const DEMO_MODE = isDemoEnabled({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE
});
