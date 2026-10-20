// riasly — widget kernel. CLIENT-SAFE: no Prisma, no server-only imports.
//
// This mirrors how lib/media-kind.ts is split from lib/media.ts: the pure
// classification/validation vocabulary lives here so a client component
// (WidgetRenderer) can render a stored widget without pulling the database
// layer into the browser bundle. The database work is app/actions/widgets.ts.
//
// SECURITY CONTRACT (the whole point of this file): a user never supplies HTML,
// JS or a raw iframe URL. They pick a type and paste a source link; resolveEmbed
// parses that link against a FIXED, known set of providers and returns a
// CANONICAL embed URL whose origin is provably one of EMBED_ORIGINS. The action
// stores the derived value, not the input. WidgetRenderer re-checks the origin
// before ever writing a src, so a tampered or legacy row can only point at a
// allowlisted host. Nothing user-typed reaches the DOM as markup.

import { isOwnMediaPath } from "./media-kind";

export const WIDGET_TYPES = [
  "youtube",
  "spotify",
  "soundcloud",
  "twitch",
  "discord",
  "text",
  "image",
  "link",
  // ---- Widget-hub additions. The reference modal shows these as its own tabs;
  // each has a matching `dashboard.widgetsPage.types.<key>` + `.hint.<key>` pair
  // in both dictionaries, and scripts/i18n-audit.mjs proves parity via the
  // WIDGET_TYPES dynamic resolver. ----
  "discord_status",
  "discord_server",
  "telegram",
  "roblox",
  "github",
  "cs",
  "lastfm",
  "weather",
  "timezone",
] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];

export function isWidgetType(v: string): v is WidgetType {
  return (WIDGET_TYPES as readonly string[]).includes(v);
}

/**
 * Types a FREE plan cannot add. The kernel owns the list so the action, the
 * modal and any future pricing page all read the same source of truth. A user
 * who already had one of these before going back to FREE keeps the row (we
 * never retroactively delete), but the modal shows a diamond and the action
 * rejects new adds with `error: "premium"`.
 *
 * Policy: only the two Discord widgets stay free — `discord_status` (presence)
 * and `discord_server` (invite). Every other type, including the legacy
 * text/image/link/discord rows, is Premium.
 */
export const PREMIUM_WIDGET_TYPES: ReadonlySet<WidgetType> = new Set<WidgetType>([
  "youtube",
  "spotify",
  "soundcloud",
  "twitch",
  "discord",
  "text",
  "image",
  "link",
  "telegram",
  "roblox",
  "github",
  "cs",
  "lastfm",
  "weather",
  "timezone",
]);

/**
 * The curated tab order rendered by the widget-hub modal grid (reference image
 * 2). This is a strict subset of WIDGET_TYPES: the modal shows these eleven, while
 * WIDGET_TYPES stays the full renderable superset so the renderer + i18n audit
 * still cover legacy text/image/link/discord/twitch/soundcloud rows that exist in
 * the database and remain addable on the /dashboard/widgets page.
 */
export const WIDGET_HUB_TYPES = [
  "discord_status",
  "youtube",
  "spotify",
  "discord_server",
  "telegram",
  "roblox",
  "github",
  "cs",
  "lastfm",
  "weather",
  "timezone",
] as const satisfies readonly WidgetType[];

/**
 * Which settings panel the modal shows when a type is picked:
 *  - "embed"   → one URL field (iframe providers).
 *  - "card"    → one URL field (external-link cards).
 *  - "presence"→ the four discordCard* fields (writes to Profile, not Widget).
 *  - "system"  → a small purpose-built control (weather city, timezone select).
 *  - "text"    → a multi-line note.
 */
export type WidgetCategory = "embed" | "card" | "presence" | "system" | "text";
export const WIDGET_CATEGORY: Record<WidgetType, WidgetCategory> = {
  youtube: "embed",
  spotify: "embed",
  soundcloud: "embed",
  twitch: "embed",
  discord: "card",
  text: "text",
  image: "card",
  link: "card",
  discord_status: "presence",
  discord_server: "card",
  telegram: "card",
  roblox: "card",
  github: "card",
  cs: "card",
  lastfm: "card",
  weather: "system",
  timezone: "system",
};

// A short, human-typeable 6-digit code — the plan's ~40 common zones. Kept
// inline (not fetched from Intl) so the client picker renders without a
// hydration-risky environmentData call and the modal can be opened offline.
export const TIMEZONE_CHOICES = [
  "UTC",
  "Europe/Istanbul",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Moscow",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "America/Buenos_Aires",
  "Asia/Dubai",
  "Asia/Tehran",
  "Asia/Karachi",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Jakarta",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Perth",
  "Pacific/Auckland",
  "Africa/Cairo",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Asia/Almaty",
  "Asia/Baku",
  "Asia/Tbilisi",
  "Asia/Yerevan",
] as const;
export type TimezoneChoice = (typeof TIMEZONE_CHOICES)[number];

export function isTimezoneChoice(v: string): v is TimezoneChoice {
  return (TIMEZONE_CHOICES as readonly string[]).includes(v);
}

/** The plain, serializable shape ProfileView hands to the client renderer. */
export type StoredWidget = {
  id: string;
  type: WidgetType;
  label: string;
  sourceUrl: string;
  extra: string | null;
};

/**
 * How each widget renders on the page. The client needs only this map plus the
 * stored canonical values — never the full adapter — so keep it total.
 */
export const WIDGET_KIND: Record<WidgetType, "iframe" | "card" | "image" | "text" | "presence" | "weather" | "timezone"> = {
  youtube: "iframe",
  spotify: "iframe",
  soundcloud: "iframe",
  twitch: "iframe",
  discord: "card",
  text: "text",
  image: "image",
  link: "card",
  discord_status: "presence",
  discord_server: "card",
  telegram: "card",
  roblox: "card",
  github: "card",
  cs: "card",
  lastfm: "card",
  weather: "weather",
  timezone: "timezone",
};

export type ResolvedEmbed =
  | {
      ok: true;
      kind: "iframe" | "card" | "image" | "text" | "presence" | "weather" | "timezone";
      /** The canonical, allowlisted value stored in Widget.sourceUrl ("" for text/presence/weather/timezone). */
      embedUrl: string;
      /** Only for text/weather/timezone/presence widgets: the sanitized bit kept in Widget.extra. */
      extra?: string;
    }
  | { ok: false };

// Origins an iframe/image src may ever use. Whitelist, not blacklist: anything
// not exactly here is rejected.
const EMBED_ORIGINS = new Set([
  "https://www.youtube-nocookie.com",
  "https://open.spotify.com",
  "https://w.soundcloud.com",
  "https://player.twitch.tv",
]);

// Direct-image hosts allowed for an `image` widget. Own uploads bypass this (they
// match isOwnMediaPath) and are served same-origin from /api/media.
const IMAGE_HOSTS = new Set([
  "i.imgur.com",
  "media.tenor.com",
  "i.giphy.com",
  "media.giphy.com",
  "res.cloudinary.com",
]);

/** Defense-in-depth for the renderer: is this stored src on a host we allow? */
export function isAllowedEmbedSrc(url: string): boolean {
  if (!url) return false;
  if (isOwnMediaPath(url)) return true; // same-origin uploaded image
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (EMBED_ORIGINS.has(u.origin)) return true;
    if (IMAGE_HOSTS.has(u.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * A card widget is an external link (opens in a new tab), never an iframe. The
 * threat model is different: we only have to reject javascript:/data:/vbscript:
 * URIs and non-http(s) protocols, not enforce an origin allowlist. Any https
 * URL the resolver produced is safe to hand to an <a href>.
 */
export function isAllowedCardHref(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Parse one widget's raw source into a canonical, safe embed. Returns ok:false
 * for anything that cannot be proven to be exactly one provider's resource —
 * including javascript:/data: URIs, off-allowlist hosts and over-long input.
 */
export function resolveEmbed(
  type: WidgetType,
  rawInput: string,
  origin: string
): ResolvedEmbed {
  // Hard ceiling first: a source this long is never a legit link and would blow
  // past the VARCHAR(190) column no matter which branch it later takes.
  const input = rawInput.trim();
  if (!input || input.length > 300) return { ok: false };

  switch (type) {
    case "youtube":
      return resolveYoutube(input);
    case "spotify":
      return resolveSpotify(input);
    case "soundcloud":
      return resolveSoundcloud(input);
    case "twitch":
      return resolveTwitch(input, origin);
    case "discord":
      return resolveDiscord(input);
    case "image":
      return resolveImage(input);
    case "link":
      return resolveLink(input);
    case "text":
      return resolveText(input);
    case "discord_server":
      return resolveDiscord(input); // same invite-code shape
    case "telegram":
      return resolveTelegram(input);
    case "github":
      return resolveGithub(input);
    case "cs":
      return resolveCs(input);
    case "roblox":
      return resolveRoblox(input);
    case "lastfm":
      return resolveLastfm(input);
    case "weather":
      return resolveWeather(input);
    case "timezone":
      return resolveTimezone(input);
    case "discord_status":
      // Metadata-only row: the actual settings live on Profile.discordCard*.
      // sourceUrl stays "" and extra is a fixed sentinel so a stray edit cannot
      // smuggle a URL into a presence row.
      return { ok: true, kind: "presence", embedUrl: "", extra: "self" };
    default:
      return { ok: false };
  }
}

// 11-char video id, or a playlist id (PL / a mix, 18-50 alnum+_-).
function resolveYoutube(input: string): ResolvedEmbed {
  let id: string | null = null;
  let list: string | null = null;
  try {
    const u = new URL(input);
    if (u.hostname === "youtu.be") {
      id = u.pathname.slice(1) || null;
    } else if (
      u.hostname === "www.youtube.com" ||
      u.hostname === "youtube.com" ||
      u.hostname === "m.youtube.com"
    ) {
      if (u.searchParams.get("v")) id = u.searchParams.get("v");
      else if (u.pathname.startsWith("/playlist")) list = u.searchParams.get("list");
      else if (u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2] ?? null;
      else if (u.pathname.startsWith("/shorts/")) id = u.pathname.split("/")[2] ?? null;
    } else {
      return { ok: false };
    }
  } catch {
    return { ok: false };
  }

  if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
    return ok("iframe", `https://www.youtube-nocookie.com/embed/${id}`);
  }
  if (list && /^[A-Za-z0-9_-]{18,50}$/.test(list)) {
    return ok("iframe", `https://www.youtube-nocookie.com/embed/videoseries?list=${list}`);
  }
  return { ok: false };
}

function resolveSpotify(input: string): ResolvedEmbed {
  let path = "";
  try {
    const u = new URL(input);
    if (u.hostname !== "open.spotify.com") return { ok: false };
    path = u.pathname;
  } catch {
    return { ok: false };
  }
  const m = path.match(
    /^\/(track|album|playlist|artist|podcast|episode|show)\/([0-9A-Za-z]{18,34})(?:\/.*)?\/?$/
  );
  if (!m) return { ok: false };
  return ok("iframe", `https://open.spotify.com/embed/${m[1]}/${m[2]}`);
}

function resolveSoundcloud(input: string): ResolvedEmbed {
  try {
    const u = new URL(input);
    if (u.hostname !== "soundcloud.com" && u.hostname !== "www.soundcloud.com") {
      return { ok: false };
    }
    // Must be /user/slug (exactly two non-empty, safe segments).
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length !== 2) return { ok: false };
    if (!segs.every((s) => /^[A-Za-z0-9_.-]+$/.test(s))) return { ok: false };
    const clean = `https://soundcloud.com/${segs[0]}/${segs[1]}`;
    return ok(
      "iframe",
      `https://w.soundcloud.com/player/?url=${encodeURIComponent(clean)}&color=%238b5cf6&visual=true`
    );
  } catch {
    return { ok: false };
  }
}

function resolveTwitch(input: string, origin: string): ResolvedEmbed {
  let channel: string | null = null;
  try {
    const u = new URL(input);
    if (u.hostname === "www.twitch.tv" || u.hostname === "twitch.tv") {
      channel = u.pathname.split("/").filter(Boolean)[0] ?? null;
    } else if (u.hostname === "player.twitch.tv") {
      channel = u.searchParams.get("channel");
    } else {
      return { ok: false };
    }
  } catch {
    return { ok: false };
  }
  if (!channel || !/^[a-zA-Z0-9_]{1,30}$/.test(channel)) return { ok: false };
  // The embed player requires a `parent` host; derive it from the configured
  // site origin so it matches where the profile is actually served.
  let parent = "localhost";
  try {
    parent = new URL(origin).hostname;
  } catch {
    /* keep localhost fallback */
  }
  return ok(
    "iframe",
    `https://player.twitch.tv/?channel=${channel}&parent=${parent}`
  );
}

function resolveDiscord(input: string): ResolvedEmbed {
  let code: string | null = null;
  try {
    const u = new URL(input);
    if (u.hostname === "discord.gg") {
      code = u.pathname.split("/").filter(Boolean)[0] ?? null;
    } else if (
      (u.hostname === "discord.com" || u.hostname === "www.discord.com") &&
      u.pathname.startsWith("/invite/")
    ) {
      code = u.pathname.split("/").filter(Boolean)[1] ?? null;
    } else {
      return { ok: false };
    }
  } catch {
    return { ok: false };
  }
  if (!code || !/^[a-zA-Z0-9-]{2,16}$/.test(code)) return { ok: false };
  // A card (external link), not an iframe: no third-party JS, no network fetch.
  return ok("card", `https://discord.com/invite/${code}`);
}

function resolveImage(input: string): ResolvedEmbed {
  if (isOwnMediaPath(input)) return ok("image", input);
  try {
    const u = new URL(input);
    if (u.protocol !== "https:") return { ok: false };
    if (!IMAGE_HOSTS.has(u.hostname)) return { ok: false };
    return ok("image", u.toString());
  } catch {
    return { ok: false };
  }
}

function resolveLink(input: string): ResolvedEmbed {
  try {
    const u = new URL(input);
    if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false };
    return ok("card", u.toString());
  } catch {
    return { ok: false };
  }
}

function resolveText(input: string): ResolvedEmbed {
  // React escapes on render, but strip angle brackets + control chars and cap so
  // the stored extra is always a plain, short sentence — never markup.
  const clean = input.replace(/[<>]/g, "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!clean || clean.length > 280) return { ok: false };
  return { ok: true, kind: "text", embedUrl: "", extra: clean };
}

// ---- Widget-hub additions ----
// Every new resolver returns a canonical external link (kind: "card") or, for
// the two system widgets, an empty embedUrl + a validated `extra`. Nothing here
// reaches the DOM as markup; WidgetRenderer re-checks the origin before writing
// an href and only ever paints text through React's default escaping.

function resolveTelegram(input: string): ResolvedEmbed {
  // Accept t.me/<handle>, telegram.me/<handle>, telegram.org/<handle>, or a bare
  // handle typed straight into the field (the modal labels it clearly).
  let handle = "";
  try {
    const u = new URL(input);
    if (
      u.hostname === "t.me" ||
      u.hostname === "www.t.me" ||
      u.hostname === "telegram.me" ||
      u.hostname === "telegram.org"
    ) {
      const seg = u.pathname.split("/").filter(Boolean)[0] ?? "";
      // telegram.org/s/<name> and t.me/<name> both land on the first segment for
      // our purposes; a stray "s" prefix is dropped.
      handle = seg === "s" ? u.pathname.split("/").filter(Boolean)[1] ?? "" : seg;
    } else {
      return { ok: false };
    }
  } catch {
    handle = input;
  }
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(handle)) return { ok: false };
  return ok("card", `https://t.me/${handle}`);
}

function resolveGithub(input: string): ResolvedEmbed {
  let user = "";
  try {
    const u = new URL(input);
    if (u.hostname !== "github.com" && u.hostname !== "www.github.com") {
      return { ok: false };
    }
    user = u.pathname.split("/").filter(Boolean)[0] ?? "";
  } catch {
    return { ok: false };
  }
  // GitHub's own rule: 1-39 alnum + interior hyphens, no leading/trailing hyphen.
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(user)) return { ok: false };
  return ok("card", `https://github.com/${user}`);
}

function resolveCs(input: string): ResolvedEmbed {
  // Counter-Strike / Steam profile card. Accept the two canonical Steam URL
  // shapes: a vanity id (steamcommunity.com/id/<name>) or a 64-bit steamid
  // (steamcommunity.com/profiles/<17-digit>). Like GitHub this is an external
  // link card — no iframe, no third-party fetch.
  let path = "";
  try {
    const u = new URL(input);
    if (
      u.hostname !== "steamcommunity.com" &&
      u.hostname !== "www.steamcommunity.com"
    ) {
      return { ok: false };
    }
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length !== 2) return { ok: false };
    const [kind, value] = segs;
    if (kind === "id") {
      // Steam vanity names: 2-32 alphanumerics plus hyphen/underscore/dot.
      if (!/^[A-Za-z0-9._-]{2,32}$/.test(value)) return { ok: false };
      path = `id/${value}`;
    } else if (kind === "profiles") {
      // SteamID64: starts with the 765611979... universe prefix, 17 digits.
      if (!/^[0-9]{17}$/.test(value)) return { ok: false };
      path = `profiles/${value}`;
    } else {
      return { ok: false };
    }
  } catch {
    return { ok: false };
  }
  return ok("card", `https://steamcommunity.com/${path}`);
}

function resolveRoblox(input: string): ResolvedEmbed {
  let id = "";
  try {
    const u = new URL(input);
    if (u.hostname !== "roblox.com" && u.hostname !== "www.roblox.com") {
      return { ok: false };
    }
    // /users/<id> — the id may be followed by a slug (roblox appends one for SEO);
    // we drop it and keep the numeric id.
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length < 2 || segs[0].toLowerCase() !== "users") return { ok: false };
    id = segs[1];
  } catch {
    return { ok: false };
  }
  if (!/^[0-9]{1,20}$/.test(id)) return { ok: false };
  return ok("card", `https://roblox.com/users/${id}`);
}

function resolveLastfm(input: string): ResolvedEmbed {
  let user = "";
  try {
    const u = new URL(input);
    if (
      u.hostname !== "last.fm" &&
      u.hostname !== "www.last.fm" &&
      u.hostname !== "lastfm.com" &&
      u.hostname !== "www.lastfm.com"
    ) {
      return { ok: false };
    }
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length < 2 || segs[0].toLowerCase() !== "user") return { ok: false };
    user = segs[1];
  } catch {
    return { ok: false };
  }
  // Last.fm usernames: 1-50 printable, no slashes. We tighten to URL-safe so the
  // canonical link never needs encoding.
  if (!/^[A-Za-z0-9_.-]{1,50}$/.test(user)) return { ok: false };
  return ok("card", `https://last.fm/user/${user}`);
}

function resolveWeather(input: string): ResolvedEmbed {
  // A plain city name — no API, no geocoding. Same sanitizer as text (strip
  // control chars + angle brackets) but a shorter cap; the renderer paints a
  // static chip, so anything longer than a city label is a mistake.
  const clean = input.replace(/[<>]/g, "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!clean || clean.length > 60) return { ok: false };
  return { ok: true, kind: "weather", embedUrl: "", extra: clean };
}

function resolveTimezone(input: string): ResolvedEmbed {
  const clean = input.trim();
  if (!isTimezoneChoice(clean)) return { ok: false };
  return { ok: true, kind: "timezone", embedUrl: "", extra: clean };
}

function ok(
  kind: "iframe" | "card" | "image" | "text" | "presence" | "weather" | "timezone",
  embedUrl: string
): ResolvedEmbed {
  // Guarantee we never hand back a value that would overflow the 190-char column.
  if (embedUrl.length > 190) return { ok: false };
  return { ok: true, kind, embedUrl };
}

// ---- Public-origin helper (used by the server action for the Twitch parent) ----

/**
 * Absolute origin of this deployment. NEXT_PUBLIC_ so it is safe to read on the
 * client too. Falls back through the two origin vars the app already ships with
 * so a Twitch embed's `parent` matches wherever the profile is actually served.
 */
export function appOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (raw && /^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
  return "http://localhost:3000";
}

// ---- Plan gating (env may LOWER these ceilings, never raise them) ----

function lowered(name: string, def: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? Math.min(raw, def) : def;
}

export const FREE_WIDGET_LIMIT = lowered("WIDGET_FREE_LIMIT", 3);
export const FREE_PAGE_LIMIT = lowered("PAGES_FREE_LIMIT", 1);
export const FREE_PER_PAGE_LIMIT = lowered("WIDGET_PER_PAGE_FREE_LIMIT", 3);

// ---- Subpage slug vocabulary (shared by the action and any UI preview) ----

// Slugs that would shadow a real route or a reserved handle path.
export const RESERVED_SLUGS = new Set([
  "dashboard",
  "login",
  "signup",
  "logout",
  "api",
  "recovery",
  "redeem",
  "leaderboard",
  "status",
  "changelog",
  "admin",
  "settings",
  "templates",
  "files",
  "links",
  "widgets",
  "customize",
  "badges",
]);

/** Lowercase, hyphenate, cap at 24. Returns "" when nothing usable survives. */
export function normalizeSlug(raw: string): string {
  const s = raw
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  if (!s) return "";
  if (RESERVED_SLUGS.has(s)) return "";
  if (!/^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?$/.test(s)) return "";
  return s;
}
