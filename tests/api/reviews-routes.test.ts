import { afterEach, describe, expect, it, vi } from "vitest";
import { unauthorized } from "@/lib/api/errors";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/auth/session");
  vi.doUnmock("@/lib/security/audit");
  vi.doUnmock("@/lib/security/rate-limit");
  vi.doUnmock("@/lib/services/reviews");
});

describe("review API routes", () => {
  it("returns 401 for protected review routes before login", async () => {
    vi.doMock("@/lib/auth/session", () => ({
      requireUser: async () => {
        throw unauthorized();
      }
    }));

    const { GET } = await import("@/app/api/reviews/route");
    const response = await GET(new Request("http://localhost/api/reviews"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("wraps generated reviews in the data response shape", async () => {
    vi.doMock("@/lib/auth/session", () => ({
      requireUser: async () => ({ id: "user_123" })
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      enforceRateLimit: async () => undefined
    }));
    vi.doMock("@/lib/security/audit", () => ({
      auditLog: async () => undefined
    }));
    vi.doMock("@/lib/services/reviews", () => ({
      generateReview: async () => ({
        review: {
          id: "review_123",
          type: "daily",
          status: "open",
          title: "Daily review - 2026-06-14",
          checklist: []
        },
        reminder: null
      })
    }));

    const { POST } = await import("@/app/api/reviews/generate/route");
    const response = await POST(
      new Request("http://localhost/api/reviews/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "daily" })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      data: {
        review: {
          id: "review_123",
          type: "daily",
          status: "open",
          title: "Daily review - 2026-06-14",
          checklist: []
        },
        reminder: null
      }
    });
  });
});
