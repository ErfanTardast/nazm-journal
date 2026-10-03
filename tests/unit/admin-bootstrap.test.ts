// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => undefined) }));
vi.mock("@/lib/security/audit", () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/security/password", () => ({
  hashPassword: vi.fn(async () => "hash"),
  verifyPassword: vi.fn(async (password: string) => password === "LongEnough123")
}));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  createSession: vi.fn(async () => ({ value: "t", expiresAt: new Date() })),
  applySessionCookie: vi.fn()
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    role: { upsert: vi.fn() },
    userRole: { upsert: vi.fn(async () => ({})), delete: vi.fn(), deleteMany: vi.fn(), update: vi.fn() }
  }
}));

import { prisma } from "@/lib/db/prisma";
import { createSession } from "@/lib/auth/session";
import { auditLog } from "@/lib/security/audit";
import { adminEmails, ensureAdminRole, isAdminEmail } from "@/lib/auth/admin-bootstrap";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";

const traderRoles = [{ role: { name: "trader" } }];
const OWNER = "owner@example.com";

const post = (handler: typeof login, body: object) =>
  handler(new Request("http://localhost/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const signIn = (email: string, password = "LongEnough123") => post(login, { email, password });
const signUp = (email: string) => {
  vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null as never); // no account with this e-mail yet
  return post(register, { email, name: "Owner", password: "LongEnough123", inviteCode: "trial" });
};

const bootstrapAudits = () => vi.mocked(auditLog).mock.calls.filter(([entry]) => entry.action === "auth.admin_bootstrap");

const adminGrants = () =>
  vi.mocked(prisma.userRole.upsert).mock.calls.filter(([args]) => (args as { create: { roleId: string } }).create.roleId === "role-admin");

beforeEach(() => {
  vi.stubEnv("REGISTRATION_INVITE_CODE", "trial");
  vi.mocked(prisma.role.upsert).mockImplementation((async ({ where }: { where: { name: string } }) => ({ id: `role-${where.name}`, name: where.name })) as never);
  vi.mocked(prisma.user.findUnique).mockImplementation((async ({ where }: { where: { email: string } }) =>
    where.email === "nobody@example.com" ? null : { id: "u1", email: where.email, name: "Owner", passwordHash: "hash", twoFactorEnabled: false, roles: traderRoles }) as never);
  vi.mocked(prisma.user.create).mockImplementation((async ({ data }: { data: { email: string } }) => ({ id: "u1", email: data.email, name: "Owner", roles: traderRoles })) as never);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("ADMIN_EMAILS parsing", () => {
  it("reads a comma-separated list, trimmed and lower-cased", () => {
    expect([...adminEmails({ ADMIN_EMAILS: " Owner@Example.com , second@example.com ,," })]).toEqual([OWNER, "second@example.com"]);
  });

  it.each([undefined, "", "   ", " , ,, "])("grants nobody for %j", (value) => {
    expect(adminEmails({ ADMIN_EMAILS: value }).size).toBe(0);
    expect(isAdminEmail(OWNER, { ADMIN_EMAILS: value })).toBe(false);
    expect(isAdminEmail("", { ADMIN_EMAILS: value })).toBe(false);
  });

  it("matches an address whatever its case, but only the whole address", () => {
    const env = { ADMIN_EMAILS: "Owner@Example.com" };
    expect(isAdminEmail("OWNER@example.COM", env)).toBe(true);
    expect(isAdminEmail(" owner@example.com ", env)).toBe(true);
    expect(isAdminEmail("xowner@example.com", env)).toBe(false);
    expect(isAdminEmail("owner@example.com.evil.test", env)).toBe(false);
    expect(isAdminEmail("owner@example.org", env)).toBe(false);
  });
});

describe("ensureAdminRole", () => {
  it("attaches the admin role to a listed user, creating the role when it does not exist", async () => {
    const granted = await ensureAdminRole({ id: "u1", email: OWNER }, { ADMIN_EMAILS: OWNER });

    expect(granted).toBe(true);
    expect(prisma.role.upsert).toHaveBeenCalledWith({
      where: { name: "admin" },
      update: {},
      create: { name: "admin", description: "Full administrative role" }
    });
    expect(prisma.userRole.upsert).toHaveBeenCalledWith({
      where: { userId_roleId: { userId: "u1", roleId: "role-admin" } },
      update: {},
      create: { userId: "u1", roleId: "role-admin" }
    });
  });

  it("does nothing for an unlisted user, or when nobody is listed", async () => {
    expect(await ensureAdminRole({ id: "u2", email: "friend@example.com" }, { ADMIN_EMAILS: OWNER })).toBe(false);
    expect(await ensureAdminRole({ id: "u1", email: OWNER }, { ADMIN_EMAILS: "  " })).toBe(false);
    expect(await ensureAdminRole({ id: "u1", email: OWNER }, {})).toBe(false);
    expect(prisma.role.upsert).not.toHaveBeenCalled();
    expect(prisma.userRole.upsert).not.toHaveBeenCalled();
  });

  it("leaves a user who already has the admin role alone", async () => {
    const granted = await ensureAdminRole({ id: "u1", email: OWNER, roles: [{ role: { name: "admin" } }] }, { ADMIN_EMAILS: OWNER });

    expect(granted).toBe(false);
    expect(prisma.userRole.upsert).not.toHaveBeenCalled();
  });

  it("never removes or rewrites a role", async () => {
    await ensureAdminRole({ id: "u1", email: OWNER, roles: traderRoles }, { ADMIN_EMAILS: OWNER });
    await ensureAdminRole({ id: "u2", email: "friend@example.com", roles: [{ role: { name: "admin" } }] }, { ADMIN_EMAILS: OWNER });

    expect(prisma.userRole.delete).not.toHaveBeenCalled();
    expect(prisma.userRole.deleteMany).not.toHaveBeenCalled();
    expect(prisma.userRole.update).not.toHaveBeenCalled();
    // The role row itself is only created, never updated: an existing admin role keeps its description and permissions.
    expect(vi.mocked(prisma.role.upsert).mock.calls.every(([args]) => Object.keys((args as { update: object }).update).length === 0)).toBe(true);
  });
});

describe("signing in", () => {
  it("gives a listed e-mail the admin role", async () => {
    vi.stubEnv("ADMIN_EMAILS", OWNER);

    const res = await signIn(OWNER);

    expect(res.status).toBe(200);
    expect(adminGrants()).toHaveLength(1);
    expect(adminGrants()[0][0]).toMatchObject({ create: { userId: "u1" } });
    expect((await res.json()).data.user.roles).toEqual(["trader", "admin"]);
    expect(bootstrapAudits()).toHaveLength(1);
    expect(bootstrapAudits()[0][0]).toMatchObject({ userId: "u1", entity: "User", entityId: "u1" });
  });

  it("matches the list whatever the case of the address typed or listed", async () => {
    vi.stubEnv("ADMIN_EMAILS", "  Owner@Example.COM ,someone@else.test");

    await signIn("OWNER@example.com");

    expect(adminGrants()).toHaveLength(1);
  });

  it("gives an unlisted e-mail nothing", async () => {
    vi.stubEnv("ADMIN_EMAILS", OWNER);

    const res = await signIn("friend@example.com");

    expect(res.status).toBe(200);
    expect(adminGrants()).toHaveLength(0);
    expect(bootstrapAudits()).toHaveLength(0);
    expect((await res.json()).data.user.roles).toEqual(["trader"]);
  });

  it.each([undefined, "", "   ", ",,"])("grants nothing when ADMIN_EMAILS is %j", async (value) => {
    if (value === undefined) delete process.env.ADMIN_EMAILS;
    else vi.stubEnv("ADMIN_EMAILS", value);

    await signIn(OWNER);

    expect(prisma.userRole.upsert).not.toHaveBeenCalled();
  });

  it("grants nothing when the password is wrong", async () => {
    vi.stubEnv("ADMIN_EMAILS", OWNER);

    const res = await signIn(OWNER, "wrong-password");

    expect(res.status).toBe(401);
    expect(prisma.userRole.upsert).not.toHaveBeenCalled();
  });

  it("grants nothing for an address with no account", async () => {
    vi.stubEnv("ADMIN_EMAILS", "nobody@example.com");

    expect((await signIn("nobody@example.com")).status).toBe(401);
    expect(prisma.userRole.upsert).not.toHaveBeenCalled();
  });

  it("grants nothing while a two-factor code is still missing", async () => {
    vi.stubEnv("ADMIN_EMAILS", OWNER);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "u1",
      email: OWNER,
      passwordHash: "hash",
      twoFactorEnabled: true,
      twoFactorSecret: "secret",
      roles: traderRoles
    } as never);

    const res = await signIn(OWNER);

    expect(res.status).toBe(401);
    expect(prisma.userRole.upsert).not.toHaveBeenCalled();
  });

  it("does not touch the roles of someone who is already an admin", async () => {
    vi.stubEnv("ADMIN_EMAILS", OWNER);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "u1",
      email: OWNER,
      passwordHash: "hash",
      twoFactorEnabled: false,
      roles: [{ role: { name: "admin" } }, { role: { name: "trader" } }]
    } as never);

    const res = await signIn(OWNER);

    expect(prisma.userRole.upsert).not.toHaveBeenCalled();
    expect((await res.json()).data.user.roles).toEqual(["admin", "trader"]);
  });
});

describe("registering never grants a role", () => {
  const register409 = { error: { code: "EMAIL_ALREADY_EXISTS", message: "An account with this email already exists", details: {} } };

  it("refuses a listed address that has no account exactly like a taken one, and creates nothing", async () => {
    vi.stubEnv("ADMIN_EMAILS", `friend@example.com, ${OWNER}`);

    // The listed address has no account yet: the database lookup would find nobody.
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    const res = await post(register, { email: OWNER, name: "Owner", password: "LongEnough123", inviteCode: "trial" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(register409);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.role.upsert).not.toHaveBeenCalled();
    expect(prisma.userRole.upsert).not.toHaveBeenCalled();
    expect(bootstrapAudits()).toHaveLength(0);
    expect(auditLog).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("looks the address up even when it is listed, so both refusals do the same work and response time does not tell them apart", async () => {
    vi.stubEnv("ADMIN_EMAILS", OWNER);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

    await post(register, { email: OWNER, name: "Owner", password: "LongEnough123", inviteCode: "trial" });
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: OWNER } });

    // The same lookup happens for a taken address that is not listed.
    vi.mocked(prisma.user.findUnique).mockClear();
    await post(register, { email: "taken@example.com", name: "Someone", password: "LongEnough123", inviteCode: "trial" });
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it("answers a listed address with the same status, code and message as an address that really has an account", async () => {
    // A taken address, with nothing listed.
    const taken = await post(register, { email: "taken@example.com", name: "Someone", password: "LongEnough123", inviteCode: "trial" });
    const takenBody = await taken.text();
    expect(taken.status).toBe(409);

    vi.stubEnv("ADMIN_EMAILS", OWNER);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    const listed = await post(register, { email: OWNER, name: "Owner", password: "LongEnough123", inviteCode: "trial" });

    expect(listed.status).toBe(taken.status);
    expect(await listed.text()).toBe(takenBody);
  });

  it("matches the listed address whatever its case or spacing", async () => {
    vi.stubEnv("ADMIN_EMAILS", "  Owner@Example.COM ");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

    const res = await post(register, { email: "OWNER@example.com", name: "Owner", password: "LongEnough123", inviteCode: "trial" });

    expect(res.status).toBe(409);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("checks the invite code first: a wrong code still answers 403, so the list cannot be probed without it", async () => {
    vi.stubEnv("ADMIN_EMAILS", OWNER);

    const res = await post(register, { email: OWNER, name: "Owner", password: "LongEnough123", inviteCode: "guess" });

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("INVITE_REQUIRED");
  });

  it("still registers an unlisted address as a plain trader, with no admin role and no admin audit entry", async () => {
    vi.stubEnv("ADMIN_EMAILS", OWNER);

    const res = await signUp("newcomer@example.com");

    expect(res.status).toBe(201);
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ roles: { create: { roleId: "role-trader" } } }) }));
    expect(adminGrants()).toHaveLength(0);
    expect(bootstrapAudits()).toHaveLength(0);
    expect((await res.json()).data.user.roles).toEqual(["trader"]);
  });

  it("registers the owner while ADMIN_EMAILS is empty, as a plain trader (the grant comes at the next sign-in)", async () => {
    delete process.env.ADMIN_EMAILS;

    const res = await signUp(OWNER);

    expect(res.status).toBe(201);
    expect((await res.json()).data.user.roles).toEqual(["trader"]);
    expect(prisma.userRole.upsert).not.toHaveBeenCalled();
    expect(bootstrapAudits()).toHaveLength(0);
  });

  it.each([undefined, "", "   ", " , "])("grants nothing when ADMIN_EMAILS is %j", async (value) => {
    if (value === undefined) delete process.env.ADMIN_EMAILS;
    else vi.stubEnv("ADMIN_EMAILS", value);

    await signUp(OWNER);

    expect(prisma.userRole.upsert).not.toHaveBeenCalled();
  });

  it("grants nothing when the invite code is wrong (no account is created)", async () => {
    vi.stubEnv("ADMIN_EMAILS", OWNER);

    const res = await post(register, { email: OWNER, name: "Owner", password: "LongEnough123", inviteCode: "guess" });

    expect(res.status).toBe(403);
    expect(prisma.userRole.upsert).not.toHaveBeenCalled();
  });
});
