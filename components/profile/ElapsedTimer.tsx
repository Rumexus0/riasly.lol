"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * The Discord-style "7:20:29" readout under an activity.
 *
 * It is a leaf on purpose: a 1 Hz clock must not re-render the identity card or
 * the page behind it, so the interval and its state live entirely in this span.
 *
 * Hydration: SSR and the first client paint draw the PLACEHOLDER (no `Date.now()`
 * during render); the real digits are installed from `useEffect`, and the activity
 * data itself only arrives after a client fetch, so the server markup never
 * contains a time.
 *
 * Motion contract: a clock is content, not animation, so the global reduced-motion
 * clamp does not (and must not) freeze it — but under `prefers-reduced-motion` or
 * `data-motion="calm"` we stop ticking and print a static elapsed `H:MM:SS` value
 * (computed once from the wall clock), which is the calm equivalent of a live
 * counter and still shows how long the activity has run. The interval also stops
 * while the tab is hidden; a background tab is nobody's stopwatch.
 */
const PLACEHOLDER = "\u00A0\u00A0:--:--";

export default function ElapsedTimer({ startMs }: { startMs: number | null }) {
  const t = useTranslations("profile.discord");
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (startMs == null) return;

    const calm = () =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.motion === "calm";

    const draw = () => {
      // Recomputed from the wall clock every tick, never accumulated, so a
      // throttled or skipped interval cannot drift the readout. Under a calm
      // motion pref this runs once (no interval) and the elapsed value stays put.
      const s = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      const h = Math.floor(s / 3600);
      const m = Math.floor(s / 60) % 60;
      setText(`${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
    };

    let id: ReturnType<typeof setInterval> | null = null;
    const sync = () => {
      draw();
      const want = !calm() && document.visibilityState === "visible";
      if (want && id == null) id = setInterval(draw, 1000);
      if (!want && id != null) {
        clearInterval(id);
        id = null;
      }
    };

    sync();
    const onVisibility = () => sync();
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => sync();
    // `data-motion` is written by MotionPrefSwitch / the effect picker, neither of
    // which fires an event — the attribute observer is the only honest listener.
    const mo = new MutationObserver(onMotion);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    document.addEventListener("visibilitychange", onVisibility);
    if (mq.addEventListener) mq.addEventListener("change", onMotion);

    return () => {
      if (id != null) clearInterval(id);
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (mq.removeEventListener) mq.removeEventListener("change", onMotion);
    };
  }, [startMs, t]);

  if (startMs == null) return null;

  return (
    <span
      className="inline-flex items-center gap-1 text-mutedtext/70"
      aria-label={t("elapsed")}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M7 8h10a4.5 4.5 0 014.5 4.5v1A3.5 3.5 0 0118 17l-1.6-2H7.6L6 17a3.5 3.5 0 01-3.5-3.5v-1A4.5 4.5 0 017 8z" />
        <path d="M8 11v2.4M6.8 12.2h2.4" />
        <path d="M15.4 11.4h.01M17.4 13h.01" />
      </svg>
      <span className="inline-block min-w-[6ch] font-mono text-[11px] tabular-nums">
        {text ?? PLACEHOLDER}
      </span>
    </span>
  );
}
