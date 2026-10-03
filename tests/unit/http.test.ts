import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError, fetchJson } from "@/lib/providers/http";

describe("fetchJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hello: "world" }) }));
    expect(await fetchJson("https://example.test")).toEqual({ hello: "world" });
  });

  it("throws HttpError on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));
    await expect(fetchJson("https://example.test")).rejects.toBeInstanceOf(HttpError);
  });

  it("maps an aborted request to a TimeoutError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        const error = new Error("aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      })
    );
    await expect(fetchJson("https://example.test", { timeoutMs: 5 })).rejects.toThrowError(/timed out/);
  });
});
