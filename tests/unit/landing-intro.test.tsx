import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

// The hero intro is the riskiest code on the landing: it loads two libraries on demand and takes over a chart the
// server already painted. These tests run the real effect with the libraries replaced by recorders.

const loaded = vi.hoisted(() => ({ gsap: 0, three: 0, threeFails: false, timelines: [] as { kill: ReturnType<typeof vi.fn>; vars: Record<string, unknown> }[] }));

vi.mock("@/lib/demo", () => ({ DEMO_MODE: false }));

vi.mock("gsap", () => {
  loaded.gsap += 1;
  const gsap = {
    set: vi.fn(),
    to: vi.fn(),
    fromTo: vi.fn(),
    killTweensOf: vi.fn(),
    timeline: vi.fn((vars: Record<string, unknown> = {}) => {
      const timeline = { to: vi.fn(() => timeline), kill: vi.fn(), vars };
      loaded.timelines.push(timeline);
      return timeline;
    })
  };
  return { gsap, default: gsap };
});

vi.mock("@/features/landing/three-bits", () => {
  loaded.three += 1;
  if (loaded.threeFails) throw new Error("chunk failed to load");
  return {};
});

function stubBrowser({ reduced = false, wide = false, saveData = false }: { reduced?: boolean; wide?: boolean; saveData?: boolean }) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reduced : query.includes("min-width") ? wide : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
  );
  Object.defineProperty(window.navigator, "connection", { value: { saveData }, configurable: true });
}

async function renderStage() {
  const { EquityStage } = await import("@/features/landing/equity-stage");
  return render(<EquityStage locale="en" />);
}

const intro = (container: HTMLElement) => container.querySelector("figure")?.getAttribute("data-intro");

beforeEach(() => {
  vi.resetModules();
  loaded.gsap = 0;
  loaded.three = 0;
  loaded.threeFails = false;
  loaded.timelines.length = 0;
  // jsdom has no SVG geometry.
  (SVGElement.prototype as unknown as { getTotalLength: () => number }).getTotalLength = () => 1000;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the hero chart's intro", () => {
  it("is marked pending in the server markup, so the finished chart is not painted and then wiped", async () => {
    stubBrowser({ reduced: true });
    const { renderToString } = await import("react-dom/server");
    const { EquityStage } = await import("@/features/landing/equity-stage");
    const html = renderToString(<EquityStage locale="en" />);
    expect(html).toContain('data-intro="pending"');
    // What the intro hides until it starts: the line, the area, the pins, their labels and the four numbers.
    expect(html.match(/data-intro-part/g)?.length).toBeGreaterThanOrEqual(12);
  });

  it("loads no animation library when the visitor asked for less motion, and shows the finished chart", async () => {
    stubBrowser({ reduced: true, wide: true });
    const { container } = await renderStage();
    await waitFor(() => expect(intro(container)).toBe("done"));
    expect(loaded.gsap).toBe(0);
    expect(loaded.three).toBe(0);
    expect(container.textContent).toContain("+8.7R");
  });

  it("draws the light SVG version on a phone without loading the 3D library", async () => {
    stubBrowser({ wide: false });
    const { container } = await renderStage();
    await waitFor(() => expect(loaded.timelines).toHaveLength(1));
    expect(loaded.gsap).toBe(1);
    expect(loaded.three).toBe(0);
    expect(intro(container)).toBe("running");
    expect(container.querySelector("canvas")?.hasAttribute("hidden")).toBe(true);
    expect((container.querySelector("[data-line]") as SVGPathElement).style.strokeDasharray).not.toBe("");
  });

  it("skips the 3D library on a data-saving connection", async () => {
    stubBrowser({ wide: true, saveData: true });
    await renderStage();
    await waitFor(() => expect(loaded.timelines).toHaveLength(1));
    expect(loaded.three).toBe(0);
  });

  it("does not download the 3D library when the device cannot draw it properly", async () => {
    // jsdom has no WebGL at all, which is the same answer a software-only renderer gives to the probe.
    stubBrowser({ wide: true });
    const { container } = await renderStage();
    await waitFor(() => expect(loaded.timelines).toHaveLength(1));
    expect(loaded.three).toBe(0);
    expect(container.querySelector("canvas")?.hasAttribute("hidden")).toBe(true);
  });

  it("falls back to the SVG drawing when the 3D library fails to load", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ getExtension: () => null } as unknown as RenderingContext);
    loaded.threeFails = true;
    stubBrowser({ wide: true });
    const { container } = await renderStage();
    await waitFor(() => expect(loaded.timelines).toHaveLength(1));
    expect(loaded.three).toBe(1);
    expect(container.querySelector("canvas")?.hasAttribute("hidden")).toBe(true);
    expect(container.querySelector("figure svg")?.hasAttribute("hidden")).toBe(false);
  });

  it("leaves the finished chart behind when the page is left mid-draw", async () => {
    stubBrowser({ wide: false });
    const { container, unmount } = await renderStage();
    await waitFor(() => expect(loaded.timelines).toHaveLength(1));
    const figure = container.querySelector("figure") as HTMLElement;
    const line = container.querySelector("[data-line]") as SVGPathElement;
    unmount();
    expect(loaded.timelines[0].kill).toHaveBeenCalled();
    expect(figure.getAttribute("data-intro")).toBe("done");
    expect(line.style.strokeDasharray).toBe("");
    expect(figure.textContent).toContain("+8.7R");
  });

  it("clears the dash when the drawing ends, so a later resize cannot cut the line", async () => {
    stubBrowser({ wide: false });
    const { container } = await renderStage();
    await waitFor(() => expect(loaded.timelines).toHaveLength(1));
    const onComplete = loaded.timelines[0].vars.onComplete as () => void;
    onComplete();
    expect((container.querySelector("[data-line]") as SVGPathElement).style.strokeDasharray).toBe("");
    expect(intro(container)).toBe("done");
  });
});

describe("the hero chart's drawing maths", () => {
  it("measures the dash in screen pixels, because the stroke does not scale with the chart", async () => {
    const { dashLengthOnScreen } = await import("@/features/landing/equity-stage");
    // The chart is 640 units wide: on a 320px box the line is half as long on screen, on a 960px box 1.5 times.
    expect(dashLengthOnScreen(1000, 320)).toBeCloseTo(500, 5);
    expect(dashLengthOnScreen(1000, 960)).toBeCloseTo(1500, 5);
    // Not laid out yet: fall back to the path's own length rather than a zero dash.
    expect(dashLengthOnScreen(1000, 0)).toBe(1000);
  });

  it("drops each pin when the line reaches it, measured along the line, not across the chart", async () => {
    const { pinThresholds } = await import("@/features/landing/equity-stage");
    const { sampleMonth } = await import("@/features/landing/sample-month");
    expect(pinThresholds).toHaveLength(sampleMonth.pins.length);
    pinThresholds.forEach((threshold, index) => {
      expect(threshold).toBeGreaterThan(0);
      expect(threshold).toBeLessThan(1);
      if (index) expect(threshold).toBeGreaterThan(pinThresholds[index - 1]);
    });
  });
});
