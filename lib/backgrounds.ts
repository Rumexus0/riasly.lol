// riasly — curated background template catalog (guns.lol-style gallery).
//
// Every entry describes one artwork and points at two things:
//  * `source` — where the artwork came from: a Mixkit free stock loop (720p) or a
//    Wallhaven 4K still, both HEAD-validated before being written here.
//  * `url` / `preview` / `thumb` — the files `npm run templates:build` rendered
//    into public/templates: a silent 3840x2160 loop with its drift baked into the
//    pixels, a 1280x720 proxy for the gallery hover, and a light poster frame.
//
// The rendered files win as soon as they exist; an entry whose render is still
// missing keeps serving its external source, so a half-generated gallery shows
// artwork instead of dead links. Free 4K video cannot be hotlinked (Mixkit 403s
// every tier above 720p, Wallhaven only hosts stills), which is exactly why the
// loops are generated locally rather than fetched.
//
// `url` is stored into Profile.bannerUrl / avatarUrl (VARCHAR(191)) → keep it
// <= 190 chars. `thumb` is the poster shown in the gallery grid (the grid never
// streams a wall file) and what the avatar slot gets.
//
// An `id` is permanent: HiddenTemplate rows, and each visitor's own favorites and
// recently-used lists, all key on it.

import { isVideoSrc } from "./media-kind";
import { TEMPLATE_FACTS } from "./template-facts";

export type TemplateCategory =
  | "Nature"
  | "City"
  | "Space"
  | "Dark"
  | "Neon"
  | "Anime"
  | "Cinema"
  | "Sport"
  | "Minimal"
  | "Ocean"
  | "Mountain";

// What actually renders: "video" → a looping <video>; "gif" → an animated image;
// "still" → one frame, drifted by the CSS motion layer. A rendered template is
// always "video"; "still"/"gif" only survive on an entry whose render is missing
// and on media a user pasted themselves. This is a display concern only: what
// actually renders is decided by isVideoSrc() on the URL, in exactly one place.
export type TemplateKind = "video" | "gif" | "still";

/** Where the artwork came from, and the tier of the source file itself. */
export type TemplateSource = {
  url: string;
  thumb: string;
};

export type Template = {
  id: string;
  name: string;
  /** Credit for the artwork, whatever tier is currently serving it. */
  author: string;
  category: TemplateCategory;
  tags: string[];
  kind: TemplateKind;
  url: string; // media URL (video: .mp4 | gif: .gif | still: .jpg)
  thumb: string; // poster image (gallery + <video poster> + avatar)
  /** 720p proxy of `url`, so hovering a card never pulls a wall-sized file. */
  preview?: string;
  /** The external artwork this entry was rendered from. Never rewritten. */
  source: TemplateSource;
  accent?: string;
  /** True pixels of what `url` points at, e.g. "3840x2160" — the badge prints
   *  this, so "4K" is a measured fact rather than a claim. */
  resolution?: string;
  /** Measured weight of `url` in MB, so the cost of a full-page background is
   *  visible before anyone applies it. */
  sizeMb?: number;
  /** 4K pixels rendered up from an HD source: honest about the detail. */
  upscaled?: boolean;
  /**
   * How many profiles are using this template right now. This is a MEASUREMENT,
   * not a seed value: lib/catalog.ts overwrites it on every gallery load with a
   * count read from the Profile table, and drives "Trend" sort from that. The
   * static array below carries 0 — the honest floor a client-only import can say
   * — and a gallery never renders that zero.
   */
  usage: number;
  createdAt: string; // ISO, drives "Newest" sort
};

// Served straight out of public/templates by the static handler. A public
// directory wins over app/[username], so no route change is needed; the naming
// lives here because scripts/build-templates.mjs writes exactly these files.
export const TEMPLATE_DIR = "/templates";
export const templateAssetPaths = (id: string) => ({
  url: `${TEMPLATE_DIR}/${id}.mp4`,
  preview: `${TEMPLATE_DIR}/${id}.prev.mp4`,
  thumb: `${TEMPLATE_DIR}/${id}.jpg`,
});

/** True when a measured "WxH" is UHD-class on both edges (either orientation). */
export function isUhdResolution(resolution?: string): boolean {
  const m = /^(\d+)x(\d+)$/.exec(resolution ?? "");
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return Math.min(a, b) >= 2160 && Math.max(a, b) >= 3840;
}

// Build the two source CDN URLs from one stable Mixkit video id.
function media(id: number): TemplateSource {
  return {
    url: `https://assets.mixkit.co/videos/${id}/${id}-720.mp4`,
    thumb: `https://assets.mixkit.co/videos/${id}/${id}-thumb-360-0.jpg`,
  };
}

function t(
  key: string,
  name: string,
  category: TemplateCategory,
  tags: string[],
  accent: string,
  createdAt: string,
  mediaId: number
): Seed {
  return {
    id: key,
    name,
    author: "Mixkit",
    category,
    tags,
    accent,
    createdAt,
    source: media(mediaId),
  };
}

// Wallhaven-hosted 4K source still. `slug` is the six-character wallpaper id
// exactly as the API returned it; the two-letter folder is part of the CDN's own
// layout, so the pair of URLs below is what was HEAD-checked, not something
// derived at runtime. `resolution`/`sizeMb` are what that probe reported for the
// source art, and they only show on a card until its own render has been built.
function still(
  key: string,
  name: string,
  category: TemplateCategory,
  tags: string[],
  accent: string,
  createdAt: string,
  slug: string,
  resolution: string,
  sizeMb: number
): Seed {
  const folder = slug.slice(0, 2);
  return {
    id: key,
    name,
    author: "Wallhaven",
    category,
    tags,
    accent,
    createdAt,
    resolution,
    sizeMb,
    source: {
      url: `https://w.wallhaven.cc/full/${folder}/wallhaven-${slug}.jpg`,
      thumb: `https://th.wallhaven.cc/small/${folder}/${slug}.jpg`,
    },
  };
}

// One catalog entry before its rendered files are merged in: everything a
// template *is*, minus the URLs and the tier, which depend on what exists on
// disk right now, and minus `usage`, which is never a seed value — it is
// measured against the database (lib/catalog.ts).
type Seed = Omit<
  Template,
  "url" | "thumb" | "kind" | "preview" | "upscaled" | "usage"
>;

// The literal list. Consumers use `templates` below, which resolves every entry
// against the measured facts of its rendered assets.
const SEEDS: Seed[] = [
  // ---- Space ----
  t("sp-1610", "Star Drift", "Space", ["stars", "space", "calm"], "#6366F1", "2025-01-04", 1610),
  t("sp-14185", "Deep Nebula", "Space", ["nebula", "galaxy", "purple"], "#A78BFA", "2025-01-11", 14185),
  t("sp-45020", "Event Horizon", "Space", ["blackhole", "dark", "cosmos"], "#7C3AED", "2025-02-06", 45020),
  t("sp-30889", "Nebula Flight", "Space", ["nebula", "travel", "blue"], "#3B82F6", "2025-03-02", 30889),
  // ---- Neon ----
  t("ne-35694", "Neon Tunnel", "Neon", ["neon", "tunnel", "cyber"], "#22D3EE", "2025-01-02", 35694),
  t("ne-26804", "Neon Geometry", "Neon", ["neon", "triangle", "abstract"], "#D946EF", "2025-02-14", 26804),
  t("ne-30599", "Neon Stage", "Neon", ["neon", "dark", "lines"], "#EC4899", "2025-01-20", 30599),
  t("ne-35327", "Prism Tunnel", "Neon", ["tunnel", "vj", "loop"], "#8B5CF6", "2025-03-16", 35327),
  t("ne-18151", "Neon Sparks", "Neon", ["sparkle", "neon", "dark"], "#F472B6", "2025-01-27", 18151),
  // ---- Dark ----
  t("dk-47285", "Floating Dust", "Dark", ["dust", "particles", "moody"], "#64748B", "2025-02-03", 47285),
  t("dk-18142", "Luminous Motes", "Dark", ["particles", "glow", "black"], "#818CF8", "2025-01-09", 18142),
  t("dk-4407", "White Noise", "Dark", ["particles", "mono", "soft"], "#94A3B8", "2025-03-22", 4407),
  t("dk-12496", "Smoke Veil", "Dark", ["smoke", "dark", "atmos"], "#475569", "2025-02-19", 12496),
  t("dk-3524", "Signal Glitch", "Dark", ["glitch", "retro", "vhs"], "#7C3AED", "2025-04-01", 3524),
  // ---- Abstract ----
  t("ab-4356", "Bokeh Bloom", "Dark", ["bokeh", "color", "blur"], "#D946EF", "2025-02-11", 4356),
  t("ab-19215", "Particle Waves", "Dark", ["particles", "waves", "space"], "#38BDF8", "2025-03-08", 19215),
  t("ab-47282", "Crystal Light", "Neon", ["lightleak", "blue", "soft"], "#60A5FA", "2025-04-12", 47282),
  // ---- Ocean ----
  t("oc-44818", "Ink Flow", "Ocean", ["ink", "liquid", "mono"], "#334155", "2025-02-25", 44818),
  t("oc-51726", "Blue Bubble", "Ocean", ["lava", "blue", "liquid"], "#0EA5E9", "2025-03-19", 51726),
  t("oc-51725", "Amber Lava", "Ocean", ["lavalampl", "orange", "warm"], "#F59E0B", "2025-03-28", 51725),
  // ---- Nature ----
  t("na-46898", "Full Moon Night", "Nature", ["moon", "clouds", "night"], "#CBD5E1", "2025-01-15", 46898),
  t("na-4064", "Night Fireworks", "Nature", ["fireworks", "night", "color"], "#F43F5E", "2025-02-09", 4064),
  // ---- Mountain ----
  t("mt-4040", "Aurora Lake", "Mountain", ["aurora", "mountain", "lake"], "#22D3EE", "2025-01-06", 4040),
  t("mt-4034", "Aurora Peak", "Mountain", ["aurora", "pink", "mountain"], "#F9A8D4", "2025-02-22", 4034),
  // ---- City ----
  t("ct-2026", "Night Tunnel", "City", ["city", "tunnel", "dark"], "#64748B", "2025-03-30", 2026),
  t("ct-4447", "Tokyo Neon", "City", ["tokyo", "neon", "signs"], "#EC4899", "2025-01-24", 4447),
  // ---- Minimal ----
  t("mn-28901", "Hourglass", "Minimal", ["minimal", "black", "time"], "#94A3B8", "2025-04-05", 28901),
  t("mn-4081", "Lunar Surface", "Minimal", ["moon", "mono", "calm"], "#A1A1AA", "2025-03-13", 4081),
  // ---- Anime / dreamy ----
  t("an-14165", "Dream Clouds", "Anime", ["dream", "clouds", "soft"], "#818CF8", "2025-01-18", 14165),
  t("an-30052", "Aurora Stars", "Anime", ["aurora", "stars", "anime"], "#A78BFA", "2025-02-16", 30052),
  // ---- Anime 4K (named from the wallpaper's own tags, not from the search) ----
  still("st-3k5j5v", "Rias Gremory", "Anime", ["rias gremory", "highschool dxd", "devil", "crimson"], "#DC2626", "2026-10-07", "3k5j5v", "6875x4831", 1.75),
  still("st-95jjgx", "Rias Gremory · Portrait", "Anime", ["rias gremory", "highschool dxd", "anime girls"], "#E11D48", "2026-10-07", "95jjgx", "3840x2160", 2.13),
  still("st-m9gj8m", "Akeno Himejima", "Anime", ["akeno", "himejima akeno", "highschool dxd", "purple hair"], "#A855F7", "2026-10-07", "m9gj8m", "2160x4096", 1.45),
  still("st-k7d8j7", "Tokyo Ghoul", "Anime", ["tokyo ghoul", "anime girls", "purple hair", "cyberpunk"], "#EF4444", "2026-10-07", "k7d8j7", "3840x2160", 4.06),
  still("st-w5xdzx", "Mahoraga", "Anime", ["jujutsu kaisen", "mahoraga", "wings", "dark"], "#94A3B8", "2026-10-07", "w5xdzx", "3840x2160", 1.93),
  still("st-7pq2de", "Berserk · Guts", "Anime", ["berserk", "guts", "armor", "forest", "dark"], "#78716C", "2026-10-07", "7pq2de", "3840x2160", 3.49),
  still("st-kx996m", "Edgerunners", "Anime", ["cyberpunk edgerunners", "lucyna", "space", "anime girls"], "#FACC15", "2026-10-07", "kx996m", "4093x2527", 0.93),
  still("st-ex136k", "Anime Night Street", "Anime", ["night", "neon", "city", "katakana", "street"], "#22D3EE", "2026-10-07", "ex136k", "4096x2304", 1.04),
  still("st-o3qw6m", "Motoko Kusanagi", "Anime", ["ghost in the shell", "kusanagi motoko", "anime girls", "purple hair"], "#8B5CF6", "2026-10-07", "o3qw6m", "7680x4880", 1.77),
  still("st-72r8ry", "Rainy Window", "Anime", ["rain", "window", "city lights", "anime girls"], "#60A5FA", "2026-10-07", "72r8ry", "3840x2160", 1.72),
  still("st-839kvo", "Anime Sword", "Anime", ["sword", "anime girls", "black background", "minimal"], "#F43F5E", "2026-10-07", "839kvo", "6500x3300", 0.63),
  // ---- Cinema 4K ----
  still("st-39kkpy", "Emma Watson", "Cinema", ["emma watson", "hollywood", "actress", "yellow dress"], "#F59E0B", "2026-10-07", "39kkpy", "5616x3744", 3.27),
  still("st-6k2687", "Blade Runner Noir", "Cinema", ["blade runner", "noir", "cyberpunk", "city"], "#38BDF8", "2026-10-07", "6k2687", "3840x2160", 2.71),
  still("st-83kkw2", "Blade Runner 2049", "Cinema", ["blade runner 2049", "ryan gosling", "movie poster", "red sun"], "#F97316", "2026-10-07", "83kkw2", "3840x2160", 4.57),
  still("st-42381y", "Academy Awards", "Cinema", ["oscars", "academy award", "statue", "movies"], "#EAB308", "2026-10-07", "42381y", "6750x10000", 5.27),
  still("st-47x189", "Scarface · Tony Montana", "Cinema", ["scarface", "al pacino", "tony montana", "movies"], "#DC2626", "2026-10-07", "47x189", "4542x2839", 2.93),
  still("st-w5m79p", "Al Pacino", "Cinema", ["al pacino", "scarface", "actor", "movies"], "#A3A3A3", "2026-10-07", "w5m79p", "3840x2160", 1.65),
  still("st-0pmwkp", "Marilyn Monroe", "Cinema", ["marilyn monroe", "actress", "blonde", "classic hollywood"], "#F472B6", "2026-10-07", "0pmwkp", "3840x2160", 0.95),
  still("st-4lm71y", "Inception", "Cinema", ["inception", "leonardo dicaprio", "christopher nolan", "film still"], "#64748B", "2026-10-07", "4lm71y", "6144x4096", 4.58),
  still("st-l3oz7l", "Red Dress", "Cinema", ["red dress", "model", "carpet", "portrait"], "#EF4444", "2026-10-07", "l3oz7l", "3840x2560", 4.39),
  // ---- Sport 4K ----
  still("st-kx72m7", "Lionel Messi", "Sport", ["lionel messi", "argentina", "fifa world cup", "soccer"], "#3B82F6", "2026-10-07", "kx72m7", "4096x2731", 1.57),
  still("st-p2vwje", "Cristiano Ronaldo", "Sport", ["cristiano ronaldo", "real madrid", "soccer", "football"], "#22C55E", "2026-10-07", "p2vwje", "3840x2160", 1.31),
  still("st-4gmpde", "Stadium Lights", "Sport", ["stadium", "soccer", "istanbul", "night", "floodlights"], "#0EA5E9", "2026-10-07", "4gmpde", "5000x3780", 1.77),
  still("st-eo5lm8", "Pitch & Ball", "Sport", ["soccer", "ball", "grass", "model"], "#16A34A", "2026-10-07", "eo5lm8", "4256x2832", 2.42),
  still("st-4lekqp", "Michael Jordan", "Sport", ["michael jordan", "basketball", "quote", "motivation"], "#F97316", "2026-10-07", "4lekqp", "3840x2160", 0.96),
  still("st-dggeej", "Formula 1", "Sport", ["formula 1", "f1", "logo", "minimal", "red"], "#EF4444", "2026-10-07", "dggeej", "7680x4320", 0.65),
  // ---- Dark 4K ----
  still("st-zmkwmv", "Crimson Lipstick", "Dark", ["anime", "dark hair", "red lipstick", "portrait"], "#B91C1C", "2026-10-07", "zmkwmv", "3840x2160", 5.42),
  still("st-7p9km3", "Dark Portrait", "Dark", ["anime", "long hair", "portrait", "moody"], "#475569", "2026-10-07", "7p9km3", "4000x4990", 5.72),
  still("st-jx2o3w", "Rain Bus Stop", "Dark", ["night", "rain", "city", "street", "moody"], "#334155", "2026-10-07", "jx2o3w", "5077x2885", 2.93),
  still("st-x8266v", "Red Black Pattern", "Dark", ["abstract", "red", "black", "pattern"], "#991B1B", "2026-10-07", "x8266v", "6000x4000", 5.97),
  // ---- Space 4K ----
  still("st-exyw3o", "Black Hole", "Space", ["black hole", "space", "galaxy", "science fiction"], "#7C3AED", "2026-10-07", "exyw3o", "3840x2400", 1.12),
  // ---- Neon 4K ----
  still("st-r29gz1", "Synthwave Palms", "Neon", ["synthwave", "palm trees", "neon", "night"], "#D946EF", "2026-10-07", "r29gz1", "3840x2160", 2.54),
  still("st-dgj3qj", "OutRun Grid", "Neon", ["synthwave", "vaporwave", "cyberpunk", "neon"], "#22D3EE", "2026-10-07", "dgj3qj", "3840x2160", 3.18),
  still("st-odze9l", "Hong Kong Neon", "Neon", ["vaporwave", "neon", "taxi", "city", "hong kong"], "#EC4899", "2026-10-07", "odze9l", "3872x2581", 1.24),
  still("st-zpxjjo", "Retro Vision", "Neon", ["omorphia", "retro", "colorful", "synthwave"], "#A78BFA", "2026-10-07", "zpxjjo", "3840x2160", 2.45),
];

// Measured facts of the rendered assets live in lib/template-facts.ts, written by
// `npm run templates:build` from ffprobe output. This is the single switch that
// moves a template onto its 4K render: an entry with facts serves the local loop
// (and is therefore animated by its own pixels), an entry without them still
// serves the external artwork, so the gallery works at every point of a rollout.
export const templates: Template[] = SEEDS.map((seed) => {
  const fact = TEMPLATE_FACTS[seed.id];
  if (fact) {
    return {
      ...seed,
      ...templateAssetPaths(seed.id),
      kind: "video",
      // 0 is not a claim, it is the absence of one: only the server-side merge in
      // lib/catalog.ts knows how many profiles actually use this template.
      usage: 0,
      resolution: fact.resolution,
      sizeMb: fact.sizeMb,
      upscaled: fact.upscaled,
    };
  }
  return {
    ...seed,
    url: seed.source.url,
    thumb: seed.source.thumb,
    kind: isVideoSrc(seed.source.url) ? "video" : "still",
    usage: 0,
  };
});

export const templateCategories: TemplateCategory[] = [
  "Nature",
  "City",
  "Space",
  "Dark",
  "Neon",
  "Anime",
  "Cinema",
  "Sport",
  "Minimal",
  "Ocean",
  "Mountain",
];

export function getTemplateById(id: string): Template | undefined {
  return templates.find((tpl) => tpl.id === id);
}
