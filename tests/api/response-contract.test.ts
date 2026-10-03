import { describe, expect, it } from "vitest";
import { fail, ok } from "@/lib/api/response";

describe("API response contract", () => {
  it("wraps successful payloads in data", async () => {
    const response = ok({ hello: "world" });
    await expect(response.json()).resolves.toEqual({ data: { hello: "world" } });
  });

  it("wraps failed payloads in error", async () => {
    const response = fail("TEST", "Failure", 400, { field: "value" });
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "TEST",
        message: "Failure",
        details: { field: "value" }
      }
    });
  });
});

