import { NextResponse } from "next/server";

import { getDiscordIdentityByHandle, type DiscordGuild } from "@/lib/discord";
import { getLivePresence } from "@/lib/discord-presence";
import { HANDLE_RE } from "@/lib/handle";

export const runtime = "nodejs";
// The answer is per-handle and cached by lib/discord.ts; Next must not cache a
// response that is itself a proxy for a live third-party profile.
export const dynamic = "force-dynamic";

// HANDLE_RE is imported, not copied: this route, signup, the availability API and
// the claim form have to agree on what a handle is, and four separate literals
// were how that agreement used to break one file at a time.

/**
 * Public Discord identity for one handle — the data behind the profile's Discord
 * card. Deliberately unauthenticated: it is the same information Discord shows
 * anyone who opens that user's profile, and it is the visitor's browser that asks
 * for it while rendering `/<handle>`.
 *
 * What it never returns: the access/refresh token, the email, or anything else
 * `users/@me` carries. lib/discord.ts builds a whitelisted object, so this route
 * can only serialise those fields even if somebody later forgets to filter. The
 * same applies to `presence`: lib/discord-presence.ts rebuilds it field by field.
 *
 * An unknown handle and a handle that simply never connected both answer
 * `{ connected: false }`, so this endpoint cannot be used to enumerate accounts.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle: raw } = await params;
  const handle = decodeURIComponent(raw ?? "").toLowerCase();
  if (!HANDLE_RE.test(handle)) {
    return NextResponse.json({ connected: false }, { status: 400 });
  }

  const identity = await getDiscordIdentityByHandle(handle);
  if (!identity) {
    return NextResponse.json(
      { connected: false },
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
  }

  const presence = await getLivePresence(identity.id);

  // Privacy: the browser gets ONE representative server, never the owner's whole
  // guild list. `guilds` and the server-only `identityGuildId` are destructured
  // off so neither can ride along in the spread.
  const { guilds, identityGuildId, ...person } = identity;
  const guild = pickGuild(
    guilds,
    presence?.activity?.guildId ?? null,
    identityGuildId
  );

  // Fifteen seconds, not the five minutes an identity-only answer could afford:
  // this payload now carries somebody's live status, and a cache that outlives the
  // client's own polling would freeze "Playing …" long after the game closed. The
  // identity behind it is still cached server-side for five minutes, so this does
  // not add Discord API calls — only cheap reads of our own row.
  return NextResponse.json(
    { connected: true, ...person, guild, presence },
    { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" } }
  );
}

/**
 * The single server to show, in precedence order: the one the current activity is
 * happening in ("the server they're using"), else their IDENTITY/clan server (the
 * `identity_guild_id` Discord actually displays on their profile — this is the fix
 * that stopped the card naming an arbitrary owned guild instead), else one they
 * own, else the first. `guilds` is already owned-first from lib/discord.ts.
 * Returns the whitelisted subset (no raw id leaks beyond what a public profile
 * would show anyway).
 */
function pickGuild(
  guilds: DiscordGuild[],
  activityGuildId: string | null,
  identityGuildId: string | null
): { id: string; name: string; iconUrl: string | null } | null {
  const guild =
    (activityGuildId ? guilds.find((g) => g.id === activityGuildId) : undefined) ??
    (identityGuildId ? guilds.find((g) => g.id === identityGuildId) : undefined) ??
    guilds.find((g) => g.owner) ??
    guilds[0] ??
    null;
  return guild ? { id: guild.id, name: guild.name, iconUrl: guild.iconUrl } : null;
}
