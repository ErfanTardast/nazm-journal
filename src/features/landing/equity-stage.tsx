"use client";

import { useEffect, useRef } from "react";
import type { Locale } from "@/lib/i18n/locales";
import { landingCopy } from "./landing-copy";
import { sampleMonth } from "./sample-month";
import { motionAllowed } from "./use-landing-motion";

type Gsap = typeof import("gsap").gsap;

/** The 2D chart's drawing box; the stage keeps the same 16:11 shape at every width, so percentages line up. */
const VIEW = { width: 640, height: 440, left: 36, right: 604, top: 70, bottom: 300 };

const { equity, pins, stats } = sampleMonth;
const lowest = Math.min(...equity);
const highest = Math.max(...equity);
const xAt = (index: number) => VIEW.left + (index / (equity.length - 1)) * (VIEW.right - VIEW.left);
const yAt = (value: number) => VIEW.bottom - ((value - lowest) / (highest - lowest)) * (VIEW.bottom - VIEW.top);
const linePath = equity.map((value, index) => `${index ? "L" : "M"}${xAt(index).toFixed(1)} ${yAt(value).toFixed(1)}`).join(" ");
const areaPath = `${linePath} L${xAt(equity.length - 1).toFixed(1)} ${yAt(0).toFixed(1)} L${xAt(0).toFixed(1)} ${yAt(0).toFixed(1)} Z`;

/** The length of the line up to each point. The line is drawn by length, so a pin's moment is a share of this. */
const lengthTo = equity.reduce<number[]>((lengths, value, index) => {
  if (index) lengths.push(lengths[index - 1] + Math.hypot(xAt(index) - xAt(index - 1), yAt(value) - yAt(equity[index - 1])));
  return lengths;
}, [0]);
/** How far along the drawn line each mistake sits (0 to 1): the pin lands when the line reaches it. */
export const pinThresholds = pins.map((pin) => lengthTo[pin.index] / lengthTo[lengthTo.length - 1]);

/**
 * The line keeps its thickness at every size (non-scaling stroke), so the browser measures its dashes in screen
 * pixels, not chart units. This is the line's length on screen for a stage `boxWidth` pixels wide.
 */
export function dashLengthOnScreen(userLength: number, boxWidth: number) {
  return boxWidth > 0 ? userLength * (boxWidth / VIEW.width) : userLength;
}

/** How long the month takes to draw, and how a mistake pin lands (the approved interaction thesis). */
const DRAW_SECONDS = 2.6;
const DRAW_EASE = "power2.inOut";
const PIN_SECONDS = 0.45;
const PIN_EASE = "back.out(1.7)";
/** How long the drawing waits for the 3D scene. After that the SVG draws, and the scene takes over when it arrives. */
const SCENE_WAIT_MS = 1200;

/** The three mistakes sit close together on the curve, so each label hangs off its point on a different side. */
const LABEL_SIDES = ["-translate-x-full -translate-y-full -ms-1", "-translate-y-[160%] translate-x-1", "translate-y-2 -translate-x-1/2"];

/** How the stage writes its numbers; exported so the counting-up states can be checked. */
export function stageFormatters(locale: Locale) {
  const tag = locale === "fa" ? "fa-IR" : "en-US";
  const one = new Intl.NumberFormat(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const whole = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 });
  return {
    r: (value: number) => `${value < 0 ? "−" : "+"}${one.format(Math.abs(value))}R`,
    /** A drawdown is a loss even while it still counts up from zero. */
    loss: (value: number) => `−${one.format(Math.abs(value))}R`,
    percent: (value: number) => `${whole.format(value)}${locale === "fa" ? "٪" : "%"}`,
    whole: (value: number) => whole.format(value)
  };
}

/** Reads a theme token such as "169 82% 44%" as a colour string three.js understands. */
function token(name: string, fallback: string) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parts = raw.split(/\s+/);
  return parts.length === 3 ? `hsl(${parts[0]}, ${parts[1]}, ${parts[2]})` : fallback;
}

/**
 * Whether this device draws WebGL on real hardware. Asked before the 3D library is downloaded: a phone-class or
 * software renderer would stutter through the drawing, so those visitors get the SVG and never pay for the library.
 */
function hardwareWebgl() {
  try {
    const probe = document.createElement("canvas");
    const options = { failIfMajorPerformanceCaveat: true };
    const context = (probe.getContext("webgl2", options) ?? probe.getContext("webgl", options)) as WebGLRenderingContext | null;
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * The hero chart: one sample month of trades, drawn once as a review. On a wide screen with WebGL it is a 3D ribbon
 * over the product's grid; otherwise the SVG below draws itself. With reduced motion it simply shows the finished chart.
 *
 * The markup is the finished chart. Until the drawing starts it is marked `data-intro="pending"`, and a rule in
 * globals.css keeps the parts that will be drawn out of sight, so nothing is painted and then wiped. The same rule
 * shows the finished chart by itself if the script never arrives.
 */
export function EquityStage({ locale }: { locale: Locale }) {
  const c = landingCopy[locale].stage;
  const format = stageFormatters(locale);
  const figureRef = useRef<HTMLElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const netRef = useRef<HTMLSpanElement>(null);
  const drawdownRef = useRef<HTMLSpanElement>(null);
  const adherenceRef = useRef<HTMLSpanElement>(null);
  const repeatedRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const figure = figureRef.current;
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const svg = svgRef.current;
    if (!figure || !box || !canvas || !svg) return;
    if (!motionAllowed()) {
      figure.dataset.intro = "done";
      return;
    }

    let cancelled = false;
    const cleanups: (() => void)[] = [];
    const fmt = stageFormatters(locale);

    // Held here, not read from the refs each time: the clean-up below runs after React has let go of the refs.
    const numbers = { net: netRef.current, drawdown: drawdownRef.current, adherence: adherenceRef.current, repeated: repeatedRef.current };
    const setNumbers = (progress: number) => {
      if (numbers.net) numbers.net.textContent = fmt.r(stats.netR * progress);
      if (numbers.drawdown) numbers.drawdown.textContent = fmt.loss(stats.maxDrawdownR * progress);
      if (numbers.adherence) numbers.adherence.textContent = fmt.percent(Math.round(100 - (100 - stats.adherencePct) * progress));
      if (numbers.repeated) numbers.repeated.textContent = fmt.whole(Math.round(stats.repeated.count * progress));
    };

    void (async () => {
      let gsap: Gsap;
      try {
        ({ gsap } = await import("gsap"));
      } catch {
        // The library did not load: the finished chart is the page.
        if (!cancelled) figure.dataset.intro = "done";
        return;
      }
      if (cancelled) return;

      const labels = labelRefs.current;
      const livingLabels = labels.filter((label): label is HTMLSpanElement => Boolean(label));
      const path = svg.querySelector<SVGPathElement>("[data-line]");
      const area = svg.querySelector<SVGPathElement>("[data-area]");
      const dots = [...svg.querySelectorAll<SVGCircleElement>("[data-pin]")];
      const dash = dashLengthOnScreen(path?.getTotalLength() ?? 0, box.getBoundingClientRect().width);
      const state = { progress: 0 };
      const shown = pins.map(() => false);
      let scene: Ribbon | null = null;

      const showSvg = () => {
        canvas.setAttribute("hidden", "");
        svg.removeAttribute("hidden");
      };
      const clearDash = () => {
        if (!path) return;
        path.style.strokeDasharray = "";
        path.style.strokeDashoffset = "";
      };
      /** The graphics context was lost, or the page is going away: back to the SVG, which is kept in step. */
      const dropScene = () => {
        scene?.dispose();
        scene = null;
        showSvg();
      };
      const useScene = (ready: Ribbon, fadeIn: boolean) => {
        scene = ready;
        canvas.removeAttribute("hidden");
        ready.activate();
        ready.progress(state.progress);
        shown.forEach((landed, index) => landed && ready.dropPin(index, 0, "none"));
        if (fadeIn) gsap.fromTo(canvas, { opacity: 0 }, { opacity: 1, duration: 0.4, onComplete: () => svg.setAttribute("hidden", "") });
        else svg.setAttribute("hidden", "");
      };

      // Phones, data-saving connections and devices without hardware WebGL get the light SVG version.
      const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
      const wantsThree = window.matchMedia("(min-width: 768px)").matches && !saveData && hardwareWebgl();
      const scenePromise: Promise<Ribbon | null> = wantsThree ? buildRibbon(canvas, box, labels, gsap, dropScene).catch(() => null) : Promise.resolve(null);
      const early = await Promise.race([scenePromise, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), SCENE_WAIT_MS))]);
      if (cancelled) {
        void scenePromise.then((late) => late?.dispose());
        return;
      }

      // Take over from the rule that kept the chart out of sight: set the starting state, then mark the intro running.
      if (path) {
        path.style.strokeDasharray = String(dash);
        path.style.strokeDashoffset = String(dash);
      }
      gsap.set(dots, { scale: 0, transformOrigin: "50% 50%" });
      if (area) gsap.set(area, { opacity: 0 });
      gsap.set(livingLabels, { opacity: 0 });
      setNumbers(0);
      figure.dataset.intro = "running";

      if (early) useScene(early, false);
      else if (early === undefined) {
        // A slow connection: the SVG draws now, and the scene replaces it wherever the drawing has got to.
        void scenePromise.then((late) => {
          if (!late) return;
          if (cancelled) late.dispose();
          else useScene(late, true);
        });
      }

      const apply = () => {
        const progress = state.progress;
        setNumbers(progress);
        scene?.progress(progress);
        if (path) path.style.strokeDashoffset = String(dash * (1 - progress));
        shown.forEach((landed, index) => {
          if (landed || progress < (scene ? scene.pinAt[index] : pinThresholds[index])) return;
          shown[index] = true;
          scene?.dropPin(index, PIN_SECONDS, PIN_EASE);
          if (dots[index]) gsap.to(dots[index], { scale: 1, duration: PIN_SECONDS, ease: PIN_EASE });
          const label = labels[index];
          if (label) gsap.to(label, { opacity: 1, duration: 0.3, delay: 0.15 });
        });
      };

      apply();
      const timeline = gsap.timeline({
        onComplete: () => {
          // The dash was measured for this width; without it the line survives a resize or a rotation.
          clearDash();
          figure.dataset.intro = "done";
        }
      });
      timeline.to(state, { progress: 1, duration: DRAW_SECONDS, ease: DRAW_EASE, onUpdate: apply }, 0.25);
      if (area) timeline.to(area, { opacity: 1, duration: 0.6 }, DRAW_SECONDS - 0.4);

      cleanups.push(() => {
        timeline.kill();
        gsap.killTweensOf([state, canvas, ...dots, ...livingLabels]);
        dropScene();
        clearDash();
        // Only what the intro set: the labels' own position (left, top) is React's and must stay.
        gsap.set([canvas, ...dots, ...(area ? [area] : []), ...livingLabels], { clearProps: "opacity,transform,transformOrigin" });
        setNumbers(1);
        figure.dataset.intro = "done";
      });
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [locale]);

  return (
    <figure ref={figureRef} data-intro="pending" className="relative m-0 min-w-0">
      {/* Without script nothing will draw the chart in, so it must not wait. */}
      <noscript>
        <style>{`[data-intro="pending"] [data-intro-part]{opacity:1!important;animation:none!important}`}</style>
      </noscript>
      <div ref={boxRef} className="tm-grid-surface relative aspect-[16/11] overflow-hidden rounded-lg border border-border bg-card">
        <div role="img" aria-label={c.label} className="absolute inset-0">
          <canvas ref={canvasRef} className="absolute inset-0 size-full" hidden aria-hidden="true" />
          <svg ref={svgRef} viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden="true">
            <line x1={VIEW.left} x2={VIEW.right} y1={yAt(0)} y2={yAt(0)} className="stroke-border" strokeDasharray="4 5" />
            <path data-area data-intro-part d={areaPath} className="fill-primary/10" />
            <path
              data-line
              data-intro-part
              d={linePath}
              fill="none"
              className="stroke-primary"
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {pins.map((pin) => (
              <circle key={pin.tag} data-pin data-intro-part cx={xAt(pin.index)} cy={yAt(equity[pin.index])} r={7} className="fill-warning" />
            ))}
          </svg>
          {pins.map((pin, index) => (
            <span
              key={pin.tag}
              ref={(element) => {
                labelRefs.current[index] = element;
              }}
              data-intro-part
              aria-hidden="true"
              dir="ltr"
              className={`pointer-events-none absolute whitespace-nowrap rounded-sm bg-warning px-2 py-0.5 text-xs font-semibold text-background ${LABEL_SIDES[index % LABEL_SIDES.length]}`}
              style={{ left: `${(xAt(pin.index) / VIEW.width) * 100}%`, top: `${((yAt(equity[pin.index]) - 10) / VIEW.height) * 100}%` }}
            >
              <span dir="auto">{c.mistakes[pin.tag]}</span>
            </span>
          ))}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label={c.net} tone="text-primary">
          <span ref={netRef}>{format.r(stats.netR)}</span>
        </Kpi>
        <Kpi label={c.drawdown} tone="text-destructive">
          <span ref={drawdownRef}>{format.loss(stats.maxDrawdownR)}</span>
        </Kpi>
        <Kpi label={c.adherence}>
          <span ref={adherenceRef}>{format.percent(stats.adherencePct)}</span>
        </Kpi>
        <Kpi label={`${c.mistakes[stats.repeated.tag]}${locale === "fa" ? "،" : ","} ${c.repeated}`} tone="text-warning" unit={c.times}>
          <span ref={repeatedRef}>{format.whole(stats.repeated.count)}</span>
        </Kpi>
      </dl>
      <figcaption className="absolute start-3 top-3 z-10 rounded-full border border-border bg-background/75 px-3 py-0.5 text-xs text-muted-foreground">{c.caption}</figcaption>
    </figure>
  );
}

/** One number under the chart. The label comes first for readers and assistive technology; it is shown under the value. */
function Kpi({ label, tone, unit, children }: { label: string; tone?: string; unit?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col-reverse rounded-md border border-border bg-card/80 px-3 py-2">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className={`m-0 text-lg font-bold leading-7 tabular-nums ${tone ?? "text-foreground"}`}>
        <bdi dir="ltr" data-intro-part>
          {children}
        </bdi>
        {unit ? (
          <>
            {" "}
            <span className="text-sm font-medium">{unit}</span>
          </>
        ) : null}
      </dd>
    </div>
  );
}

type Ribbon = {
  /** Shows the scene: from here on it draws to the canvas and moves the pin labels. */
  activate: () => void;
  progress: (value: number) => void;
  /** How far along the ribbon each pin sits (0 to 1). */
  pinAt: number[];
  dropPin: (index: number, seconds: number, ease: string) => void;
  dispose: () => void;
};

/**
 * The 3D version: the month as a ribbon over the grid floor, the area down to break-even, the drawdown gap in red and
 * a pin on each mistake. It renders on demand (while the line draws or the pointer moves) and asks for no frames in between.
 */
async function buildRibbon(canvas: HTMLCanvasElement, box: HTMLElement, labels: (HTMLSpanElement | null)[], gsap: Gsap, onContextLost: () => void): Promise<Ribbon> {
  const THREE = await import("./three-bits");
  // A software renderer would stutter through the drawing: the SVG is the better chart there.
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, failIfMajorPerformanceCaveat: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const WIDTH = 11;
  const HEIGHT = 3.6;
  const X = (index: number) => -WIDTH / 2 + (index / (equity.length - 1)) * WIDTH;
  const Y = (value: number) => -1.1 + ((value - lowest) / (highest - lowest)) * HEIGHT;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  const home = new THREE.Vector3(0.6, 1.7, 10.4);
  const lookAt = new THREE.Vector3(0, 0.75, 0);
  camera.position.copy(home);

  const teal = new THREE.Color(token("--primary", "#14ccaa"));
  const amber = new THREE.Color(token("--warning", "#f6b623"));
  const red = new THREE.Color(token("--destructive", "#e25050"));
  const disposables: { dispose: () => void }[] = [renderer];
  const keep = <T extends { dispose: () => void }>(item: T) => {
    disposables.push(item);
    return item;
  };

  const grid = new THREE.GridHelper(26, 26, 0x2b6f66, 0x243044);
  grid.position.y = Y(lowest) - 0.35;
  const gridMaterial = grid.material as import("three").Material;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.55;
  keep(grid.geometry);
  keep(gridMaterial);
  scene.add(grid);

  const curve = new THREE.CatmullRomCurve3(
    equity.map((value, index) => new THREE.Vector3(X(index), Y(value), 0)),
    false,
    "catmullrom",
    0.18
  );
  const SEGMENTS = 480;
  const RADIAL = 8;
  const tubeIndices = SEGMENTS * RADIAL * 6;
  const tube = new THREE.Mesh(keep(new THREE.TubeGeometry(curve, SEGMENTS, 0.045, RADIAL, false)), keep(new THREE.MeshBasicMaterial({ color: teal })));
  const glow = new THREE.Mesh(
    keep(new THREE.TubeGeometry(curve, SEGMENTS, 0.15, RADIAL, false)),
    keep(new THREE.MeshBasicMaterial({ color: teal, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }))
  );
  scene.add(glow, tube);

  // The ribbon is laid out by length along the curve, so everything that follows it is measured the same way:
  // the two vertical strips (line down to break-even, running peak down to the line), the head and the pins.
  const SAMPLES = 240;
  const zeroY = Y(0);
  const under: number[] = [];
  const gap: number[] = [];
  let runningPeak = -Infinity;
  for (let sample = 0; sample <= SAMPLES; sample++) {
    const point = curve.getPointAt(sample / SAMPLES);
    runningPeak = Math.max(runningPeak, point.y);
    under.push(point.x, point.y, 0, point.x, zeroY, 0);
    gap.push(point.x, runningPeak, 0, point.x, point.y, 0);
  }
  const strip = (positions: number[], color: import("three").Color, opacity: number) => {
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const index: number[] = [];
    for (let k = 0; k < SAMPLES; k++) index.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
    geometry.setIndex(index);
    return new THREE.Mesh(geometry, keep(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })));
  };
  const curtain = strip(under, teal, 0.1);
  const drawdown = strip(gap, red, 0.2);
  scene.add(curtain, drawdown);

  const zeroLine = new THREE.Line(
    keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-WIDTH / 2, zeroY, 0), new THREE.Vector3(WIDTH / 2, zeroY, 0)])),
    keep(new THREE.LineDashedMaterial({ color: 0x5b6b82, dashSize: 0.14, gapSize: 0.12 }))
  );
  zeroLine.computeLineDistances();
  scene.add(zeroLine);

  const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.11, 20, 20)), keep(new THREE.MeshBasicMaterial({ color: 0xffffff })));
  scene.add(head);

  const pinGeometry = keep(new THREE.SphereGeometry(0.13, 20, 20));
  const pinMaterial = keep(new THREE.MeshBasicMaterial({ color: amber }));
  const stemMaterial = keep(new THREE.LineBasicMaterial({ color: amber }));
  const stemGeometry = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.75, 0)]));
  const pinGroups = pins.map((pin) => {
    const group = new THREE.Group();
    group.position.set(X(pin.index), Y(equity[pin.index]), 0);
    group.add(new THREE.Mesh(pinGeometry, pinMaterial), new THREE.Line(stemGeometry, stemMaterial));
    group.scale.setScalar(0.0001);
    scene.add(group);
    return { group, top: new THREE.Vector3(X(pin.index), Y(equity[pin.index]) + 0.8, 0) };
  });
  // Each trade is one stretch of the curve's own parameter; its share of the ribbon's length is where the pin lands.
  const lengths = curve.getLengths(SEGMENTS);
  const pinAt = pins.map((pin) => lengths[Math.round((pin.index / (equity.length - 1)) * SEGMENTS)] / lengths[SEGMENTS]);

  const restingPositions = labels.map((label) => (label ? { left: label.style.left, top: label.style.top } : null));
  const pointer = { x: 0, y: 0 };
  const projected = new THREE.Vector3();
  let active = false;
  let disposed = false;
  let framesLeft = 0;
  let visible = true;
  let frame = 0;

  const render = () => {
    camera.position.x += (home.x + pointer.x * 0.55 - camera.position.x) * 0.08;
    camera.position.y += (home.y + pointer.y * 0.3 - camera.position.y) * 0.08;
    camera.lookAt(lookAt);
    renderer.render(scene, camera);
    // Until the scene is shown the labels belong to the SVG chart.
    if (!active) return;
    const rect = box.getBoundingClientRect();
    pinGroups.forEach((pin, index) => {
      const label = labels[index];
      if (!label) return;
      projected.copy(pin.top).project(camera);
      label.style.left = `${((projected.x + 1) / 2) * rect.width}px`;
      label.style.top = `${((1 - projected.y) / 2) * rect.height}px`;
    });
  };
  const tick = () => {
    frame = 0;
    if (disposed || !visible || framesLeft <= 0) return;
    framesLeft -= 1;
    render();
    if (framesLeft > 0) frame = requestAnimationFrame(tick);
  };
  /** Renders for a moment so the camera can settle, then stops asking for frames until something changes again. */
  const wake = (frames = 45) => {
    framesLeft = Math.max(framesLeft, frames);
    if (!frame && visible && !disposed) frame = requestAnimationFrame(tick);
  };

  const resize = () => {
    const rect = box.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    // Pull back far enough for the whole month to fit, with a little air on both sides.
    home.z = Math.max(10.4, (WIDTH * 1.12) / 2 / (Math.tan((camera.fov * Math.PI) / 360) * camera.aspect));
    camera.position.z = home.z;
    camera.updateProjectionMatrix();
    render();
  };
  const onMove = (event: PointerEvent) => {
    const rect = box.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    pointer.y = -((event.clientY - rect.top) / rect.height - 0.5) * 2;
    wake();
  };
  const onLeave = () => {
    pointer.x = 0;
    pointer.y = 0;
    wake();
  };
  const onLost = (event: Event) => {
    event.preventDefault();
    onContextLost();
  };
  box.addEventListener("pointermove", onMove);
  box.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("webglcontextlost", onLost);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(box);
  const viewObserver = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
    if (visible) wake(0);
  });
  viewObserver.observe(box);
  resize();

  return {
    pinAt,
    activate() {
      active = true;
      resize();
      wake();
    },
    progress(value) {
      const clamped = Math.min(1, Math.max(0, value));
      const drawn = Math.floor((tubeIndices * clamped) / 6) * 6;
      tube.geometry.setDrawRange(0, drawn);
      glow.geometry.setDrawRange(0, drawn);
      const stripDrawn = Math.floor(SAMPLES * clamped) * 6;
      curtain.geometry.setDrawRange(0, stripDrawn);
      drawdown.geometry.setDrawRange(0, stripDrawn);
      head.position.copy(curve.getPointAt(clamped));
      head.visible = clamped > 0 && clamped < 1;
      wake(2);
    },
    dropPin(index, seconds, ease) {
      const pin = pinGroups[index];
      if (!pin) return;
      if (seconds <= 0) {
        pin.group.scale.setScalar(1);
        wake(2);
      } else gsap.to(pin.group.scale, { x: 1, y: 1, z: 1, duration: seconds, ease, onUpdate: () => wake(2) });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      box.removeEventListener("pointermove", onMove);
      box.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      resizeObserver.disconnect();
      viewObserver.disconnect();
      pinGroups.forEach((pin) => gsap.killTweensOf(pin.group.scale));
      disposables.forEach((item) => item.dispose());
      labels.forEach((label, index) => {
        const resting = restingPositions[index];
        if (label && resting) {
          label.style.left = resting.left;
          label.style.top = resting.top;
        }
      });
    }
  };
}
