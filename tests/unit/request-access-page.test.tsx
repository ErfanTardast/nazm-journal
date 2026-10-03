import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const nav = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  })
}));
vi.mock("next/navigation", () => nav);
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/session", () => session);

import RequestAccessPage from "@/app/[locale]/request-access/page";
import { RequestAccessScreen } from "@/features/access/request-access-screen";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const params = (locale: string) => Promise.resolve({ locale });
const user = { id: "u1", name: "Sara", email: "sara@example.com" };

describe("request-access page", () => {
  it("shows the form to a visitor, in the language of the URL", async () => {
    session.getCurrentUser.mockResolvedValue(null);

    for (const locale of ["fa", "en"]) {
      const page = (await RequestAccessPage({ params: params(locale) })) as ReactElement<{ locale: string }>;
      expect(page.type).toBe(RequestAccessScreen);
      expect(page.props.locale).toBe(locale);
    }
  });

  it("passes the public contact address to the form when NEXT_PUBLIC_CONTACT_EMAIL is set, and null when it is not", async () => {
    session.getCurrentUser.mockResolvedValue(null);
    type Props = { contactEmail: string | null };

    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", " hello@nazm.example ");
    expect(((await RequestAccessPage({ params: params("en") })) as ReactElement<Props>).props.contactEmail).toBe("hello@nazm.example");

    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "");
    expect(((await RequestAccessPage({ params: params("fa") })) as ReactElement<Props>).props.contactEmail).toBeNull();
  });

  it("sends a signed-in user to the dashboard of the same language", async () => {
    session.getCurrentUser.mockResolvedValue(user);

    await expect(RequestAccessPage({ params: params("fa") })).rejects.toThrow("NEXT_REDIRECT:/fa/dashboard");
    await expect(RequestAccessPage({ params: params("en") })).rejects.toThrow("NEXT_REDIRECT:/en/dashboard");
  });

  it("404s an unknown language before looking at the session", async () => {
    await expect(RequestAccessPage({ params: params("de") })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(session.getCurrentUser).not.toHaveBeenCalled();
  });
});
