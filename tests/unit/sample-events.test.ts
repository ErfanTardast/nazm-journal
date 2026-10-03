import { afterEach, describe, expect, it, vi } from "vitest";
import { announceSampleChange, announceSampleRemoved, askSampleRecheck } from "@/features/sample/sample-workspace-client";

const heard: Array<[string, () => void]> = [];
function listen(type: string) {
  const handler = vi.fn();
  window.addEventListener(type, handler);
  heard.push([type, handler]);
  return handler;
}

afterEach(() => {
  for (const [type, handler] of heard.splice(0)) window.removeEventListener(type, handler);
});

// These events are visible in the public code and to anything else listening on the window, so they carry the product's name.
describe("sample workspace window events", () => {
  it("announces loaded sample data as nazm:sample-workspace-changed", () => {
    const handler = listen("nazm:sample-workspace-changed");
    announceSampleChange();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("announces a removed sample workspace as nazm:sample-workspace-removed", () => {
    const handler = listen("nazm:sample-workspace-removed");
    announceSampleRemoved();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("asks for a recheck as nazm:sample-workspace-recheck", () => {
    const handler = listen("nazm:sample-workspace-recheck");
    askSampleRecheck();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
