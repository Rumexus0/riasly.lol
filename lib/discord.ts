// riasly — Discord identity resolver. SERVER ONLY (reads OAuth tokens + bot token).
//
// Why this exists: the profile's Discord card needs the owner's username, avatar,
// banner, accent colour, badge flags and clan. The AUTHORITATIVE source is the
// owner's own OAuth `GET /users/@me`, which carries `public_flags`, `premium_type`,
// the `clan`/`primary_guild` object and (with the `guilds` scope) the server list.
// The bot's `GET /users/{id}` is only best-effort enrichment: in practice a bot
// token cannot read an arbitrary user's object (Discord answers 403 / code 40333),
// so the OAuth identity is what actually fills the card. Both tokens stay here; the
// caller only ever receives a plain, whitelisted `DiscordIdentity`.
//
// Live activity ("Playing Visual Studio Code") is NOT available this way — Discord
// has no presence REST API. It comes from our own bot's gateway events, written to
// MySQL by scripts/discord-presence-worker.mjs and read back by
// lib/discord-presence.ts; Lanyard remains the fallback when that worker is not
// running. See components/profile/useDiscordCard.ts, which merges the sources.
//
// Failure contract: every function here returns `null` instead of throwing. A dead
// token, a rate limit or a MySQL hiccup must make the card disappear, never break
// a public profile.

import { prisma } from "@/lib/db";
import {
  discordAvatarUrl,
  discordBannerUrl,
  discordGuildIconUrl,
} from "@/lib/discord-avatar";

// A Discord snowflake is 15-20 digits; anything else must never reach a URL or
// the public payload.
const SNOWFLAKE_RE = /^[0-9]{15,20}$/;

/** One server the owner belongs to, whitelisted for the profile card. */
export type DiscordGuild = {
  id: string;
  name: string;
  iconUrl: string | null;
  owner: boolean;
};

export type DiscordIdentity = {
  /** Discord snowflake — also the key Lanyard's presence API uses. */
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  /** #rrggbb the owner picked in Discord, when they picked one. */
  accentColor: string | null;
  /** 0 none, 1 Classic, 2 Nitro — drives the "DIA" badge. */
  premiumType: number;
  /** Discord's `public_flags` bitfield, passed through untouched. */
  publicFlags: number;
  /** The owner's Discord clan (tag + emblem), sourced from the bot read or,
   *  in practice, the OAuth `users/@me` `clan`/`primary_guild` object. */
  clan: { tag: string; emblemUrl: string } | null;
  /** The clan/primary guild's snowflake, SERVER-ONLY: used to pick the
   *  representative server and stripped before the identity reaches a browser. */
  identityGuildId: string | null;
  /** Servers the owner is in, owned-first and capped. Never sent whole to a browser. */
  guilds: DiscordGuild[];
};

// A visitor-triggered route must never sit behind a round trip to Discord, so an
// identity is reused for a while. Five minutes is fresh enough that changing your
// Discord avatar shows up on the profile within a coffee break, and cheap enough
// that a viral profile cannot turn into a Discord-API denial-of-service against
// ourselves. A missing/failed link is cached for far less: reconnecting should
// work on the next look at the page, not after five minutes.
const IDENTITY_TTL_MS = 5 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 1000;
// Refresh a little early: a token that expires mid-request reads as a 401.
const REFRESH_SKEW_MS = 60 * 1000;
// The bot's `users/{id}` read occasionally fails transiently — a 5xx, a dropped
// socket or a 429. Those are retried once with a short backoff. A 403 is NOT
// transient (Discord denies arbitrary user reads), so it is a single fast miss.
// See fetchBotUser.
const BOT_RETRY_BASE_MS = 400;
// Discord's REST/CDN edge rejects undici's default Node user agent on some reads
// (a bare `node` UA surfaces as a 4xx). A browser-like UA keeps the identity, bot,
// guild and OAuth calls answering like any ordinary client.
const DISCORD_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type CacheEntry = { at: number; value: DiscordIdentity | null };
const identityCache = new Map<string, CacheEntry>();
// Discord rotates the refresh token on every exchange, so two concurrent
// refreshes would invalidate each other. One in-flight promise per account makes
// every caller share the single winner.
const refreshing = new Map<string, Promise<string | null>>();

/** Identity for a public handle (used by the visitor-facing API route). */
export async function getDiscordIdentityByHandle(
  handle: string
): Promise<DiscordIdentity | null> {
  const user = await prisma.user
    .findUnique({
      where: { handle: handle.toLowerCase() },
      select: { profile: { select: { discordSnowflake: true } } },
    })
    .catch(() => null);
  const id = user?.profile?.discordSnowflake;
  return id ? identityForSnowflake(id) : null;
}

/** Identity for the signed-in owner (used by the dashboard connect card). */
export async function getDiscordIdentityByUserId(
  userId: string
): Promise<DiscordIdentity | null> {
  const profile = await prisma.profile
    .findUnique({ where: { userId }, select: { discordSnowflake: true } })
    .catch(() => null);
  const id = profile?.discordSnowflake;
  return id ? identityForSnowflake(id) : null;
}

async function identityForSnowflake(id: string): Promise<DiscordIdentity | null> {
  const key = `d:${id}`;
  const hit = identityCache.get(key);
  const ttl = hit?.value ? IDENTITY_TTL_MS : NEGATIVE_TTL_MS;
  if (hit && Date.now() - hit.at < ttl) return hit.value;

  const value = await fetchIdentity(id);
  if (value) {
    identityCache.set(key, { at: Date.now(), value });
    return value;
  }
  // No answer. Keep serving the last good identity for one negative window rather
  // than letting a transient 5xx from Discord blank somebody's card.
  if (hit?.value) {
    identityCache.set(key, {
      at: Date.now() - IDENTITY_TTL_MS + NEGATIVE_TTL_MS,
      value: hit.value,
    });
    return hit.value;
  }
  identityCache.set(key, { at: Date.now(), value: null });
  return null;
}

/**
 * A usable user access token for this snowflake, refreshed when it is close to
 * expiring. Public because spending the grant is not only about identity: adding
 * the user to our own guild (`guilds.join`) needs the very same token, and a
 * second copy of the refresh dance would fight the first over Discord's rotating
 * refresh tokens.
 */
export async function getValidDiscordAccessToken(
  snowflake: string
): Promise<string | null> {
  // @@id([provider, providerAccountId]) makes this a single indexed read.
  const account = await prisma.account
    .findUnique({
      where: {
        provider_providerAccountId: { provider: "discord", providerAccountId: snowflake },
      },
      select: {
        access_token: true,
        refresh_token: true,
        expires_at: true,
      },
    })
    .catch(() => null);
  if (!account?.access_token) return null;

  const expiresAt = account.expires_at ? account.expires_at * 1000 : 0;
  if (expiresAt && expiresAt - REFRESH_SKEW_MS >= Date.now()) return account.access_token;

  // null here means the grant is gone (revoked in Discord → Settings →
  // Authorized Apps). The row is left alone: the dashboard still shows the
  // connection and offers "reconnect", which is a better story than silence.
  return refreshTokens(snowflake, account.refresh_token);
}

async function fetchIdentity(id: string): Promise<DiscordIdentity | null> {
  // The bot read is authoritative for the public badge flags and the core profile
  // fields, and it works even when the owner's OAuth grant is dead — so a card no
  // longer disappears just because a refresh token was revoked.
  const bot = await fetchBotUser(id);

  // OAuth is now only the enrichment source: `premium_type` (which /users/{id}
  // does not carry) and the guild list. A missing/failed grant leaves these empty.
  let oauth: DiscordIdentity | null = null;
  const accessToken = await getValidDiscordAccessToken(id);
  if (accessToken) {
    const res = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": DISCORD_USER_AGENT },
      cache: "no-store",
    }).catch(() => null);
    if (res && res.ok) {
      const raw: unknown = await res.json().catch(() => null);
      oauth = mapIdentity(raw, id);
      // A separate, non-privileged read. An account linked before the `guilds`
      // scope existed answers 403 here, which `fetchGuilds` degrades to an empty
      // list — the card then simply shows no server, never an error.
      if (oauth) oauth.guilds = await fetchGuilds(accessToken);
    }
  }

  if (!bot && !oauth) return null;

  // Prefer the bot for everything it answers; fall back to OAuth on a dev instance
  // with no bot token. premium_type is OAuth-only, so a revoked grant drops just
  // the Nitro gem (and the server chip), never the card — matching the "reconnect"
  // affordance in getValidDiscordAccessToken above.
  const base = bot ?? oauth!;
  return {
    id,
    username: base.username,
    globalName: base.globalName,
    avatarUrl: base.avatarUrl,
    bannerUrl: base.bannerUrl,
    accentColor: base.accentColor,
    premiumType: oauth?.premiumType ?? 0,
    publicFlags: base.publicFlags,
    // The clan rides on the user object; prefer the bot's read, fall back to the
    // OAuth `users/@me` clan (the real source today, since the bot 403s).
    clan: bot?.clan ?? oauth?.clan ?? null,
    identityGuildId: bot?.identityGuildId ?? oauth?.identityGuildId ?? null,
    guilds: oauth?.guilds ?? [],
  };
}

type BotUser = {
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  accentColor: string | null;
  publicFlags: number;
  clan: { tag: string; emblemUrl: string } | null;
  identityGuildId: string | null;
};

/**
 * The public user object via the bot token, as best-effort enrichment. Bots in
 * practice CANNOT read an arbitrary user's object (`GET /users/{id}` answers 403
 * / code 40333), so this is usually `null` and the OAuth identity is what fills
 * the card. Field-by-field projection like `mapIdentity`; never throws, and
 * `null` (no token, a hard rejection, a malformed body) simply means "fall back
 * to OAuth". A genuinely *transient* failure — a 5xx, a dropped socket or a 429 —
 * is retried once with a short backoff; a 403 is a real denial and never retried.
 */
async function fetchBotUser(id: string): Promise<BotUser | null> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken || !SNOWFLAKE_RE.test(id)) return null;

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`https://discord.com/api/v10/users/${id}`, {
      headers: { Authorization: `Bot ${botToken}`, "User-Agent": DISCORD_USER_AGENT },
      cache: "no-store",
    }).catch(() => null);

    if (res && res.ok) {
      const raw: unknown = await res.json().catch(() => null);
      return mapBotUser(raw, id);
    }

    // Decide whether this failure deserves another try. No answer at all (a dead
    // socket) and 5xx/429 are clearly transient. A 403 is NOT: Discord denies
    // arbitrary `users/{id}` reads deterministically, so it is a single fast miss
    // and the OAuth identity becomes the real source for the owner.
    const transient = !res || res.status >= 500 || res.status === 429;
    if (!transient || attempt === MAX_ATTEMPTS) return null;
    await sleep(BOT_RETRY_BASE_MS * attempt);
  }
  return null;
}

/**
 * A Discord clan is not part of `public_flags`; it rides on the user object's
 * `clan` / `primary_guild` — both the bot read and OAuth `users/@me` carry it in
 * the SAME shape. Guarded field by field so a partial or absent clan reads as
 * `null`, never throws. `identity_enabled: false` means the owner is not showing
 * the clan, so it reads as `null` too. The emblem is Discord's own CDN asset
 * keyed by guild id + badge hash.
 */
type ClanInfo = { tag: string; emblemUrl: string; guildId: string };

function mapClan(raw: unknown): ClanInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (c.identity_enabled === false) return null;
  const tag =
    typeof c.tag === "string" && c.tag.trim() ? c.tag.trim().slice(0, 32) : null;
  const guildId =
    typeof c.identity_guild_id === "string" && SNOWFLAKE_RE.test(c.identity_guild_id)
      ? c.identity_guild_id
      : null;
  const badge = typeof c.badge === "string" && c.badge.trim() ? c.badge.trim() : null;
  if (!tag || !guildId || !badge) return null;
  return {
    tag,
    guildId,
    emblemUrl: `https://cdn.discordapp.com/clan-badges/${guildId}/${badge}.png?size=56`,
  };
}

/**
 * Discord answers a healthy read with the user body; anything not shaped like an
 * object, or without a username, reads as `null` so the caller falls back to
 * OAuth rather than painting a half-empty card.
 */
function mapBotUser(raw: unknown, id: string): BotUser | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;

  const username = typeof u.username === "string" ? u.username.slice(0, 64) : "";
  if (!username) return null;

  const globalName =
    typeof u.global_name === "string" && u.global_name.trim()
      ? u.global_name.trim().slice(0, 64)
      : null;
  const avatarHash = typeof u.avatar === "string" ? u.avatar : null;
  const bannerHash = typeof u.banner === "string" ? u.banner : null;
  const accent =
    typeof u.accent_color === "number" && Number.isFinite(u.accent_color)
      ? `#${(u.accent_color >>> 0).toString(16).padStart(6, "0").slice(-6)}`
      : null;
  const publicFlags =
    typeof u.public_flags === "number" && Number.isFinite(u.public_flags)
      ? u.public_flags >>> 0
      : 0;

  // A Discord clan is not part of `public_flags`; only the `clan` object carries
  // it, so share one guarded projection with the OAuth path (see `mapClan`).
  const clan = mapClan(u.clan);

  return {
    username,
    globalName,
    avatarUrl: discordAvatarUrl(id, avatarHash, 128),
    bannerUrl: discordBannerUrl(id, bannerHash, 640),
    accentColor: accent,
    publicFlags,
    clan: clan ? { tag: clan.tag, emblemUrl: clan.emblemUrl } : null,
    identityGuildId: clan?.guildId ?? null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


/**
 * The owner's server list, whitelisted field by field. Everything degrades to
 * `[]`: no scope yet (403), a rate limit, or a malformed body must never disturb
 * the identity that already came back healthy. Owned servers sort first because
 * they are the most likely "the server they use"; the route later narrows this
 * to a single representative so the full list never reaches a browser.
 */
async function fetchGuilds(accessToken: string): Promise<DiscordGuild[]> {
  const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
    headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": DISCORD_USER_AGENT },
    cache: "no-store",
  }).catch(() => null);
  if (!res || !res.ok) return [];
  const raw: unknown = await res.json().catch(() => null);
  if (!Array.isArray(raw)) return [];

  const out: DiscordGuild[] = [];
  for (const entry of raw) {
    const g = entry as Record<string, unknown>;
    const id = typeof g.id === "string" && SNOWFLAKE_RE.test(g.id) ? g.id : null;
    const name =
      typeof g.name === "string" && g.name.trim() ? g.name.trim().slice(0, 100) : null;
    if (!id || !name) continue;
    out.push({
      id,
      name,
      iconUrl: discordGuildIconUrl(id, typeof g.icon === "string" ? g.icon : null),
      owner: g.owner === true,
    });
  }
  // Stable sort keeps Discord's own ordering within each owner group.
  out.sort((a, b) => Number(b.owner) - Number(a.owner));
  return out.slice(0, 25);
}

async function refreshTokens(
  providerAccountId: string,
  refreshToken: string | null | undefined
): Promise<string | null> {
  const clientId = process.env.AUTH_DISCORD_ID;
  const clientSecret = process.env.AUTH_DISCORD_SECRET;
  if (!refreshToken || !clientId || !clientSecret) return null;

  const pending = refreshing.get(providerAccountId);
  if (pending) return pending;

  const run = exchangeRefreshToken(providerAccountId, refreshToken, clientId, clientSecret)
    // Release the slot before the awaiting callers continue, so a caller that
    // retries after a failure cannot reuse a settled promise.
    .finally(() => refreshing.delete(providerAccountId));
  refreshing.set(providerAccountId, run);
  return run;
}

async function exchangeRefreshToken(
  providerAccountId: string,
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<string | null> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  }).catch(() => null);
  if (!res || !res.ok) return null;

  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const accessToken = json?.access_token;
  if (typeof accessToken !== "string" || !accessToken) return null;

  // Discord always rotates the refresh token; only overwrite what it returned.
  const expiresIn = Number(json?.expires_in);
  await prisma.account
    .update({
      where: {
        provider_providerAccountId: { provider: "discord", providerAccountId },
      },
      data: {
        access_token: accessToken,
        refresh_token:
          typeof json?.refresh_token === "string" ? json.refresh_token : undefined,
        token_type: typeof json?.token_type === "string" ? json.token_type : undefined,
        scope: typeof json?.scope === "string" ? json.scope : undefined,
        expires_at:
          Number.isFinite(expiresIn) && expiresIn > 0
            ? Math.floor(Date.now() / 1000 + expiresIn)
            : undefined,
      },
    })
    .catch(() => {});

  return accessToken;
}

/**
 * Whitelist projection of Discord's `users/@me`. Anything not listed here — email,
 * locale, mfa_enabled, phone, the tokens themselves — cannot leave this module,
 * because the returned object is built field by field.
 */
function mapIdentity(raw: unknown, fallbackId: string): DiscordIdentity | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;

  const id = typeof u.id === "string" && u.id ? u.id : fallbackId;
  const username = typeof u.username === "string" ? u.username.slice(0, 64) : "";
  if (!username) return null;

  const globalName =
    typeof u.global_name === "string" && u.global_name.trim()
      ? u.global_name.trim().slice(0, 64)
      : null;
  const avatarHash = typeof u.avatar === "string" ? u.avatar : null;
  const bannerHash = typeof u.banner === "string" ? u.banner : null;
  const accent =
    typeof u.accent_color === "number" && Number.isFinite(u.accent_color)
      ? `#${(u.accent_color >>> 0).toString(16).padStart(6, "0").slice(-6)}`
      : null;
  const premiumType =
    typeof u.premium_type === "number" && Number.isFinite(u.premium_type)
      ? Math.max(0, Math.min(3, Math.trunc(u.premium_type)))
      : 0;
  const publicFlags =
    typeof u.public_flags === "number" && Number.isFinite(u.public_flags)
      ? u.public_flags >>> 0
      : 0;

  // `users/@me` carries the clan in the same shape as the bot read; `primary_guild`
  // is an equivalent fallback. Shared guarded projection via `mapClan`.
  const clan = mapClan(u.clan) ?? mapClan(u.primary_guild);

  return {
    id,
    username,
    globalName,
    avatarUrl: discordAvatarUrl(id, avatarHash, 128),
    bannerUrl: discordBannerUrl(id, bannerHash, 640),
    accentColor: accent,
    premiumType,
    publicFlags,
    clan: clan ? { tag: clan.tag, emblemUrl: clan.emblemUrl } : null,
    identityGuildId: clan?.guildId ?? null,
    // Filled in by fetchIdentity from a separate `users/@me/guilds` read; kept
    // empty here so mapIdentity stays a pure projection of the `users/@me` body.
    guilds: [],
  };
}
