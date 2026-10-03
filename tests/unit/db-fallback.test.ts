import { afterEach, describe, expect, it, vi } from "vitest";
import { isDatabaseUnavailableError } from "@/lib/db/errors";

describe("database unavailable handling", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/db/prisma");
  });

  it("recognizes common PostgreSQL and Prisma connection failures", () => {
    expect(isDatabaseUnavailableError({ code: "P1001", message: "Can't reach database server" })).toBe(true);
    expect(isDatabaseUnavailableError({ code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:5432" })).toBe(true);
    expect(isDatabaseUnavailableError(new Error("schema mismatch"))).toBe(false);
  });

  it("returns deterministic news fallback when Prisma cannot connect", async () => {
    vi.doMock("@/lib/db/prisma", () => ({
      prisma: {
        newsItem: {
          findMany: vi.fn().mockRejectedValue({ code: "P1001", message: "Can't reach database server" })
        }
      }
    }));

    const { listNews } = await import("@/lib/services/news");
    const news = await listNews("en");

    expect(news.length).toBeGreaterThan(0);
    expect(news[0].source).toContain("Nazm");
  });

  it("returns deterministic learning fallback when Prisma cannot connect", async () => {
    vi.doMock("@/lib/db/prisma", () => ({
      prisma: {
        learningGlossary: {
          findMany: vi.fn().mockRejectedValue({ code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:5432" })
        }
      }
    }));

    const { listGlossary, learningTemplates } = await import("@/lib/services/learning");
    const glossary = await listGlossary("fa");

    expect(glossary[0].term).toContain("امید");
    expect(learningTemplates("fa").weeklyReview[0]).toContain("اشتباه");
  });
});
