// riasly — visitor-side motion preference. CLIENT-ONLY (localStorage + DOM).
//
// Three states:
//  * "system" writes nothing at all and lets prefers-reduced-motion decide.
//  * "force" asks for every animation even on a machine that requests calm. This
//    is the case the switch exists for: Windows with "animation effects" off
//    reports reduce, so the template motion and effects would otherwise never be
//    seen by the person who curated them.
//  * "calm" opts out even on a machine that would happily animate.
//
// The value is applied by writing html[data-motion], which app/globals.css reads
// inside its clamp. React never renders that attribute: an attribute present in
// the DOM but not in the props is third-party territory, while an attribute React
// owns and finds changed would be a hydration mismatch it complains about.

export type MotionPref = "system" | "force" | "calm";

// Same key namespace as the gallery's favorites/recents lists. The inline boot
// script in app/layout.tsx repeats this literal — it runs before the bundle exists
// and cannot import it, so the two must be changed together.
export const MOTION_KEY = "riasly.motion";

const PREFS: MotionPref[] = ["system", "force", "calm"];

export function readMotionPref(): MotionPref {
  try {
    const raw = window.localStorage.getItem(MOTION_KEY);
    return PREFS.includes(raw as MotionPref) ? (raw as MotionPref) : "system";
  } catch {
    return "system";
  }
}

export function writeMotionPref(pref: MotionPref): void {
  try {
    // "system" is the default, so it is stored as the absence of a value: a
    // later change to what the default means can never be contradicted by an
    // old row in somebody's browser.
    if (pref === "system") window.localStorage.removeItem(MOTION_KEY);
    else window.localStorage.setItem(MOTION_KEY, pref);
  } catch {
    /* private mode / quota — the preference is a nicety, never required */
  }
}

export function applyMotionPref(pref: MotionPref): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.motion;
  else root.dataset.motion = pref;
}
