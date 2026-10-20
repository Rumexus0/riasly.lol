"use client";

import { useEffect } from "react";

import { readMotionPref } from "@/lib/motion-pref";

/**
 * The typewriter browser-tab title. When a profile is opened in its own tab
 * (the dashboard's "view profile" control does exactly that), the tab title
 * types `@handle` one character at a time, holds it, deletes it back down,
 * holds the blank, and starts over — the reference widget's effect applied to
 * `document.title`, which is the ONLY thing the browser actually paints, so
 * this has to run as a client effect, not through `next/metadata`.
 *
 * It renders nothing. Kept alive for the mount, it restores the original title
 * on unmount, pauses while the tab is hidden (a background tab should not
 * churn), and honours the visitor's calm / reduced-motion preference by
 * setting a static `@handle` title instead of starting the interval.
 */

// One character per tick. Fast enough to read as typing, slow enough that a
// 10-char name is a ~1s sweep, not a strobe.
const TICK_MS = 95;
// Holds expressed in ticks: the finished name lingers ~1.6s and the blank
// moment ~0.6s, so the loop breathes instead of flickering.
const HOLD_FULL = 17;
const HOLD_EMPTY = 6;

export default function AnimatedTabTitle({ handle }: { handle: string }) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const name = (handle ?? "").trim();
    if (!name) return;
    const base = `@${name}`;

    const original = document.title;

    // "system" defers to the OS setting; "calm" always opts out; "force" always
    // animates even on a machine asking for reduced motion.
    const pref = readMotionPref();
    const reduce =
      pref === "calm" ||
      (pref !== "force" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

    if (reduce) {
      document.title = base;
      return () => {
        document.title = original;
      };
    }

    // The whole loop is precomputed as a flat frame list — type in, hold,
    // delete, hold — so the interval only paints the next frame and the cycle
    // length is deterministic (holds are just repeated frames).
    const frames: string[] = [];
    for (let i = 1; i <= base.length; i++) frames.push(base.slice(0, i));
    for (let i = 0; i < HOLD_FULL; i++) frames.push(base);
    for (let i = base.length - 1; i >= 0; i--) frames.push(base.slice(0, i));
    for (let i = 0; i < HOLD_EMPTY; i++) frames.push("");

    let index = 0;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      // Never fight for CPU in a tab nobody is looking at; the last frame
      // stays put and the cycle simply resumes when the tab is visible again.
      if (document.visibilityState !== "visible") return;
      document.title = frames[index % frames.length];
      index += 1;
    };

    tick();
    timer = setInterval(tick, TICK_MS);

    return () => {
      if (timer) clearInterval(timer);
      document.title = original;
    };
  }, [handle]);

  return null;
}
