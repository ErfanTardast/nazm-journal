// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readJson } from "@/lib/api/response";

const schema = z.object({ text: z.string() }).strict();
const KB = 1024;

function post(body: string | null, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body
  });
}

/** A body of exactly `bytes` bytes of valid JSON. */
const jsonOfSize = (bytes: number) => {
  const overhead = JSON.stringify({ text: "" }).length;
  return JSON.stringify({ text: "a".repeat(bytes - overhead) });
};

describe("readJson without a size option", () => {
  it("is unchanged: a large body is still read and parsed", async () => {
    const body = jsonOfSize(300 * KB);

    const parsed = await readJson(post(body), schema);

    expect(parsed.text.length).toBeGreaterThan(250 * KB);
  });

  it("ignores an oversized content-length header", async () => {
    const parsed = await readJson(post(jsonOfSize(100), { "content-length": String(10 * 1024 * 1024) }), schema);

    expect(parsed.text.length).toBeGreaterThan(0);
  });
});

describe("readJson with maxBytes", () => {
  const limit = 8 * KB;
  const options = { maxBytes: limit };

  it("parses a body that fits, up to and including the limit", async () => {
    expect((await readJson(post(jsonOfSize(500)), schema, options)).text).toHaveLength(500 - JSON.stringify({ text: "" }).length);
    expect(await readJson(post(jsonOfSize(limit)), schema, options)).toBeTruthy();
  });

  it("refuses a body whose content-length is larger than the limit with 413, before reading it", async () => {
    let read = false;
    const request = post(jsonOfSize(100), { "content-length": String(limit + 1) });
    const original = request.text.bind(request);
    request.text = async () => {
      read = true;
      return original();
    };

    await expect(readJson(request, schema, options)).rejects.toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
    expect(read).toBe(false);
    expect(request.bodyUsed).toBe(false);
  });

  it("refuses an oversized body that declares no content-length (chunked) once it has been read", async () => {
    await expect(readJson(post(jsonOfSize(limit + 1)), schema, options)).rejects.toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
    await expect(readJson(post(jsonOfSize(200 * KB)), schema, options)).rejects.toMatchObject({ status: 413 });
  });

  it("refuses a body that understates its content-length", async () => {
    await expect(readJson(post(jsonOfSize(limit * 3), { "content-length": "100" }), schema, options)).rejects.toMatchObject({ status: 413 });
  });

  it("counts bytes, not characters: 5000 Persian letters are about 10 KB", async () => {
    const persian = JSON.stringify({ text: "س".repeat(5000) });
    expect(persian.length).toBeLessThan(limit);

    await expect(readJson(post(persian), schema, options)).rejects.toMatchObject({ status: 413 });
    expect(await readJson(post(JSON.stringify({ text: "س".repeat(3000) })), schema, options)).toEqual({ text: "س".repeat(3000) });
  });

  it("answers 413 before 415, so a big body of the wrong type is not parsed or even read in full", async () => {
    const request = new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "text/plain" }, body: jsonOfSize(limit * 2) });

    await expect(readJson(request, schema, options)).rejects.toMatchObject({ status: 413 });
  });

  it("keeps the other behaviour: an empty body is an empty object, a wrong content type is 415, bad JSON is a validation error", async () => {
    const loose = z.object({ text: z.string().optional() }).strict();

    expect(await readJson(post(null), loose, options)).toEqual({});
    await expect(
      readJson(new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "text/plain" }, body: '{"text":"a"}' }), schema, options)
    ).rejects.toMatchObject({ status: 415 });
    await expect(readJson(post("{"), schema, options)).rejects.toBeInstanceOf(z.ZodError);
  });

  it("ignores a content-length that is not a number", async () => {
    expect(await readJson(post(jsonOfSize(100), { "content-length": "abc" }), schema, options)).toBeTruthy();
  });
});
