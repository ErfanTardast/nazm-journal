import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(async () => ({ id: "user-1" })) }));
vi.mock("@/lib/security/audit", () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => undefined) }));
vi.mock("@/lib/services/export", () => ({ buildExportBundle: vi.fn(async () => ({ schemaVersion: "1" })) }));

import { GET } from "@/app/api/users/me/export/route";

describe("GET /api/users/me/export", () => {
  it("downloads the data as a nazm-export file named by the day", async () => {
    const response = await GET(new Request("http://localhost/api/users/me/export"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="nazm-export-\d{4}-\d{2}-\d{2}\.json"$/);
  });
});
