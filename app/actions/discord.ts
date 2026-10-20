"use server";

import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { queueBadgeSync } from "@/lib/badge-sync";
import { prisma } from "@/lib/db";
import { getValidDiscordAccessToken } from "@/lib/discord";
import { addSelfToGuild, guildJoinConfigured } from "@/lib/discord-guild";
import { revalidateDashboard, revalidateProfilePages } from "@/lib/revalidate";
import { signIn } from "@/auth";
import type { ActionResult } from "@/app/actions/profile";

/**
 * "Connect Discord" / "Disconnect" — the two halves of the Discord link.
 *
 * There is deliberately no custom OAuth implementation here. Auth.js already
 * knows the Discord provider (it is also a login method), and when a session
 * exists `signIn("discord")` LINKS the returned account to the signed-in user
 * instead of creating a new one (@auth/core handle-login: linkAccount with the
 * session user id). So the grant, its tokens and its revocation all live in the
 * standard `Account` row, and `auth.ts`'s signIn callback mirrors the provider
 * account id into `Profile.discordSnowflake` — that column is now written only
 * here and there, never by the style form.
 */

// Where Discord sends the user back to. Must be registered verbatim in the
// Discord Developer Portal as `${AUTH_URL}/api/auth/callback/discord`.
const RETURN_TO = "/dashboard/customize";

/**
 * Redirects to Discord's own authorisation screen (the permission list the
 * owner is asked to approve). On success Auth.js throws its redirect error, so
 * this never returns — same contract as `signInWithProvider`.
 */
export async function connectDiscord(): Promise<void> {
  await signIn("discord", { redirectTo: RETURN_TO });
}

/**
 * Google link, for the Account page's "Bağlantılar" band. Same link-on-sign-in
 * mechanism as Discord: with an active session `signIn("google")` links the
 * returned account to the current user rather than starting a new login. It
 * returns to the Account page. Only offered when the Google provider is
 * configured (its env keys exist), which the page checks before rendering.
 */
export async function connectGoogle(): Promise<void> {
  await signIn("google", { redirectTo: "/dashboard" });
}

/**
 * Unlink Google. Mirrors disconnectDiscord's lockout guard: an account whose only
 * credential is Google (no password, no other provider) must not be able to drop
 * it and lock itself out.
 */
export async function disconnectGoogle(): Promise<ActionResult> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const me = await prisma.user
    .findUnique({
      where: { id: userId },
      select: {
        passwordHash: true,
        accounts: { select: { provider: true } },
      },
    })
    .catch(() => null);
  if (!me) return { ok: false, error: "unauthorized" };

  const otherProviders = me.accounts.filter((a) => a.provider !== "google");
  if (!me.passwordHash && otherProviders.length === 0) {
    return { ok: false, error: "lastauth" };
  }

  await prisma.account.deleteMany({ where: { userId, provider: "google" } });
  await revalidateDashboard();
  return { ok: true };
}

/**
 * Add the signed-in user to our guild again, from the dashboard.
 *
 * The automatic path is `auth.ts`'s signIn callback; this is the retry for the two
 * cases it cannot cover: an account linked before the `guilds.join` scope existed
 * (Discord then refuses the call), and a user who left the server afterwards. Only
 * the user's own token is spent, so this can never add somebody who did not agree.
 */
export async function rejoinDiscordGuild(): Promise<ActionResult> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return { ok: false, error: "unauthorized" };
  if (!guildJoinConfigured()) return { ok: false, error: "invalid" };

  const profile = await prisma.profile
    .findUnique({ where: { userId }, select: { discordSnowflake: true } })
    .catch(() => null);
  const snowflake = profile?.discordSnowflake;
  if (!snowflake) return { ok: false, error: "invalid" };

  const accessToken = await getValidDiscordAccessToken(snowflake);
  if (!accessToken) return { ok: false, error: "invalid" };

  const outcome = await addSelfToGuild(accessToken, snowflake);
  // `failed` (missing permission / stale grant) and `skipped` (rate limited) both
  // mean "nothing changed", and the card already explains which one it is.
  return outcome === "joined" || outcome === "already"
    ? { ok: true }
    : { ok: false, error: "invalid" };
}

/**
 * Revoke the link: drop the Account row (the stored tokens go with it) and
 * clear every Discord-derived style field.
 */
export async function disconnectDiscord(): Promise<ActionResult> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  // Lockout guard. An account created through "login with Discord" has no
  // passwordHash; deleting its only credential would leave it unable to sign in
  // at all — and unable to reach the page that would fix it.
  const me = await prisma.user
    .findUnique({
      where: { id: userId },
      select: {
        handle: true,
        passwordHash: true,
        accounts: { select: { provider: true } },
        profile: { select: { discordSnowflake: true } },
      },
    })
    .catch(() => null);
  if (!me) return { ok: false, error: "unauthorized" };

  const otherProviders = me.accounts.filter((a) => a.provider !== "discord");
  if (!me.passwordHash && otherProviders.length === 0) {
    return { ok: false, error: "lastauth" };
  }

  await prisma.account.deleteMany({ where: { userId, provider: "discord" } });
  await prisma.profile.upsert({
    where: { userId },
    create: { userId },
    update: {
      discordSnowflake: null,
      discordAvatarDecoration: false,
    },
  });

  // The presence row is keyed by snowflake and the bot keeps seeing that member in
  // the guild, so without this delete the card would show a "ghost activity" for
  // somebody who disconnected. Deliberately NOT kicking them out of the server —
  // that is irreversible and far more aggressive than revoking a link.
  const snowflake = me.profile?.discordSnowflake;
  if (snowflake) {
    await prisma.discordPresence.deleteMany({ where: { snowflake } }).catch(() => {});
  }

  await revalidateProfilePages(me.handle);
  queueBadgeSync(userId);
  return { ok: true };
}
