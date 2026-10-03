import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, unauthorized } from "@/lib/api/errors";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  auditLog: vi.fn(),
  enforceRateLimit: vi.fn(),
  getSampleWorkspaceState: vi.fn(),
  loadSampleWorkspace: vi.fn(),
  removeSampleWorkspace: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/security/audit", () => ({ auditLog: mocks.auditLog }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/services/sample-workspace", () => ({
  getSampleWorkspaceState: mocks.getSampleWorkspaceState,
  loadSampleWorkspace: mocks.loadSampleWorkspace,
  removeSampleWorkspace: mocks.removeSampleWorkspace
}));

import { DELETE, GET, POST } from "@/app/api/sample-workspace/route";

const counts = { trades: 30, strategies: 2, plans: 2, reviews: 2 };
const loadedAt = new Date("2026-10-02T09:30:00.000Z");

function call(handler: typeof GET | typeof POST | typeof DELETE, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return handler(
    new Request("http://localhost/api/sample-workspace", {
      method: init.method ?? "GET",
      headers: { ...(init.body === undefined ? {} : { "content-type": "application/json" }), ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body)
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user-1", locale: "en" });
  mocks.getSampleWorkspaceState.mockResolvedValue({ active: false, loadedAt: null, canLoad: true });
  mocks.loadSampleWorkspace.mockResolvedValue({ created: true, loadedAt, counts });
  mocks.removeSampleWorkspace.mockResolvedValue({ wasActive: true, removed: counts });
});

describe("signed out", () => {
  beforeEach(() => {
    mocks.requireUser.mockRejectedValue(unauthorized());
  });

  it.each([
    ["GET", () => call(GET)],
    ["POST", () => call(POST, { method: "POST" })],
    ["DELETE", () => call(DELETE, { method: "DELETE" })]
  ])("%s is answered with 401 and touches nothing", async (_method, send) => {
    const response = await send();
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    expect(mocks.getSampleWorkspaceState).not.toHaveBeenCalled();
    expect(mocks.loadSampleWorkspace).not.toHaveBeenCalled();
    expect(mocks.removeSampleWorkspace).not.toHaveBeenCalled();
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });
});

describe("GET /api/sample-workspace", () => {
  it("answers with the state of the signed-in account", async () => {
    mocks.getSampleWorkspaceState.mockResolvedValue({ active: true, loadedAt: loadedAt.toISOString(), canLoad: true });
    const response = await call(GET);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { active: true, loadedAt: loadedAt.toISOString(), canLoad: true } });
    expect(mocks.getSampleWorkspaceState).toHaveBeenCalledWith("user-1");
  });

  it("is rate limited", async () => {
    await call(GET);
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "sample-workspace:state", expect.any(Number), expect.any(Number));
  });
});

describe("POST /api/sample-workspace", () => {
  it("loads it and answers 201 with the counts", async () => {
    const response = await call(POST, { method: "POST" });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: { active: true, loadedAt: loadedAt.toISOString(), counts } });
    expect(mocks.loadSampleWorkspace).toHaveBeenCalledWith("user-1", "en");
  });

  it("answers 200 with the same shape when it was already loaded, and writes no audit entry", async () => {
    mocks.loadSampleWorkspace.mockResolvedValue({ created: false, loadedAt, counts });
    const response = await call(POST, { method: "POST" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { active: true, loadedAt: loadedAt.toISOString(), counts } });
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it("writes the audit entry sample_workspace.load when it loaded", async () => {
    await call(POST, { method: "POST" });
    expect(mocks.auditLog).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", action: "sample_workspace.load", metadata: { counts } }));
  });

  it("answers an account with trades of its own with 409 SAMPLE_NOT_EMPTY", async () => {
    mocks.loadSampleWorkspace.mockRejectedValue(new AppError("SAMPLE_NOT_EMPTY", "Sample data is only for an empty journal", 409));
    const response = await call(POST, { method: "POST" });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("SAMPLE_NOT_EMPTY");
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it("writes the language the screen sent", async () => {
    await call(POST, { method: "POST", body: { locale: "fa" } });
    expect(mocks.loadSampleWorkspace).toHaveBeenCalledWith("user-1", "fa");
  });

  it("without a body, follows the language of the page that asked, then the saved language", async () => {
    await call(POST, { method: "POST", headers: { referer: "http://localhost/fa/onboarding" } });
    expect(mocks.loadSampleWorkspace).toHaveBeenLastCalledWith("user-1", "fa");

    mocks.requireUser.mockResolvedValue({ id: "user-1", locale: "fa" });
    await call(POST, { method: "POST" });
    expect(mocks.loadSampleWorkspace).toHaveBeenLastCalledWith("user-1", "fa");

    mocks.requireUser.mockResolvedValue({ id: "user-1", locale: "en" });
    await call(POST, { method: "POST", headers: { referer: "http://localhost/en/dashboard" } });
    expect(mocks.loadSampleWorkspace).toHaveBeenLastCalledWith("user-1", "en");
  });

  it("ignores a referrer that is not one of the site's languages", async () => {
    await call(POST, { method: "POST", headers: { referer: "https://example.com/de/page" } });
    expect(mocks.loadSampleWorkspace).toHaveBeenLastCalledWith("user-1", "en");
  });

  it("refuses a body with anything else in it", async () => {
    const response = await call(POST, { method: "POST", body: { locale: "en", isSample: false } });
    expect(response.status).toBe(422);
    expect(mocks.loadSampleWorkspace).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    await call(POST, { method: "POST" });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "sample-workspace:load", expect.any(Number), expect.any(Number));
  });
});

describe("DELETE /api/sample-workspace", () => {
  it("removes it and answers with what was removed", async () => {
    const response = await call(DELETE, { method: "DELETE" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { active: false, removed: counts } });
    expect(mocks.removeSampleWorkspace).toHaveBeenCalledWith("user-1");
  });

  it("writes the audit entry sample_workspace.remove", async () => {
    await call(DELETE, { method: "DELETE" });
    expect(mocks.auditLog).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", action: "sample_workspace.remove", metadata: { removed: counts } }));
  });

  it("answers the same shape with zeros when nothing was loaded, and writes no audit entry", async () => {
    const zeros = { trades: 0, strategies: 0, plans: 0, reviews: 0 };
    mocks.removeSampleWorkspace.mockResolvedValue({ wasActive: false, removed: zeros });
    const response = await call(DELETE, { method: "DELETE" });
    expect(await response.json()).toEqual({ data: { active: false, removed: zeros } });
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    await call(DELETE, { method: "DELETE" });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "sample-workspace:remove", expect.any(Number), expect.any(Number));
  });
});
