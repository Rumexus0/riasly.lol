"use client";

import { useEffect, useState } from "react";

/**
 * The data behind a profile's Discord card, assembled from the only places that
 * can supply it:
 *
 *  1. **Identity** — `GET /api/discord/<handle>`. Our server spends the owner's
 *     OAuth access token on Discord's `users/@me` and returns a whitelisted
 *     subset (name, avatar, banner, accent, badge flags). The token never reaches
 *     a browser, which is exactly why this cannot be a client-side Discord call.
 *  2. **Live activity** — the same response's `presence` field: our own bot
 *     listens to Discord's gateway for members of our server and stores what they
 *     are doing. This is the ONLY presence source: a profile shows live activity
 *     for people who share our server, and nothing otherwise. There is no
 *     third-party fallback — when the bot has nothing fresh the card simply shows
 *     the idle/status line.
 *
 * Identity comes from our server and presence from a live source, so this hook
 * re-fetches every 30 seconds while the tab is visible and stops when it is not:
 * a profile left open in a background tab should not poll forever.
 *
 * Everything degrades — a revoked grant or a dead network all end at
 * `connected:false` / `activity:null`, never a broken profile.
 */

export type DiscordActivityType =
  | "playing"
  | "streaming"
  | "listening"
  | "watching"
  | "competing";

export type DiscordActivity = {
  name: string;
  details: string | null;
  state: string | null;
  type: DiscordActivityType;
  /** The activity's big square art (Discord `assets.large_image` resolved). */
  largeUrl: string | null;
  /** The small app/logo art (`assets.small_image`), the tile's corner badge. */
  smallUrl: string | null;
  /** Epoch ms of `timestamps.start`; null when the source did not carry it. */
  start: number | null;
};

export type DiscordCardData = {
  /** The first fetch settled; before this the card renders nothing. */
  ready: boolean;
  connected: boolean;
  /** Discord snowflake — present whenever `connected` is. */
  id: string | null;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  accentColor: string | null;
  premiumType: number;
  publicFlags: number;
  /** One representative server the owner is in, chosen server-side; null when unknown. */
  guild: { name: string; iconUrl: string | null } | null;
  /** The owner's Discord clan (tag + emblem), when the bot's read carried one. */
  clan: { tag: string; emblemUrl: string } | null;
  status: "online" | "idle" | "dnd" | "offline" | null;
  activity: DiscordActivity | null;
  /** Epoch ms of the last presence update; for "last seen X ago" when offline. */
  lastSeen: number | null;
};

const OFFLINE: DiscordCardData = {
  ready: true,
  connected: false,
  id: null,
  displayName: null,
  username: null,
  avatarUrl: null,
  bannerUrl: null,
  accentColor: null,
  premiumType: 0,
  publicFlags: 0,
  guild: null,
  clan: null,
  status: null,
  activity: null,
  lastSeen: null,
};

// Discord's numeric activity kinds → our translation key space. Unknown numbers
// (a custom status, an activity type added after this was written) read as
// "Playing", which is what Discord itself falls back to.
const ACTIVITY_TYPE_BY_ID: Record<number, DiscordActivityType> = {
  0: "playing",
  1: "streaming",
  2: "listening",
  3: "watching",
  5: "competing",
};

// Half a minute: short enough that changing your game shows up on an open profile
// before you notice you changed it, long enough that a tab left open all day is
// still barely a request per minute — and the route itself is HTTP-cached for 15s.
const POLL_MS = 30_000;

export function useDiscordCard(
  handle: string,
  enabled: boolean
): DiscordCardData {
  const [data, setData] = useState<DiscordCardData>(
    enabled ? { ...OFFLINE, ready: false } : OFFLINE
  );

  useEffect(() => {
    if (!enabled || !handle) {
      setData(OFFLINE);
      return;
    }

    let alive = true;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    // Only the first paint is blank; a poll replaces the card in place, so an open
    // profile never flickers every 30 seconds.
    setData({ ...OFFLINE, ready: false });

    const load = async () => {
      // Supersede any poll still in flight, so an older answer cannot land after a
      // newer one.
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;

      const identity = await fetchIdentity(handle, signal);
      if (!alive) return;
      if (!identity) {
        setData(OFFLINE);
        return;
      }

      const { presence: botPresence, ...person } = identity;
      // Presence is bot-only: our gateway worker is the sole authority on what a
      // profile shows as "Playing …". When it has nothing fresh, the card carries
      // no status/activity and falls back to the idle line — there is no
      // third-party substitution.
      const presence: {
        status: DiscordCardData["status"];
        activity: DiscordActivity | null;
        lastSeen: number | null;
      } = botPresence
        ? { status: botPresence.status, activity: mapBotActivity(botPresence.activity), lastSeen: botPresence.lastSeen }
        : { status: null, activity: null, lastSeen: null };
      if (!alive) return;
      setData({
        ready: true,
        ...person,
        status: presence.status,
        activity: presence.activity,
        lastSeen: presence.lastSeen,
      });
    };

    // One rule for both triggers: only work while the page is actually on screen.
    // It serves the timer (a hidden tab is nobody's profile page) and the
    // visibilitychange event (coming back should look live immediately, not up to
    // 30 seconds stale).
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void load();
    };

    void load();
    timer = setInterval(refreshIfVisible, POLL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      controller?.abort();
    };
  }, [handle, enabled]);

  return data;
}

// `connected:true` always carries the snowflake it was fetched for, so the id is
// narrowed to a plain string here (it is exposed on the card data for identity).
type IdentityPayload = Omit<
  DiscordCardData,
  "ready" | "status" | "activity" | "id" | "lastSeen"
> & {
  id: string;
  /** Our bot's answer, or null when it has nothing fresh. */
  presence: BotPresence | null;
};

type BotPresence = {
  status: "online" | "idle" | "dnd" | "offline";
  lastSeen: number | null;
  activity: {
    name: string;
    details: string | null;
    state: string | null;
    type: number;
    appId: string | null;
    assetName: string | null;
    start: number | null;
    largeAsset: string | null;
    smallAsset: string | null;
  } | null;
};

async function fetchIdentity(
  handle: string,
  signal: AbortSignal
): Promise<IdentityPayload | null> {
  try {
    const res = await fetch(
      `/api/discord/${encodeURIComponent(handle.toLowerCase())}`,
      // The route answers with `max-age=15, stale-while-revalidate=60`, so a plain
      // fetch would spend half of the 30s polls in the browser cache and the rest
      // of the window re-showing a frozen body — which is what makes "I changed my
      // status and the card took a minute" true. lib/discord-presence.ts already
      // caches server-side for 5 seconds, so this costs no extra Discord calls.
      { signal, cache: "no-store" }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown> | null;
    if (!json || json.connected !== true || typeof json.id !== "string") return null;

    const globalName = typeof json.globalName === "string" ? json.globalName : null;
    const username = typeof json.username === "string" ? json.username : null;
    return {
      connected: true,
      id: json.id,
      displayName: globalName ?? username,
      username,
      avatarUrl: typeof json.avatarUrl === "string" ? json.avatarUrl : null,
      bannerUrl: typeof json.bannerUrl === "string" ? json.bannerUrl : null,
      accentColor: typeof json.accentColor === "string" ? json.accentColor : null,
      premiumType: typeof json.premiumType === "number" ? json.premiumType : 0,
      publicFlags: typeof json.publicFlags === "number" ? json.publicFlags : 0,
      guild: parseGuild(json.guild),
      clan: parseClan(json.clan),
      presence: parseBotPresence(json.presence),
    };
  } catch {
    return null;
  }
}

/**
 * Re-validated like every other field crossing the network boundary: the route
 * already narrowed the owner's servers to one representative, and here we accept
 * only a name string and an optional icon URL, dropping anything else to null.
 */
function parseGuild(
  raw: unknown
): DiscordCardData["guild"] {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  if (typeof g.name !== "string" || !g.name.trim()) return null;
  return {
    name: g.name.trim().slice(0, 100),
    iconUrl: typeof g.iconUrl === "string" ? g.iconUrl : null,
  };
}

/**
 * Re-validated like every other field crossing the network boundary: the route
 * forwards the bot's clan as-is, so here we accept only a non-empty tag string and
 * an emblem URL, dropping anything else (including a partial clan) to null.
 */
function parseClan(
  raw: unknown
): DiscordCardData["clan"] {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.tag !== "string" || !c.tag.trim()) return null;
  if (typeof c.emblemUrl !== "string" || !c.emblemUrl.trim()) return null;
  return { tag: c.tag.trim().slice(0, 32), emblemUrl: c.emblemUrl };
}

/**
 * Re-validated rather than trusted: this crosses a network boundary and ends up as
 * text on a public page, so every field is type-checked and clipped here too.
 */
function parseBotPresence(raw: unknown): BotPresence | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const status = p.status;
  if (status !== "online" && status !== "idle" && status !== "dnd" && status !== "offline") {
    return null;
  }
  const lastSeen = typeof p.lastSeen === "number" && Number.isFinite(p.lastSeen) && p.lastSeen > 0 ? p.lastSeen : null;
  const activity = p.activity;
  if (!activity || typeof activity !== "object") return { status, lastSeen, activity: null };
  const a = activity as Record<string, unknown>;
  if (typeof a.name !== "string" || !a.name) return { status, lastSeen, activity: null };
  return {
    status,
    lastSeen,
    activity: {
      name: a.name.slice(0, 60),
      details: clipText(a.details),
      state: clipText(a.state),
      type: typeof a.type === "number" && Number.isFinite(a.type) ? Math.trunc(a.type) : 0,
      appId: typeof a.appId === "string" ? a.appId : null,
      assetName: typeof a.assetName === "string" ? a.assetName : null,
      start: typeof a.start === "number" && Number.isFinite(a.start) && a.start > 0 ? a.start : null,
      largeAsset: typeof a.largeAsset === "string" ? a.largeAsset : null,
      smallAsset: typeof a.smallAsset === "string" ? a.smallAsset : null,
    },
  };
}

function mapBotActivity(activity: BotPresence["activity"]): DiscordActivity | null {
  if (!activity) return null;
  return {
    name: activity.name,
    details: activity.details,
    state: activity.state,
    type: ACTIVITY_TYPE_BY_ID[activity.type] ?? "playing",
    // Rows stored before the worker split the assets only have the merged name,
    // so the tile still fills from it; the corner badge then simply stays a glyph.
    largeUrl: iconFromAsset(activity.largeAsset ?? activity.assetName, activity.appId),
    smallUrl: iconFromAsset(activity.smallAsset, activity.appId),
    start: activity.start,
  };
}

function clipText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 72) : null;
}

/**
 * The square on the right of the card. Discord hands over an asset *name*, not a
 * URL, in two shapes:
 *  - `mp:external/<hash>/https/<host>/<path…>` — the image lives on a third-party
 *    CDN (Spotify albums, Twitch thumbnails) and the real URL is encoded in it;
 *  - `mp:<asset>:<id>` or a bare `<asset>` — an image uploaded with the game's
 *    application, served from our own app-assets path.
 * The app-assets path is `app-assets/<appId>/<asset>` with NO `/icons/` segment —
 * `/icons/` belongs to `app-icons`, and putting it here 404s the tile (the reader
 * then falls back to a glyph). Anything unparseable yields null and the slot
 * simply is not rendered. Only our bot's stored activity arrives here now.
 */
function iconFromAsset(asset: string | null, appId: string | null): string | null {
  if (!asset) return null;

  // Spotify-specific asset names that Discord uses for album art but which do
  // NOT resolve via the standard app-assets CDN path. When these are the only
  // assets, the card falls back to the Spotify logo instead.
  if (asset.startsWith("mp:spotify:") || asset === "spotify:cover") return null;

  if (asset.startsWith("mp:external/")) {
    const parts = asset.slice("mp:external/".length).split("/");
    const at = parts.indexOf("https");
    if (at === -1 || !parts[at + 1]) return null;
    return `https://${parts.slice(at + 1).join("/")}`;
  }

  if (!appId || !/^[0-9]{15,20}$/.test(appId)) return null;
  const name = asset.startsWith("mp:") ? asset.slice(3).split(":")[0] : asset;
  if (!/^[a-z0-9_.-]{1,120}$/i.test(name)) return null;
  return `https://cdn.discordapp.com/app-assets/${appId}/${name}.png`;
}
