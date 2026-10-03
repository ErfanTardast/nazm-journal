import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { startSession, endSession, getActiveSession, listSessions } from "@/lib/services/sessions";

const MOCK_SESSION = {
  id: "sess-1",
  userId: "user-1",
  status: "active" as const,
  market: "crypto",
  sessionLabel: "London open",
  emotionalState: "Calm",
  maxDailyLoss: null,
  allowedStrategyIds: [],
  mistakeToAvoid: "FOMO after a loss",
  notes: null,
  startedAt: new Date("2026-06-19T08:00:00Z"),
  endedAt: null,
  createdAt: new Date("2026-06-19T08:00:00Z"),
  updatedAt: new Date("2026-06-19T08:00:00Z")
};

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/api/errors", () => ({
  notFound: (msg: string) => Object.assign(new Error(msg), { status: 404 })
}));

describe("sessions service", () => {
  const USER = "user-1";
  let prismaFindFirst: ReturnType<typeof vi.fn>;
  let prismaFindMany: ReturnType<typeof vi.fn>;
  let prismaCreate: ReturnType<typeof vi.fn>;
  let prismaUpdate: ReturnType<typeof vi.fn>;
  let prismaUpdateMany: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    prismaFindFirst = vi.fn(async () => MOCK_SESSION);
    prismaFindMany = vi.fn(async () => [MOCK_SESSION]);
    prismaCreate = vi.fn(async () => MOCK_SESSION);
    prismaUpdate = vi.fn(async () => ({ ...MOCK_SESSION, status: "completed", endedAt: new Date() }));
    prismaUpdateMany = vi.fn(async () => ({ count: 0 }));
    Object.assign(prisma, {
      tradingSession: {
        findFirst: prismaFindFirst,
        findMany: prismaFindMany,
        create: prismaCreate,
        update: prismaUpdate,
        updateMany: prismaUpdateMany
      }
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("getActiveSession returns the first active session for the user", async () => {
    const session = await getActiveSession(USER);
    expect(prismaFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER, status: "active" } })
    );
    expect(session?.id).toBe("sess-1");
  });

  it("getActiveSession returns null when no active session exists", async () => {
    prismaFindFirst.mockResolvedValueOnce(null);
    const session = await getActiveSession(USER);
    expect(session).toBeNull();
  });

  it("startSession abandons existing active sessions before creating a new one", async () => {
    await startSession(USER, {
      market: "forex",
      sessionLabel: "NY open",
      allowedStrategyIds: []
    });
    expect(prismaUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER, status: "active" } })
    );
    expect(prismaCreate).toHaveBeenCalled();
  });

  it("startSession creates session with correct fields", async () => {
    await startSession(USER, {
      market: "crypto",
      sessionLabel: "London open",
      mistakeToAvoid: "FOMO after a loss",
      emotionalState: "Calm",
      allowedStrategyIds: []
    });
    expect(prismaCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER,
          market: "crypto",
          sessionLabel: "London open",
          mistakeToAvoid: "FOMO after a loss"
        })
      })
    );
  });

  it("endSession marks session as completed with endedAt timestamp", async () => {
    const result = await endSession(USER, "sess-1", { status: "completed" });
    expect(prismaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sess-1" },
        data: expect.objectContaining({ status: "completed", endedAt: expect.any(Date) })
      })
    );
    expect(result.status).toBe("completed");
  });

  it("endSession throws notFound when session does not belong to user", async () => {
    prismaFindFirst.mockResolvedValueOnce(null);
    await expect(endSession(USER, "other-sess", { status: "abandoned" })).rejects.toThrow("Session not found");
  });

  it("endSession can abandon a session", async () => {
    prismaUpdate.mockResolvedValueOnce({ ...MOCK_SESSION, status: "abandoned", endedAt: new Date() });
    const result = await endSession(USER, "sess-1", { status: "abandoned" });
    expect(prismaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "abandoned" }) })
    );
    expect(result.status).toBe("abandoned");
  });

  it("listSessions returns sessions ordered by startedAt desc", async () => {
    const sessions = await listSessions(USER);
    expect(prismaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER },
        orderBy: { startedAt: "desc" }
      })
    );
    expect(sessions).toHaveLength(1);
  });

  it("listSessions respects the limit parameter", async () => {
    await listSessions(USER, 5);
    expect(prismaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 })
    );
  });
});
