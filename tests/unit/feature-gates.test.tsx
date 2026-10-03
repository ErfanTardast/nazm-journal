import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/en/dashboard", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => undefined) }));

import { paymentsEnabled } from "@/lib/billing/enabled";
import { demoModeEnabled } from "@/lib/demo";
import { AppShell } from "@/components/layout/app-shell";
import { DemoModeBanner } from "@/components/layout/demo-mode-banner";
import { GET as demoStoryGET } from "@/app/api/demo/story/route";
import { getMessages } from "@/lib/i18n/messages";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const production = (flags: Record<string, string> = {}) => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_PAYMENTS_ENABLED", flags.payments ?? "");
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", flags.demo ?? "");
};

describe("paymentsEnabled", () => {
  it("is on outside production, off in production unless the build opts in", () => {
    expect(paymentsEnabled()).toBe(true);
    production();
    expect(paymentsEnabled()).toBe(false);
    production({ payments: "true" });
    expect(paymentsEnabled()).toBe(true);
  });
});

describe("demoModeEnabled", () => {
  it("follows the same rule for the demo", () => {
    expect(demoModeEnabled()).toBe(true);
    production();
    expect(demoModeEnabled()).toBe(false);
  });
});

describe("a production trial without payments or demo", () => {
  const shell = () => render(<AppShell locale="en" messages={getMessages("en")} canAccessAdmin={false} user={{ name: "Sara Sample", email: "sara@example.com" }}><p>page</p></AppShell>);
  const links = () => screen.getAllByRole("link").map((link) => link.getAttribute("href"));

  it("hides the Upgrade and Demo navigation", () => {
    production();
    shell();

    expect(links()).not.toContain("/en/billing");
    expect(links()).not.toContain("/en/demo");
  });

  it("keeps them in development", () => {
    shell();

    expect(links()).toContain("/en/billing");
    expect(links()).toContain("/en/demo");
  });

  it("shows no demo banner", () => {
    production();
    const { container } = render(<DemoModeBanner locale="en" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("answers the demo story API with 404", async () => {
    production();
    const res = await demoStoryGET(new Request("http://localhost/api/demo/story"));

    expect(res.status).toBe(404);
  });
});
