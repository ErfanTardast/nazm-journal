import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { applySessionCookie, clearSessionCookie } from "@/lib/auth/session";

function responseWithCookies() {
  const set = vi.fn();
  return { response: Object.assign(new Response(null), { cookies: { set } }), set };
}

// The cookie shows in the browser's storage panel and in the public code, so it carries the product's name.
describe("session cookie", () => {
  it("is named nazm_session when a sign-in sets it", () => {
    const { response, set } = responseWithCookies();
    applySessionCookie(response, { value: "signed", expiresAt: new Date("2030-01-01T00:00:00Z") });
    expect(set).toHaveBeenCalledWith("nazm_session", "signed", expect.objectContaining({ httpOnly: true, path: "/" }));
  });

  it("is cleared under the same name on sign-out", () => {
    const { response, set } = responseWithCookies();
    clearSessionCookie(response);
    expect(set).toHaveBeenCalledWith("nazm_session", "", expect.objectContaining({ maxAge: 0 }));
  });
});
