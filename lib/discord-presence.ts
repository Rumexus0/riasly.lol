// riasly — live Discord presence, read side. SERVER ONLY.
//
// The rows this reads are written by scripts/discord-presence-worker.mjs, which
// keeps one gateway websocket open as our bot. That process is the only thing that
// can make a profile say "Playing …" without the owner joining a third-party
// service, so this module's whole job is to decide whether that process can be
// trusted right now — and to hand the browser a small, already-whitelisted object.
//
// Failure contract, same as lib/discord.ts: everything degrades to `null`, which
// the client reads as "use Lanyard instead". A stopped worker must never blank a
// card or slow down a public profile.

import { prisma } from "@/lib/db";

export type LivePresenceActivity = {
  name: string;
  details: string | null;
  state: string | null;
  /** Discord's numeric activity kind, passed through; the client maps it. */
  type: number;
  appId: string | null;
  /** Asset *name*, not a URL — the client turns it into a CDN path. */
  assetName: string | null;
  /** Epoch ms of `timestamps.start`; null on rows written before the field. */
  start: number | null;
  /** Split asset names so the card can show tile and corner badge separately. */
  largeAsset: string | null;
  smallAsset: string | null;
  /** Server the activity is happening in, when Discord reported one; else null. */
  guildId: string | null;
};

export type LivePresence = {
  status: "online" | "idle" | "dnd" | "offline";
  activity: LivePresenceActivity | null;
  /** Epoch ms of the last presence update; useful for "last seen X ago". */
  lastSeen: number | null;
};

// Presence events only arrive on CHANGE, so a quiet guild updates no row for hours
// and `updatedAt` says nothing about staleness. The worker's beat is the only
// freshness proof there is: three missed beats (it writes every 60s) mean the
// gateway socket is gone, and every row in the table is then a freeze-frame.
const BEAT_FRESH_MS = 180_000;

// A primary-key read is cheap, but a viral profile would otherwise repeat it for
// every visitor. Five seconds is far below the client's own polling interval, so
// this cache cannot make anything feel staler than it already is.
const CACHE_MS = 5_000;

const presenceCache = new Map<string, { at: number; value: LivePresence | null }>();
let beat = { at: 0, alive: false };

/**
 * Bot presence for one snowflake, or `null` when there is nothing trustworthy to
 * show: no worker, no row, or a row that only says "offline" with no activity.
 */
export async function getLivePresence(snowflake: string): Promise<LivePresence | null> {
  if (!/^[0-9]{15,20}$/.test(snowflake)) return null;

  const now = Date.now();
  if (!(await workerAlive(now))) return null;

  const hit = presenceCache.get(snowflake);
  if (hit && now - hit.at < CACHE_MS) return hit.value;

  const row = await prisma.discordPresence
    .findUnique({ where: { snowflake }, select: { status: true, activity: true, updatedAt: true } })
    .catch(() => null);

  const value = readPresence(row?.status, row?.activity, row?.updatedAt);
  presenceCache.set(snowflake, { at: now, value });
  return value;
}

/**
 * Is the worker still writing? One single-row read per cache window, shared by
 * every profile on the page — so "worker down" costs the public route one query,
 * not one per visitor.
 */
async function workerAlive(now: number): Promise<boolean> {
  if (now - beat.at < CACHE_MS) return beat.alive;
  const row = await prisma.discordWorkerBeat
    .findUnique({ where: { id: "gateway" }, select: { beatAt: true } })
    .catch(() => null);
  const alive = Boolean(row?.beatAt && now - row.beatAt.getTime() < BEAT_FRESH_MS);
  beat = { at: now, alive };
  if (!alive) presenceCache.clear(); // the next beat should be visible immediately
  return alive;
}

function readPresence(
  status: string | null | undefined,
  rawActivity: string | null | undefined,
  updatedAt?: Date | null
): LivePresence | null {
  const activity = parseActivity(rawActivity);
  if (status !== "online" && status !== "idle" && status !== "dnd" && status !== "offline") {
    return null;
  }
  const lastSeen = updatedAt ? updatedAt.getTime() : null;
  // `offline` with nothing playing but a known timestamp still carries useful
  // information: "last seen X ago". Only return null when there is truly nothing.
  if (status === "offline" && !activity && !lastSeen) return null;
  return { status, activity, lastSeen };
}

/**
 * The stored JSON was written by our own worker from a whitelist, but it is still
 * text: rebuild the object field by field so a hand-edited row, an old format or a
 * truncated write can only ever produce the five documented fields.
 */
function parseActivity(raw: string | null | undefined): LivePresenceActivity | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const a = parsed as Record<string, unknown>;
  if (typeof a.name !== "string" || !a.name) return null;

  const text = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, 72) : null;
  const asset = (v: unknown) =>
    typeof v === "string" && /^[a-zA-Z0-9_:./-]{1,200}$/.test(v) ? v : null;
  return {
    name: a.name.slice(0, 60),
    details: text(a.details),
    state: text(a.state),
    type: typeof a.type === "number" && Number.isFinite(a.type) ? Math.trunc(a.type) : 0,
    appId: typeof a.appId === "string" && /^[0-9]{15,20}$/.test(a.appId) ? a.appId : null,
    assetName: asset(a.assetName),
    // Additive fields: rows stored before the worker learned them simply lack
    // the keys, and every missing key degrades to null instead of a guess.
    start:
      typeof a.start === "number" && Number.isFinite(a.start) && a.start > 0 && a.start < 4e12
        ? Math.trunc(a.start)
        : null,
    largeAsset: asset(a.largeAsset),
    smallAsset: asset(a.smallAsset),
    guildId:
      typeof a.guildId === "string" && /^[0-9]{15,20}$/.test(a.guildId)
        ? a.guildId
        : null,
  };
}
