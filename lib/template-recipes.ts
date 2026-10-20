// riasly — per-template motion + effect recipes.
//
// The catalog in lib/backgrounds.ts stays pure data; a template's *decoration*
// is derived here instead. One place decides what drifts and what overlays sit on
// top, so adding a wallpaper never means remembering to add two more fields.
//
// A recipe now has three readers, which is why one table has to serve them all:
//  1. scripts/build-templates.mjs bakes `motion` into the 4K file itself — free
//     4K video cannot be hotlinked (Mixkit answers 403 for every tier above 720p,
//     Wallhaven only hosts stills, Pexels/Pixabay/Coverr need a key or TLS-block),
//     so the drift became something we render rather than something we fetch.
//  2. The gallery card drifts the light poster on hover, so the named motion is
//     visible before anybody downloads a frame of the real loop.
//  3. A profile still holding an old absolute hotlink keeps its CSS drift.
// `fx` layers stay CSS on purpose: baking them in would double every layer and
// would freeze out the visitor's own motion choice (lib/motion-pref.ts).

import { templates, type Template, type TemplateCategory } from "./backgrounds";

/** Transform loop rendered into the file (and drifted on the poster). */
export type MotionKey =
  | "ken"
  | "driftUp"
  | "panX"
  | "push"
  | "orbit"
  | "breathe";

/** Overlay layers, all pointer-events-none + aria-hidden, rendered in order. */
export type FxKey =
  | "grain"
  | "scanlines"
  | "leak"
  | "aurora"
  | "particles"
  | "snow"
  | "vignette"
  | "sheen"
  | "speed"
  | "glitch";

export type Recipe = { motion: MotionKey | null; fx: FxKey[] };

// A full-page background must never be re-painted per frame, so every recipe is
// transform/opacity/filter only. Durations stay long (14–34s): this is drift, not
// a screensaver. All classes below are written as full literal strings because
// Tailwind scans this file for them.
export const MOTION_CLASS: Record<MotionKey, string> = {
  ken: "animate-ken-burns",
  driftUp: "animate-fx-drift-up",
  panX: "animate-fx-pan-x",
  push: "animate-fx-push",
  orbit: "animate-fx-orbit",
  breathe: "animate-fx-breathe",
};

// Three layers is the ceiling: enough to read as "effected" while the artwork
// stays the thing you actually look at.
export const MAX_FX_LAYERS = 3;

const CATEGORY_RECIPE: Record<TemplateCategory, Recipe> = {
  Space: { motion: "orbit", fx: ["aurora", "particles"] },
  Neon: { motion: "breathe", fx: ["scanlines", "leak", "particles"] },
  Dark: { motion: "ken", fx: ["vignette", "particles", "grain"] },
  Ocean: { motion: "driftUp", fx: ["aurora", "sheen"] },
  Nature: { motion: "driftUp", fx: ["particles", "leak"] },
  Mountain: { motion: "panX", fx: ["aurora", "sheen"] },
  City: { motion: "panX", fx: ["scanlines", "leak"] },
  Minimal: { motion: "ken", fx: ["sheen", "vignette"] },
  Anime: { motion: "ken", fx: ["leak", "particles", "grain"] },
  Cinema: { motion: "panX", fx: ["grain", "vignette", "sheen"] },
  Sport: { motion: "push", fx: ["speed", "glitch", "grain"] },
};

// Portrait/tall art cannot be panned sideways without running out of coverage, so
// those few override the category default. Keyed by catalog id. The generator reads
// the same table: an override here is also a canvas hint there.
const OVERRIDES: Record<string, Partial<Recipe>> = {
  "st-m9gj8m": { motion: "driftUp" }, // 2160x4096
  "st-42381y": { motion: "driftUp" }, // 6750x10000 poster
  "st-7p9km3": { motion: "driftUp" }, // 4000x4990
  "st-l3oz7l": { motion: "driftUp" }, // 3840x2560
  "st-839kvo": { motion: "breathe", fx: ["particles", "glitch"] },
  "st-dggeej": { fx: ["speed", "sheen"] },
};

/**
 * The recipe for one catalog entry. `motion` names the drift — what the renderer
 * baked into the 4K file, what hovers on the gallery poster, and what still
 * carries an old hotlinked still. Every entry has one, because the generator has
 * to know which drift to render. A looping source clip is never drifted on top of
 * its own motion, which is why ProfileStage applies the class in its image branch
 * alone; `null` only survives for media that is not in the catalog at all.
 */
export function getRecipeFor(tpl: Template): Recipe {
  const base = CATEGORY_RECIPE[tpl.category] ?? { motion: "ken", fx: [] };
  const over = OVERRIDES[tpl.id];
  return {
    motion: over?.motion ?? base.motion,
    fx: (over?.fx ?? base.fx).slice(0, MAX_FX_LAYERS),
  };
}

/**
 * Resolve a stored bannerUrl/avatarUrl back to its catalog entry. Both the live
 * path and the external source are matched on purpose: a profile created before
 * the gallery moved to rendered files still resolves its recipe, and a template
 * an admin hid from the gallery must keep its motion for the profiles that
 * already apply it — the full catalog is searched, not the visible one.
 */
export function getTemplateByUrl(
  url: string | null | undefined
): Template | undefined {
  if (!url) return undefined;
  return templates.find(
    (tpl) =>
      tpl.url === url ||
      tpl.thumb === url ||
      tpl.source.url === url ||
      tpl.source.thumb === url
  );
}
