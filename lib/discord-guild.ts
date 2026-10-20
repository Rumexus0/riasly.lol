// riasly — Discord guild (server) membership. SERVER ONLY (holds the bot token).
//
// Why this exists: a bot can only see presence for users who share a guild with it
// — that is Discord's `GUILD_PRESENCES` rule, and it is why the profile card needs
// everybody who connects Discord to end up inside our own server. The mechanism is
// `PUT /guilds/{guildId}/members/{userId}` together with the `guilds.join` scope:
// the *user's own* access token goes in the body (so it is the user adding
// themselves), while the Authorization header carries the bot token, which only
// needs the `CREATE_INSTANT_INVITE` permission. No prior membership is required —
// a brand-new user is created directly into the guild.
//
// Failure contract, and the reason this module is small: nothing here may ever
// disturb a sign-in. `auth.ts` calls `maybeJoinOwnGuild` without awaiting it, and
// every outcome is a short string instead of a thrown error. If the bot is not
// configured, or the grant predates the `guilds.join` scope, the user simply keeps
// the identity card and the Lanyard fallback for their activity.

/** `joined` = added now · `already` = was a member · `skipped` = do not retry · `failed` = the user can fix this */
export type GuildJoinOutcome = "joined" | "already" | "skipped" | "failed";

const API = "https://discord.com/api/v10";

/**
 * The public invite the Account page's "Hemen katıl" button opens. Overridable via
 * DISCORD_INVITE_URL; defaults to our server's permanent invite. Joining through
 * this link (rather than the bot's `guilds.join` API) hands the whole flow to
 * Discord's own accept screen, so it works for any visitor with no bot permission.
 */
export const DISCORD_INVITE_URL =
  process.env.DISCORD_INVITE_URL || "https://discord.gg/uZK6UVR7YJ";

// A snowflake is 15-20 digits; anything else must never reach the Discord API.
const SNOWFLAKE_RE = /^[0-9]{15,20}$/;

// Membership only changes when the user joins or leaves, and the dashboard reads
// it on every page view, so one REST call per minute per user is plenty.
const MEMBER_CACHE_MS = 60 * 1000;
const memberCache = new Map<string, { at: number; value: boolean }>();

/** Both keys present? Everything in this module no-ops when they are not. */
export function guildJoinConfigured(): boolean {
  return Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID);
}

/** Did the stored grant actually include `guilds.join`? Accounts linked before it
 *  was requested do not, and Discord refuses the call for them. */
export function hasGuildJoinScope(scope: string): boolean {
  return scope.split(/\s+/).includes("guilds.join");
}

/**
 * Add a user to our guild with their own access token. Never throws.
 */
export async function addSelfToGuild(
  accessToken: string,
  snowflake: string
): Promise<GuildJoinOutcome> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!botToken || !guildId) return "skipped";
  if (!accessToken || !SNOWFLAKE_RE.test(snowflake)) return "skipped";

  const res = await fetch(
    `${API}/guilds/${encodeURIComponent(guildId)}/members/${snowflake}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: accessToken }),
      cache: "no-store",
    }
  ).catch(() => null);
  // A network failure says nothing about permissions, so it is not an error the
  // user could act on: stay silent and let the next sign-in try again.
  if (!res) return "skipped";

  if (res.status === 201) return "joined";
  if (res.status === 204) return "already";
  // 401/403 = the bot lacks CREATE_INSTANT_INVITE (or its token is invalid);
  // 400 = the access token is stale or was issued without `guilds.join`;
  // 404 = guild id wrong. All of them are configuration/consent problems the
  // dashboard can name, so they are reported rather than swallowed.
  if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
    console.warn(`[discord-guild] join refused (${res.status}) for a connected user`);
    return "failed";
  }
  // 429 / 5xx: Discord is throttling us or having a bad day. Retrying from the
  // dashboard would only repeat it, so this one waits for the next sign-in.
  return "skipped";
}

/**
 * Is this user currently in our guild? `null` means "cannot tell" — no bot
 * configured, or Discord did not answer — which the dashboard renders as no hint
 * at all instead of a wrong accusation.
 *
 * This is a plain REST read, so it needs no privileged intent (intents only gate
 * gateway events) and no user token.
 */
export async function isGuildMember(snowflake: string): Promise<boolean | null> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!botToken || !guildId || !SNOWFLAKE_RE.test(snowflake)) return null;

  const hit = memberCache.get(snowflake);
  if (hit && Date.now() - hit.at < MEMBER_CACHE_MS) return hit.value;

  const res = await fetch(
    `${API}/guilds/${encodeURIComponent(guildId)}/members/${snowflake}`,
    { headers: { Authorization: `Bot ${botToken}` }, cache: "no-store" }
  ).catch(() => null);
  if (!res) return hit?.value ?? null;
  if (res.status === 200) {
    memberCache.set(snowflake, { at: Date.now(), value: true });
    return true;
  }
  if (res.status === 404) {
    memberCache.set(snowflake, { at: Date.now(), value: false });
    return false;
  }
  // 401/403/5xx: our own setup is the problem, so say nothing about the user.
  console.warn(`[discord-guild] member lookup failed (${res.status})`);
  return null;
}

/**
 * Fire-and-forget join, called from the Auth.js `signIn` callback. Guards first:
 * no `guilds.join` in the stored scope means Discord would reject the call, so we
 * never send a token for nothing.
 *
 * Deliberately un-awaited by its caller, deliberately logs nothing that could
 * identify the user, and never lets a rejection escape (`void` + `.catch`).
 */
export async function maybeJoinOwnGuild(args: {
  snowflake: string;
  accessToken: string;
  scope: string;
}): Promise<void> {
  if (!guildJoinConfigured()) return;
  if (!args.accessToken || !hasGuildJoinScope(args.scope)) return;
  try {
    await addSelfToGuild(args.accessToken, args.snowflake);
  } catch {
    // A join that explodes is a cosmetic loss, never a reason to disturb a login.
  }
}
