"use client";

import { useEffect, type RefObject } from "react";

type Gsap = typeof import("gsap").gsap;
type ScrollTriggerStatic = typeof import("gsap/ScrollTrigger").ScrollTrigger;

export type MotionSetup = (tools: { gsap: Gsap; ScrollTrigger: ScrollTriggerStatic; root: HTMLElement }) => void;

/** False when the visitor asked for less motion, or in an environment without matchMedia (tests, old browsers). */
export function motionAllowed() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Runs a GSAP setup for one landing section once it is on the page. The page is complete without it: every element
 * renders in its final state, and GSAP (loaded on demand, only here) plays it in. Everything is reverted on unmount.
 * Pass a module-level function as `setup` so the effect runs once.
 */
export function useLandingMotion(ref: RefObject<HTMLElement | null>, setup: MotionSetup) {
  useEffect(() => {
    if (!motionAllowed()) return;
    let cancelled = false;
    let revert: (() => void) | undefined;

    void (async () => {
      try {
        const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
        const root = ref.current;
        if (cancelled || !root) return;
        gsap.registerPlugin(ScrollTrigger);
        const context = gsap.context(() => setup({ gsap, ScrollTrigger, root }), root);
        revert = () => context.revert();
      } catch {
        // The library did not load: the section stays as rendered, which is its finished state.
      }
    })();

    return () => {
      cancelled = true;
      revert?.();
    };
  }, [ref, setup]);
}
