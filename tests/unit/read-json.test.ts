import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique: vi.fn(async () => null) } } }));

import { readJson } from "@/lib/api/response";
import { POST as login } from "@/app/api/auth/login/route";

const schema = z.object({ email: z.string().optional() }).strict();
const req = (body: BodyInit | null, contentType?: string) =>
  new Request("http://localhost/api/x", { method: "POST", body, headers: contentType ? { "content-type": contentType } : {} });

describe("readJson", () => {
  it("parses a JSON body, with or without a charset", async () => {
    expect(await readJson(req('{"email":"a@b.c"}', "application/json"), schema)).toEqual({ email: "a@b.c" });
    expect(await readJson(req('{"email":"a@b.c"}', "application/json; charset=utf-8"), schema)).toEqual({ email: "a@b.c" });
  });

  it("refuses a body sent as another content type (a cross-site HTML form can only send those)", async () => {
    for (const type of ["text/plain", "text/plain;charset=UTF-8", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) {
      await expect(readJson(req('{"email":"a@b.c"}', type), schema)).rejects.toMatchObject({ status: 415, code: "UNSUPPORTED_MEDIA_TYPE" });
    }
    await expect(readJson(req('{"email":"a@b.c"}'), schema)).rejects.toMatchObject({ status: 415 });
  });

  it("treats an empty body as an empty object, whatever the content type", async () => {
    expect(await readJson(req(null), schema)).toEqual({});
    expect(await readJson(req("", "text/plain"), schema)).toEqual({});
  });

  it("keeps malformed JSON a validation problem, not a crash", async () => {
    await expect(readJson(req("{", "application/json"), z.object({ email: z.string() }))).rejects.toBeInstanceOf(z.ZodError);
  });
});

describe("login CSRF", () => {
  it("answers a text/plain form post with 415 and no session", async () => {
    const body = '{"email":"attacker@example.com","password":"Str0ngPass=word!x"}';
    const res = await login(new Request("http://localhost/api/auth/login", { method: "POST", headers: { "content-type": "text/plain", origin: "https://evil.example" }, body }));

    expect(res.status).toBe(415);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
