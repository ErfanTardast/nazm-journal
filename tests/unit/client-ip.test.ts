import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp } from "@/lib/security/client-ip";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const request = (headers: Record<string, string>) => new Request("http://localhost/api/auth/login", { headers });

afterEach(() => vi.unstubAllEnvs());

describe("clientIp", () => {
  it("takes the address our proxy added, not the client-supplied start of X-Forwarded-For", () => {
    expect(clientIp(request({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("counts back further when more trusted proxies sit in front", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    expect(clientIp(request({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.2" }))).toBe("203.0.113.9");
  });

  it("falls back to X-Real-IP, then to nothing", () => {
    expect(clientIp(request({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(request({}))).toBeNull();
  });
});

describe("rate limiting behind a proxy", () => {
  it("cannot be dodged by sending a new X-Forwarded-For start each time", async () => {
    await enforceRateLimit(request({ "x-forwarded-for": "1.1.1.1, 203.0.113.77" }), "test:forged", 1, 60);

    await expect(enforceRateLimit(request({ "x-forwarded-for": "2.2.2.2, 203.0.113.77" }), "test:forged", 1, 60)).rejects.toMatchObject({ status: 429 });
  });
});

describe("rate-limit refusals in the server log", () => {
  it("name the scope and the client address the limit was keyed on, so a proxy address shared by everyone is visible", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const probe = request({ "x-forwarded-for": "1.1.1.1, 203.0.113.55" });
      await enforceRateLimit(probe, "test:logged", 1, 60);
      await expect(enforceRateLimit(probe, "test:logged", 1, 60)).rejects.toMatchObject({ status: 429 });

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0].join(" ")).toMatch(/rate limited.*test:logged.*203\.0\.113\.55/);
    } finally {
      warn.mockRestore();
    }
  });
});
