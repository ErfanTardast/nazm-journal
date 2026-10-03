import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

type FetchEvent = { request: Request; respondWith: (response: Promise<Response>) => void };

/** Run public/sw.js in a sandbox and send it one fetch event; report whether the response went into the cache. */
async function fetchThroughWorker(request: Request, network: Response = new Response("body", { status: 200 })) {
  const handlers: Record<string, (event: FetchEvent) => void> = {};
  const put = vi.fn(async () => undefined);
  const sandbox = {
    self: { addEventListener: (type: string, handler: (event: FetchEvent) => void) => (handlers[type] = handler), skipWaiting: () => undefined, clients: { claim: async () => undefined } },
    caches: { open: async () => ({ put, addAll: async () => undefined }), match: async () => undefined, keys: async () => [], delete: async () => true },
    fetch: async () => network,
    Response,
    URL
  };
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), sandbox);
  let responded: Promise<Response> | null = null;
  handlers.fetch({ request, respondWith: (response) => (responded = response) });
  if (responded) await responded;
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { cached: put.mock.calls.length > 0 };
}

const get = (url: string, headers: Record<string, string> = {}) => new Request(`https://app.example${url}`, { headers });

describe("service worker caching", () => {
  it("never caches API responses (they hold a signed-in user's data and would outlive logout)", async () => {
    for (const url of ["/api/dashboard/overview", "/api/auth/me", "/api/users/me/export"]) {
      expect((await fetchThroughWorker(get(url))).cached).toBe(false);
    }
  });

  it("never caches React Server Component payloads", async () => {
    expect((await fetchThroughWorker(get("/en/dashboard?_rsc=abc"))).cached).toBe(false);
    expect((await fetchThroughWorker(get("/en/dashboard", { rsc: "1" }))).cached).toBe(false);
  });

  it("keeps the self-hosted Persian font for offline use", async () => {
    expect((await fetchThroughWorker(get("/fonts/vazirmatn/Vazirmatn-Variable.v1.woff2"))).cached).toBe(true);
    // A path that only looks similar is not a font.
    expect((await fetchThroughWorker(get("/api/fonts/vazirmatn/x.woff2"))).cached).toBe(false);
    expect((await fetchThroughWorker(get("/en/fonts"))).cached).toBe(false);
  });

  it("uses a new cache version so existing installs pick up the font rule", () => {
    const source = readFileSync("public/sw.js", "utf8");
    const version = Number(source.match(/nazm-shell-v(\d+)/)?.[1]);
    expect(version).toBeGreaterThanOrEqual(4);
  });

  it("keeps the shell in the nazm cache and drops the cache of the earlier name when it takes over", async () => {
    const handlers: Record<string, (event: { waitUntil: (work: Promise<unknown>) => void }) => void> = {};
    const opened: string[] = [];
    const deleted: string[] = [];
    const sandbox = {
      self: { addEventListener: (type: string, handler: (typeof handlers)[string]) => (handlers[type] = handler), skipWaiting: () => undefined, clients: { claim: async () => undefined } },
      caches: {
        open: async (name: string) => {
          opened.push(name);
          return { put: async () => undefined, addAll: async () => undefined };
        },
        keys: async () => ["trademaster-ai-shell-v3", "nazm-shell-v4"],
        delete: async (name: string) => {
          deleted.push(name);
          return true;
        }
      },
      fetch: async () => new Response("body"),
      Response,
      URL
    };
    vm.runInNewContext(readFileSync("public/sw.js", "utf8"), sandbox);
    let pending: Promise<unknown> = Promise.resolve();
    handlers.install({ waitUntil: (work) => (pending = work) });
    await pending;
    handlers.activate({ waitUntil: (work) => (pending = work) });
    await pending;
    expect(opened).toEqual(["nazm-shell-v4"]);
    expect(deleted).toEqual(["trademaster-ai-shell-v3"]);
  });

  it("caches successful static assets only", async () => {
    expect((await fetchThroughWorker(get("/_next/static/chunks/app.js"))).cached).toBe(true);
    expect((await fetchThroughWorker(get("/icons/icon-192.svg"))).cached).toBe(true);
    expect((await fetchThroughWorker(get("/_next/static/chunks/app.js"), new Response("", { status: 404 }))).cached).toBe(false);
  });
});
