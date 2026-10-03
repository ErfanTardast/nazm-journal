import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(),
  clearSessionCookie: vi.fn()
}));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/security/password", () => ({ verifyPassword: vi.fn() }));
vi.mock("@/lib/services/account-deletion", () => ({ deleteUserAccount: vi.fn() }));

import { clearSessionCookie, requireUser } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/security/password";
import { deleteUserAccount } from "@/lib/services/account-deletion";
import { DELETE } from "@/app/api/users/me/route";

const user = {
  id: "user-1",
  email: "demo@nazm.example",
  passwordHash: "hash"
};

function request(body: unknown) {
  return new Request("http://localhost/api/users/me", {
    method: "DELETE",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue(user as never);
  vi.mocked(verifyPassword).mockResolvedValue(true);
  vi.mocked(deleteUserAccount).mockResolvedValue({
    totalRecords: 3,
    reversible: false,
    categories: [{ key: "account", label: "Account", count: 1, willDelete: true }]
  });
});

describe("DELETE /api/users/me", () => {
  it("requires exact confirmation and clears the session after deletion", async () => {
    const res = await DELETE(
      request({
        confirmationEmail: "demo@nazm.example",
        confirmationText: "DELETE",
        password: "DemoPassword123!"
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.deleted).toBe(true);
    expect(verifyPassword).toHaveBeenCalledWith("DemoPassword123!", "hash");
    expect(deleteUserAccount).toHaveBeenCalledWith("user-1");
    expect(clearSessionCookie).toHaveBeenCalledWith(res);
  });

  it("rejects a mismatched confirmation email before password verification", async () => {
    const res = await DELETE(
      request({
        confirmationEmail: "other@example.com",
        confirmationText: "DELETE",
        password: "DemoPassword123!"
      })
    );

    expect(res.status).toBe(422);
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(deleteUserAccount).not.toHaveBeenCalled();
  });

  it("rejects an invalid password without deleting", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);

    const res = await DELETE(
      request({
        confirmationEmail: "demo@nazm.example",
        confirmationText: "DELETE",
        password: "wrong"
      })
    );

    expect(res.status).toBe(403);
    expect(deleteUserAccount).not.toHaveBeenCalled();
  });
});
