// riasly — badge catalog.
//
// Definitions live in code (exactly like lib/backgrounds.ts keeps the template
// gallery out of the database); only *grants* are persisted, in UserBadge.
// Every rule below is computable from data we already own — no external claims,
// no Discord-server roles, nothing that needs a third-party API to verify.
//
// This module must stay free of server-only imports (no Prisma): the dashboard
// and the public profile render badge visuals from it in client components.
// Metric *fetching* lives in lib/badge-sync.ts.

export type BadgeTone =
  | "violet"
  | "fuchsia"
  | "cyan"
  | "amber"
  | "emerald"
  | "rose";

export type BadgeIconName =
  | "crown"
  | "shield"
  | "check"
  | "layers"
  | "link"
  | "palette"
  | "sparkles"
  | "upload"
  | "box"
  | "eye"
  | "flame"
  | "download"
  | "ticket"
  | "medal"
  | "lock";

/** One snapshot of everything a rule can look at, computed server-side. */
export type BadgeMetrics = {
  accountDays: number;
  joinRank: number; // 1 = first account ever created
  socials: number; // distinct connected platforms
  links: number; // bio links
  files: number; // public hosted files
  downloads: number; // total downloads across the account
  views: number; // profile views
  rank: number; // 1-based position by view count
  hasBio: boolean;
  hasAvatar: boolean;
  customAccent: boolean;
  templateBg: boolean; // a gallery template is applied
  ownBg: boolean; // a self-uploaded file is the background
  redeemed: boolean; // has used a redeem code
  completeParts: number; // 0..4 (bio, avatar, social, link)
};

export type BadgeDef = {
  /** Dictionary lookup: badges.items.<key>.name / .desc */
  key: string;
  tone: BadgeTone;
  icon: BadgeIconName;
  /** Value of `current` at which the badge is earned. */
  target: number;
  /** Progress signal — already clamped by badgeProgress, may exceed target. */
  current: (m: BadgeMetrics) => number;
};

const bool = (v: boolean) => (v ? 1 : 0);

export const BADGES: BadgeDef[] = [
  {
    key: "early",
    tone: "amber",
    icon: "crown",
    target: 50,
    // Rank 1 reads as 50/50, rank 50 as 1/50, and nothing past the window.
    current: (m) => Math.max(0, 51 - m.joinRank),
  },
  {
    key: "veteran",
    tone: "violet",
    icon: "shield",
    target: 30,
    current: (m) => m.accountDays,
  },
  {
    key: "complete",
    tone: "fuchsia",
    icon: "check",
    target: 4,
    current: (m) => m.completeParts,
  },
  {
    key: "collector",
    tone: "cyan",
    icon: "layers",
    target: 3,
    current: (m) => m.socials,
  },
  {
    key: "linker",
    tone: "emerald",
    icon: "link",
    target: 5,
    current: (m) => m.links,
  },
  {
    key: "stylist",
    tone: "rose",
    icon: "palette",
    target: 1,
    current: (m) => bool(m.customAccent),
  },
  {
    key: "curator",
    tone: "violet",
    icon: "sparkles",
    target: 1,
    current: (m) => bool(m.templateBg),
  },
  {
    key: "ownbackground",
    tone: "fuchsia",
    icon: "upload",
    target: 1,
    current: (m) => bool(m.ownBg),
  },
  {
    key: "uploader",
    tone: "cyan",
    icon: "box",
    target: 1,
    current: (m) => m.files,
  },
  {
    key: "views1k",
    tone: "amber",
    icon: "eye",
    target: 1000,
    current: (m) => m.views,
  },
  {
    key: "views10k",
    tone: "amber",
    icon: "flame",
    target: 10000,
    current: (m) => m.views,
  },
  {
    key: "downloads100",
    tone: "emerald",
    icon: "download",
    target: 100,
    current: (m) => m.downloads,
  },
  {
    key: "top20",
    tone: "violet",
    icon: "medal",
    target: 20,
    // An account with zero views is never "charted", however few users exist.
    current: (m) => (m.views > 0 ? Math.max(0, 21 - m.rank) : 0),
  },
  {
    key: "redeemer",
    tone: "rose",
    icon: "ticket",
    target: 1,
    current: (m) => bool(m.redeemed),
  },
];

export const BADGE_KEYS: string[] = BADGES.map((b) => b.key);
export const BADGE_COUNT = BADGES.length;

const BY_KEY = new Map(BADGES.map((b) => [b.key, b]));

/** Unknown keys (a renamed badge, a stale row) resolve to undefined, never throw. */
export function getBadge(key: string): BadgeDef | undefined {
  return BY_KEY.get(key);
}

export function isBadgeKey(key: string): boolean {
  return BY_KEY.has(key);
}

/**
 * Parse the Profile.badgeColors JSON blob into a validated map. Every reader
 * (the public profile render, the badges page) goes through here: corrupt JSON,
 * arrays or non-#rrggbb values drop silently, so callers always get a usable —
 * possibly empty — map and a bad row can never break a page.
 */
export function parseBadgeColors(
  raw: string | null | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return out;
    }
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) {
        out[k] = v.toLowerCase();
      }
    }
  } catch {
    // Treat as "no tints at all" — the catalog tones stand.
  }
  return out;
}

export type BadgeProgressInfo = {
  current: number;
  target: number;
  ratio: number; // 0..1
  earned: boolean;
};

export function badgeProgress(def: BadgeDef, m: BadgeMetrics): BadgeProgressInfo {
  const raw = def.current(m);
  const current = Math.max(0, raw);
  return {
    current,
    target: def.target,
    ratio: Math.max(0, Math.min(1, raw / def.target)),
    earned: current >= def.target,
  };
}

export function earnedBadgeKeys(m: BadgeMetrics): string[] {
  return BADGES.filter((b) => badgeProgress(b, m).earned).map((b) => b.key);
}

// Full literal class strings on purpose: Tailwind scans source text, so any
// runtime concatenation here would silently drop the styles from the build.
export const badgeToneClass: Record<BadgeTone, string> = {
  violet: "text-plumborder bg-plum/25 ring-plumborder/40",
  fuchsia: "text-accent bg-accent/15 ring-accent/40",
  cyan: "text-cyan-300 bg-cyan-400/10 ring-cyan-400/40",
  amber: "text-amber-300 bg-amber-400/10 ring-amber-400/40",
  emerald: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/40",
  rose: "text-rose-300 bg-rose-400/10 ring-rose-400/40",
};

export const badgeBarClass: Record<BadgeTone, string> = {
  violet: "bg-plumborder",
  fuchsia: "bg-accent",
  cyan: "bg-cyan-400",
  amber: "bg-amber-400",
  emerald: "bg-emerald-400",
  rose: "bg-rose-400",
};

/**
 * Text colour only — the default tint for the bare glyphs in the profile's
 * badge pill, where the shared container carries the frame and a per-glyph
 * background plate would break the Discord-like look. Same literal-string rule
 * as the maps above.
 */
export const badgeTintClass: Record<BadgeTone, string> = {
  violet: "text-plumborder",
  fuchsia: "text-accent",
  cyan: "text-cyan-300",
  amber: "text-amber-300",
  emerald: "text-emerald-300",
  rose: "text-rose-300",
};

/** The accent the dashboard seeds when the user never picked one. */
export const DEFAULT_ACCENT = "#8B5CF6";

/** Tiles shown before the public strip collapses into a +N chip. */
export const BADGE_STRIP_CAP = 6;

/**
 * Glyphs the profile card can carry on the name line. Tighter than the strip cap
 * because the card shares that row with the display name, the Discord marks and
 * the presence text — six tiles would push the name into truncation.
 */
export const BADGE_CARD_CAP = 4;
