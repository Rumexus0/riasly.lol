// riasly — profile style kernel. CLIENT-SAFE: no Prisma, no server-only imports.
//
// This mirrors how lib/widgets.ts splits from app/actions/widgets.ts and how
// lib/media-kind.ts splits from lib/media.ts: the pure vocabulary + the one
// normalization routine live here so BOTH sides share a single rule —
//  * the server action (app/actions/profile.ts → updateProfileStyle) calls
//    normalizeStyleFields() before writing, so nothing unvalidated reaches the DB;
//  * the server render (components/ProfileView.tsx) calls buildProfileStyle() to
//    hand ProfileStage a plain, serializable, fully-defaulted object.
//
// Every field is optional-at-rest (nullable columns / default false). A null or
// false value means "feature off", which is exactly what keeps a pre-style profile
// rendering byte-for-byte like before: ProfileStage only paints a layer when the
// value is set/true.
//
// One exception: `discordSnowflake` is READ here but never written by the style
// form. It is the Discord user id handed over by the OAuth grant, so it belongs to
// app/actions/discord.ts (and auth.ts's signIn callback) — a "save all" form that
// no longer shows the field would otherwise null somebody's connection on save.

import type { FxKey } from "./template-recipes";

// ---- User-facing effect vocabularies ----

/** Animated username treatments rendered on the profile `<h1>`. */
// One flat literal array on purpose: scripts/i18n-audit.mjs parses
// USERNAME_EFFECTS to force a dictionary key for every entry in BOTH locales.
export const USERNAME_EFFECTS = [
  "none",
  "glow",
  "neon",
  "gradient",
  "shimmer",
  "rainbow",
  "typewriter",
  "glitch",
  "flicker",
  "glowpulse",
] as const;
export type UsernameEffect = (typeof USERNAME_EFFECTS)[number];

export function isUsernameEffect(v: string | null | undefined): v is UsernameEffect {
  return !!v && (USERNAME_EFFECTS as readonly string[]).includes(v);
}

/**
 * Curated username-effect colour packages. Each is [primary, secondary, tertiary]
 * feeding --fx-accent / --fx-accent2 / --fx-accent3, chosen to stay legible on the
 * dark profile base. `id` is the i18n key suffix under
 * dashboard.customizePage.effectPresets. Client-safe (plain data).
 */
export const NAME_EFFECT_PRESETS = [
  { id: "violet", colors: ["#8b5cf6", "#22d3ee", "#d946ef"] },
  { id: "sunset", colors: ["#ff6a00", "#ee0979", "#ffd24d"] },
  { id: "emerald", colors: ["#34d399", "#22d3ee", "#a3e635"] },
  { id: "ruby", colors: ["#f43f5e", "#ec4899", "#f59e0b"] },
  { id: "gold", colors: ["#fbbf24", "#f59e0b", "#fde68a"] },
  { id: "ice", colors: ["#38bdf8", "#818cf8", "#e0f2fe"] },
  { id: "candy", colors: ["#f472b6", "#a78bfa", "#22d3ee"] },
  { id: "neon", colors: ["#22ff88", "#00e5ff", "#d946ef"] },
  { id: "mono", colors: ["#f8fafc", "#94a3b8", "#e2e8f0"] },
] as const;

/**
 * Background effects a user may pick to OVERRIDE the per-template recipe.
 * "none" forces no layer; any other entry is a real FxKey rendered by
 * EffectLayers (which already knows how to paint every key generically).
 * `snow` is added to FxKey in lib/template-recipes.ts + a `.fx-snow` rule.
 */
export const BG_EFFECT_CHOICES = [
  "none",
  "particles",
  "snow",
  "aurora",
  "glitch",
  "scanlines",
  "sheen",
  "leak",
  "vignette",
  "grain",
  "speed",
] as const satisfies readonly ("none" | FxKey)[];

export function isBgEffect(v: string | null | undefined): v is (typeof BG_EFFECT_CHOICES)[number] {
  return !!v && (BG_EFFECT_CHOICES as readonly string[]).includes(v);
}

/**
 * Horizontal position of the profile content. The DEFAULT is "center": an
 * earlier pass forced everything flush-left off a reference screenshot that was
 * only meant to show where the badges and avatar sit, not that all content hugs
 * the left edge. The owner can now pick left/center/right in the customize panel.
 */
export const PROFILE_ALIGNMENTS = ["left", "center", "right"] as const;
export type ProfileAlignment = (typeof PROFILE_ALIGNMENTS)[number];

export function isProfileAlignment(v: string | null | undefined): v is ProfileAlignment {
  return !!v && (PROFILE_ALIGNMENTS as readonly string[]).includes(v);
}

/**
 * The one place that turns an alignment into Tailwind classes. Every value is a
 * LITERAL string (never interpolated) so the JIT scanner can see it — the
 * content glob includes `lib/**`, so these classes are generated even though the
 * map lives outside the components. Cross-axis (items-*), text-align, the two
 * flex rows' main-axis (justify-*) and the block auto-margin all read from here.
 */
export const ALIGN_CLASSES: Record<
  ProfileAlignment,
  { items: string; text: string; justify: string; blockMargin: string }
> = {
  left: { items: "items-start", text: "text-left", justify: "justify-start", blockMargin: "me-auto" },
  center: { items: "items-center", text: "text-center", justify: "justify-center", blockMargin: "mx-auto" },
  right: { items: "items-end", text: "text-right", justify: "justify-end", blockMargin: "ms-auto" },
};

// ---- Primitives ----

export const HEX_RE = /^#([0-9a-fA-F]{6})$/;

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

/** A stored millisecond offset: finite and >= 0, floored, or null (unset). */
function normMs(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
}

/** A stored color column: valid `#rrggbb` or null (never an invalid string). */
function normHex(raw: string | undefined | null): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  return HEX_RE.test(s) ? s.toLowerCase() : null;
}

/**
 * The `effectColor` column stores up to three `#rrggbb` values comma-joined
 * (primary,secondary,tertiary) so multi-stop effects can be recoloured without a
 * new column. This owns the format: split on commas, validate each part with
 * normHex, drop empties, dedupe, and cap at `max`. A single legacy hex parses to
 * a one-element list, so every pre-palette profile keeps working unchanged.
 */
function normHexList(raw: string | null | undefined, max = 3): string[] {
  const s = (raw ?? "").trim();
  if (!s) return [];
  const out: string[] = [];
  for (const part of s.split(",")) {
    const hex = normHex(part);
    if (hex && !out.includes(hex)) {
      out.push(hex);
      if (out.length >= max) break;
    }
  }
  return out;
}

/** A FormData boolean arrives as "on" / "true" / "1"; anything else is false. */
function normBool(raw: string | boolean | undefined | null): boolean {
  if (typeof raw === "boolean") return raw;
  const s = (raw ?? "").trim().toLowerCase();
  return s === "on" || s === "true" || s === "1";
}

function normInt(
  raw: string | undefined | null,
  min: number,
  max: number
): number | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return clampInt(n, min, max);
}

// ---- The plain object ProfileStage consumes ----

export type ProfileStyle = {
  textColor: string | null;
  bgColor: string | null;
  iconColor: string | null;
  effectColor: string | null; // primary (== effectColors[0]); null = inherit accent
  effectColors: string[]; // parsed palette [primary, secondary, tertiary]; [] = inherit
  profileOpacity: number | null; // 0..100, null = no panel override
  profileBlur: number | null; // 0..40 px, null = no panel override
  bgEffect: string | null; // FxKey or "none"; null = derive from recipe
  usernameEffect: UsernameEffect;
  profileAlign: ProfileAlignment; // horizontal position; default "center"
  location: string | null;
  cursorUrl: string | null;
  soundUrl: string | null;
  soundStartMs: number | null; // ms into the track to begin; null = from the top
  soundEndMs: number | null; // ms to wrap back to the start; null = to the end
  bgClipStartMs: number | null; // ms into the background video to begin; null = whole clip
  bgClipEndMs: number | null; // ms to wrap back to bgClipStartMs; null = to the end
  discordSnowflake: string | null;
  profileGradient: boolean;
  monochromeIcons: boolean;
  animatedTitle: boolean;
  boxColors: boolean;
  soundEnabled: boolean;
  discordAvatarDecoration: boolean;
  glitterName: boolean;
  glitterSocials: boolean;
  glitterBadges: boolean;
  // Discord presence-card config ("Profil Widget'ı"), consumed by ProfileStage.
  // Presence is bot-only (only members of our server), so there is no source pin.
  // (discordCardShowGuild is gone: the server chip was removed from the card —
  // the clan chip already names the owner's identity server.)
  discordCardEnabled: boolean;
  discordCardShowBadges: boolean;
  discordCardIdleText: string | null;
  // Master switch for the whole widget hub. When false, ProfileView hands
  // ProfileStage an empty widget list AND ProfileStage hides the Discord
  // presence card too. Defaults true so a pre-modal profile renders unchanged.
  widgetsEnabled: boolean;
};

/** The DB shape (all nullable) buildProfileStyle reads — a Profile row subset. */
type StyleColumns = Partial<{
  textColor: string | null;
  bgColor: string | null;
  iconColor: string | null;
  effectColor: string | null;
  profileOpacity: number | null;
  profileBlur: number | null;
  bgEffect: string | null;
  usernameEffect: string | null;
  profileAlign: string | null;
  location: string | null;
  cursorUrl: string | null;
  soundUrl: string | null;
  soundStartMs: number | null;
  soundEndMs: number | null;
  bgClipStartMs: number | null;
  bgClipEndMs: number | null;
  discordSnowflake: string | null;
  profileGradient: boolean | null;
  monochromeIcons: boolean | null;
  animatedTitle: boolean | null;
  boxColors: boolean | null;
  soundEnabled: boolean | null;
  discordAvatarDecoration: boolean | null;
  glitterName: boolean | null;
  glitterSocials: boolean | null;
  glitterBadges: boolean | null;
  discordCardEnabled: boolean | null;
  discordCardShowBadges: boolean | null;
  discordCardIdleText: string | null;
  widgetsEnabled: boolean | null;
}>;

/** Everything off — the exact look of a profile created before the style system. */
export const DEFAULT_STYLE: ProfileStyle = {
  textColor: null,
  bgColor: null,
  iconColor: null,
  effectColor: null,
  effectColors: [],
  profileOpacity: null,
  profileBlur: null,
  bgEffect: null,
  usernameEffect: "none",
  profileAlign: "center",
  location: null,
  cursorUrl: null,
  soundUrl: null,
  soundStartMs: null,
  soundEndMs: null,
  bgClipStartMs: null,
  bgClipEndMs: null,
  discordSnowflake: null,
  profileGradient: false,
  monochromeIcons: false,
  animatedTitle: false,
  boxColors: false,
  soundEnabled: false,
  discordAvatarDecoration: false,
  glitterName: false,
  glitterSocials: false,
  glitterBadges: false,
  discordCardEnabled: true,
  discordCardShowBadges: true,
  discordCardIdleText: null,
  widgetsEnabled: true,
};

/**
 * The frosted box an owner sees before ever touching the panel sliders. Flipping
 * the house default later is a one-line change here. `blur: 0` is deliberate:
 * blur(0px) would still create a backdrop root and re-blur the autoplaying
 * background every frame, and the reference panel is a flat translucent box.
 */
export const DEFAULT_PANEL = { opacity: 45, blur: 0 } as const; // opacity 0..100, blur 0..40

/**
 * Turn a Profile row (or nothing) into a fully-defaulted ProfileStyle. Never
 * throws and never leaks an unknown enum value to the client: effect keys are
 * re-checked, colors are re-validated against the hex rule, so a hand-edited or
 * legacy row cannot smuggle markup or a bad value into the DOM.
 */
export function buildProfileStyle(row: StyleColumns | null | undefined): ProfileStyle {
  if (!row) return DEFAULT_STYLE;
  const effectColors = normHexList(row.effectColor);
  // A sound range is only meaningful when it has positive length. Each bound can
  // stand alone (start-only loops the tail, end-only loops the head); an end that
  // does not sit after its start is dropped so the track simply plays whole.
  const soundStartMs = normMs(row.soundStartMs);
  const soundEndMsRaw = normMs(row.soundEndMs);
  const soundEndMs =
    soundEndMsRaw != null && soundStartMs != null && soundEndMsRaw <= soundStartMs
      ? null
      : soundEndMsRaw;
  // Background video clip bounds, same rule as the sound trim: each bound can
  // stand alone (start-only loops from there to the end, end-only loops the head);
  // an end that does not sit after its start is dropped so the clip plays whole.
  const bgClipStartMs = normMs(row.bgClipStartMs);
  const bgClipEndMsRaw = normMs(row.bgClipEndMs);
  const bgClipEndMs =
    bgClipEndMsRaw != null && bgClipStartMs != null && bgClipEndMsRaw <= bgClipStartMs
      ? null
      : bgClipEndMsRaw;
  return {
    textColor: normHex(row.textColor),
    bgColor: normHex(row.bgColor),
    iconColor: normHex(row.iconColor),
    effectColor: effectColors[0] ?? null,
    effectColors,
    profileOpacity:
      typeof row.profileOpacity === "number"
        ? clampInt(row.profileOpacity, 0, 100)
        : null,
    profileBlur:
      typeof row.profileBlur === "number" ? clampInt(row.profileBlur, 0, 40) : null,
    bgEffect: isBgEffect(row.bgEffect) ? row.bgEffect : null,
    usernameEffect: isUsernameEffect(row.usernameEffect) ? row.usernameEffect : "none",
    profileAlign: isProfileAlignment(row.profileAlign) ? row.profileAlign : "center",
    location: normText(row.location, 60),
    cursorUrl: row.cursorUrl || null,
    soundUrl: row.soundUrl || null,
    soundStartMs,
    soundEndMs,
    bgClipStartMs,
    bgClipEndMs,
    discordSnowflake: normSnowflake(row.discordSnowflake),
    profileGradient: !!row.profileGradient,
    monochromeIcons: !!row.monochromeIcons,
    animatedTitle: !!row.animatedTitle,
    boxColors: !!row.boxColors,
    soundEnabled: !!row.soundEnabled,
    discordAvatarDecoration: !!row.discordAvatarDecoration,
    // Legacy "sparkle" username effect was removed (it duplicated the .glitter
    // star field but was driven by the effect picker, not the glitter toggle).
    // Map any stored "sparkle" onto glitterName so the look survives, but now the
    // toggle is the single authoritative sparkle source the owner can switch off.
    glitterName: !!row.glitterName || row.usernameEffect === "sparkle",
    glitterSocials: !!row.glitterSocials,
    glitterBadges: !!row.glitterBadges,
    // The two booleans default to the historical look: legacy rows (and any row
    // that predates the widget columns) must keep the card AND its badges visible,
    // so an unset enabled/showBadges reads true, not false.
    discordCardEnabled: row.discordCardEnabled ?? true,
    discordCardShowBadges: row.discordCardShowBadges ?? true,
    discordCardIdleText: normText(row.discordCardIdleText, 80),
    // The master switch defaults to true ("on") so a legacy row that predates
    // the column still shows every widget, matching the pre-modal behaviour.
    widgetsEnabled: row.widgetsEnabled ?? true,
  };
}

// The Discord user id the card keys on: 15-20 digits, nothing else. It arrives
// from the OAuth provider account id, never from a text input any more.
function normSnowflake(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  return /^[0-9]{15,20}$/.test(s) ? s : null;
}

// Strip control chars + collapse to a bounded single-line label.
function normText(raw: string | null | undefined, max: number): string | null {
  const s = (raw ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
  return s || null;
}

/** Loose all-string input straight off FormData (via the action's str() helper). */
export type StyleRaw = {
  bio?: string;
  accentColor?: string;
  textColor?: string;
  bgColor?: string;
  iconColor?: string;
  effectColor?: string;
  effectColor2?: string;
  effectColor3?: string;
  profileOpacity?: string;
  profileBlur?: string;
  bgEffect?: string;
  usernameEffect?: string;
  profileAlign?: string;
  location?: string;
  profileGradient?: string;
  monochromeIcons?: string;
  animatedTitle?: string;
  boxColors?: string;
  soundEnabled?: string;
  discordAvatarDecoration?: string;
  glitterName?: string;
  glitterSocials?: string;
  glitterBadges?: string;
};

/**
 * The Prisma `data` object updateProfileStyle writes. It is a FULL set (every
 * column present) because the customize form always submits every field — so
 * clearing a color genuinely nulls it instead of leaving a stale value behind.
 * Media slots (avatar/banner/cursor/sound) are deliberately NOT here: those are
 * owned by their own immediate-upload actions, never by this form. Neither is
 * discordSnowflake: that is an OAuth credential reference, not a style choice.
 */
export type StyleFields = {
  accentColor: string;
  textColor: string | null;
  bgColor: string | null;
  iconColor: string | null;
  effectColor: string | null;
  profileOpacity: number | null;
  profileBlur: number | null;
  bgEffect: string | null;
  usernameEffect: string | null;
  profileAlign: string;
  location: string | null;
  profileGradient: boolean;
  monochromeIcons: boolean;
  animatedTitle: boolean;
  boxColors: boolean;
  soundEnabled: boolean;
  discordAvatarDecoration: boolean;
  glitterName: boolean;
  glitterSocials: boolean;
  glitterBadges: boolean;
};

export function normalizeStyleFields(raw: StyleRaw): StyleFields {
  const accent = normHex(raw.accentColor) ?? "#8B5CF6";
  const ue = isUsernameEffect(raw.usernameEffect) ? raw.usernameEffect : "none";
  return {
    accentColor: accent,
    textColor: normHex(raw.textColor),
    bgColor: normHex(raw.bgColor),
    iconColor: normHex(raw.iconColor),
    // Palette: join the up-to-three hexes back into the single stored column.
    effectColor:
      normHexList(
        [raw.effectColor, raw.effectColor2, raw.effectColor3]
          .filter(Boolean)
          .join(",")
      ).join(",") || null,
    profileOpacity: normInt(raw.profileOpacity, 0, 100),
    profileBlur: normInt(raw.profileBlur, 0, 40),
    bgEffect: isBgEffect(raw.bgEffect) ? raw.bgEffect : null,
    // "none" is stored as null so the column reads as "unset", not a magic string.
    usernameEffect: ue === "none" ? null : ue,
    profileAlign: isProfileAlignment(raw.profileAlign) ? raw.profileAlign : "center",
    location: normText(raw.location, 60),
    profileGradient: normBool(raw.profileGradient),
    monochromeIcons: normBool(raw.monochromeIcons),
    animatedTitle: normBool(raw.animatedTitle),
    boxColors: normBool(raw.boxColors),
    soundEnabled: normBool(raw.soundEnabled),
    discordAvatarDecoration: normBool(raw.discordAvatarDecoration),
    glitterName: normBool(raw.glitterName) || raw.usernameEffect === "sparkle",
    glitterSocials: normBool(raw.glitterSocials),
    glitterBadges: normBool(raw.glitterBadges),
  };
}

// ---- Discord presence-widget ("Profil Widget'ı") write path ----
//
// Deliberately SEPARATE from StyleFields/normalizeStyleFields. updateProfileStyle
// writes a FULL set of style columns, so if these lived in StyleFields every
// StyleForm save would null whichever widget field that form happened not to send.
// Keeping them in their own raw→fields pair lets a focused action write ONLY the
// widget columns while StyleForm never touches them (and vice-versa): the two
// upserts hit disjoint sets of columns.

/** Loose all-string input straight off the widget modal's FormData. */
export type DiscordWidgetRaw = Partial<{
  discordCardEnabled: string;
  discordCardShowBadges: string;
  discordCardIdleText: string;
}>;

/** The Prisma `data` object updateDiscordWidget writes (three columns, full set). */
export type DiscordWidgetFields = {
  discordCardEnabled: boolean;
  discordCardShowBadges: boolean;
  discordCardIdleText: string | null;
};

export function normalizeDiscordWidgetFields(
  raw: DiscordWidgetRaw
): DiscordWidgetFields {
  return {
    discordCardEnabled: normBool(raw.discordCardEnabled),
    discordCardShowBadges: normBool(raw.discordCardShowBadges),
    discordCardIdleText: normText(raw.discordCardIdleText, 80),
  };
}
