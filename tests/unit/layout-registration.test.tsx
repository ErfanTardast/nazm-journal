import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { getMessages } from "@/lib/i18n/messages";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/en",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })
}));
vi.mock("react-dom", async (importOriginal) => ({ ...(await importOriginal<typeof import("react-dom")>()), preload: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(async () => ({})) }));
vi.mock("@/lib/demo", () => ({ DEMO_MODE: false, demoModeEnabled: () => false }));
const session = vi.hoisted(() => ({ user: null as null | { name: string; email: string; roles: never[] } }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => session.user) }));

import LocaleLayout from "@/app/[locale]/layout";

const DEFAULT_SOURCE = "https://github.com/ErfanTardast/nazm-journal";

async function renderLayout(locale: "en" | "fa") {
  const element = await LocaleLayout({ children: <p>page</p>, params: Promise.resolve({ locale }) });
  return render(element);
}

/** A server the way a stranger or an operator sets it up: only the sign-up and source variables differ. */
function stubServer(env: { nodeEnv: string; open?: string; code?: string; source?: string }) {
  vi.stubEnv("NODE_ENV", env.nodeEnv);
  vi.stubEnv("REGISTRATION_OPEN", env.open ?? "");
  vi.stubEnv("REGISTRATION_INVITE_CODE", env.code ?? "");
  vi.stubEnv("NEXT_PUBLIC_SOURCE_URL", env.source ?? "");
}

beforeEach(() => {
  session.user = null;
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

// The shell used to be rendered without the server's sign-up mode or source address, so on every real page the header
// spoke for an invite-only server and the footer ignored NEXT_PUBLIC_SOURCE_URL. These tests go through the real layout.
describe.each(["en", "fa"] as const)("[locale] layout wires the server's settings into the shell (%s)", (locale) => {
  const messages = getMessages(locale);
  // The header button in open mode (app-shell: one label at every width).
  const signUp = locale === "fa" ? "ثبت‌نام" : "Sign up";
  const sourceLink = () => screen.getByRole("link", { name: messages.nav.sourceCode });

  it("open sign-up: the header's start button is Sign up to the register form, with no Access entry", async () => {
    stubServer({ nodeEnv: "production", open: "true" });
    await renderLayout(locale);

    expect(screen.getByRole("link", { name: signUp }).getAttribute("href")).toBe(`/${locale}/register`);
    expect(screen.queryByRole("link", { name: messages.nav.public.access })).toBeNull();
    expect(screen.queryByRole("link", { name: messages.nav.public.start })).toBeNull();
    expect(screen.getByRole("link", { name: messages.auth.signIn }).getAttribute("href")).toBe(`/${locale}/login`);
  });

  it("invite-only server: the header still says Start and Access, both to the access section", async () => {
    stubServer({ nodeEnv: "production", code: "a-code-only-the-server-knows" });
    await renderLayout(locale);

    expect(screen.getByRole("link", { name: messages.nav.public.start }).getAttribute("href")).toBe(`/${locale}#access`);
    const publicNav = screen.getByRole("navigation", { name: messages.nav.primary });
    expect(within(publicNav).getByRole("link", { name: messages.nav.public.access }).getAttribute("href")).toBe(`/${locale}#access`);
    expect(screen.queryByRole("link", { name: signUp })).toBeNull();
  });

  it("closed sign-up (production, no code, not open): there is no Sign up button", async () => {
    stubServer({ nodeEnv: "production" });
    await renderLayout(locale);

    expect(screen.queryByRole("link", { name: signUp })).toBeNull();
    expect(screen.getByRole("link", { name: messages.nav.public.start }).getAttribute("href")).toBe(`/${locale}#access`);
  });

  it("a run outside production is open too, as the register route treats it", async () => {
    stubServer({ nodeEnv: "development" });
    await renderLayout(locale);

    expect(screen.getByRole("link", { name: signUp }).getAttribute("href")).toBe(`/${locale}/register`);
  });

  it("the footer's Source code link follows NEXT_PUBLIC_SOURCE_URL", async () => {
    stubServer({ nodeEnv: "production", open: "true", source: "https://git.example.org/team/nazm-fork" });
    await renderLayout(locale);

    expect(sourceLink().getAttribute("href")).toBe("https://git.example.org/team/nazm-fork");
  });

  it("the footer's Source code link is the public repository when the variable is unset or not https", async () => {
    stubServer({ nodeEnv: "production", open: "true" });
    const first = await renderLayout(locale);
    expect(sourceLink().getAttribute("href")).toBe(DEFAULT_SOURCE);
    first.unmount();

    stubServer({ nodeEnv: "production", open: "true", source: "http://git.example.org/fork" });
    await renderLayout(locale);
    expect(sourceLink().getAttribute("href")).toBe(DEFAULT_SOURCE);
  });

  it("a signed-in user's shell gets the override as well", async () => {
    stubServer({ nodeEnv: "production", open: "true", source: "https://git.example.org/team/nazm-fork" });
    session.user = { name: "Sara", email: "sara@example.com", roles: [] };
    await renderLayout(locale);

    for (const link of screen.getAllByRole("link", { name: messages.nav.sourceCode })) {
      expect(link.getAttribute("href")).toBe("https://git.example.org/team/nazm-fork");
    }
  });
});
