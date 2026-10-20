import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { getCustomBackgroundEligibility } from "@/lib/profile";
import { queueBadgeSync } from "@/lib/badge-sync";
import { isWidgetType, type StoredWidget } from "@/lib/widgets";
import { getDiscordIdentityByUserId } from "@/lib/discord";
import { guildJoinConfigured, hasGuildJoinScope, isGuildMember } from "@/lib/discord-guild";
import { getEnabledOAuthProviders } from "@/lib/oauth";
import { buildProfileStyle } from "@/lib/profile-style";
import {
  AVATAR_ALLOWED_MIMES,
  SOUND_ALLOWED_MIMES,
  isAllowedBackgroundMime,
  isAllowedCursorMime,
  isAllowedSoundMime,
  isOwnMediaPath,
  mediaPathFor,
} from "@/lib/media-kind";
import CustomizeClient from "@/components/dashboard/CustomizeClient";

export const metadata: Metadata = { title: "Customize — riasly" };
export const dynamic = "force-dynamic";

// The style columns ProfileView reads on the public page, read again here so the
// editor form mounts with the exact values the profile will render.
const STYLE_SELECT = {
  bio: true,
  accentColor: true,
  avatarUrl: true,
  bannerUrl: true,
  textColor: true,
  bgColor: true,
  iconColor: true,
  effectColor: true,
  profileOpacity: true,
  profileBlur: true,
  bgEffect: true,
  usernameEffect: true,
  profileAlign: true,
  location: true,
  cursorUrl: true,
  soundUrl: true,
  soundStartMs: true,
  soundEndMs: true,
  bgClipStartMs: true,
  bgClipEndMs: true,
  discordSnowflake: true,
  profileGradient: true,
  monochromeIcons: true,
  animatedTitle: true,
  boxColors: true,
  soundEnabled: true,
  discordAvatarDecoration: true,
  glitterName: true,
  glitterSocials: true,
  glitterBadges: true,
  // Discord presence-card config ("Profil Widget'ı") edited on this page.
  discordCardEnabled: true,
  discordCardShowBadges: true,
  discordCardIdleText: true,
  // Master switch for the widget hub modal.
  widgetsEnabled: true,
} as const;

export default async function CustomizePage() {
  // The layout already proved the session and the account row exist.
  const userId = await getVerifiedSessionUserId();
  if (!userId) return null;

  queueBadgeSync(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      profile: { select: STYLE_SELECT },
      // Home-page widgets feed the modal's per-type seeds (an existing row's
      // sourceUrl / extra becomes the field value when the user picks that tab).
      widgets: {
        where: { pageId: null },
        orderBy: { position: "asc" },
        select: { id: true, type: true, label: true, sourceUrl: true, extra: true },
      },
      // The OAuth grant is the single proof of a Discord connection: no row,
      // nothing to show. The id itself lives on the profile row (written by the
      // signIn callback), so this only asks whether the account is there — plus
      // the scope it was given, which decides whether the automatic server-join
      // can be attempted at all.
      accounts: {
        where: { provider: "discord" },
        select: { providerAccountId: true, scope: true },
      },
      fileAssets: {
        // Widest set any slot accepts: avatar/photo, background video/GIF, plus
        // music. Each card filters this one list down to what it can actually use.
        where: {
          isPrivate: false,
          mime: { in: [...AVATAR_ALLOWED_MIMES, ...SOUND_ALLOWED_MIMES] },
        },
        orderBy: { createdAt: "desc" },
        take: 24,
        select: { id: true, name: true, size: true, mime: true, storageKey: true },
      },
    },
  });
  if (!user) return null;

  const eligibility = await getCustomBackgroundEligibility(userId);

  // Only keys that already carry a usable extension get a direct preview URL;
  // the apply actions normalize the rest, but we cannot point an <img>/<video>
  // at a path the media route would reject.
  const assets = user.fileAssets
    .map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      mime: f.mime,
      url: mediaPathFor(f.storageKey),
    }))
    .filter((a) => isOwnMediaPath(a.url));

  // One query, four views — each slot sees exactly the set it can apply.
  const avatarAssets = assets;
  const bgAssets = assets.filter((a) => isAllowedBackgroundMime(a.mime));
  const cursorAssets = assets.filter((a) => isAllowedCursorMime(a.mime));
  const soundAssets = assets.filter((a) => isAllowedSoundMime(a.mime));

  const maxMb = Number(process.env.MAX_UPLOAD_MB ?? 25);
  const avatarMaxMb = Number(process.env.AVATAR_MAX_MB ?? 8);
  // The server caps a sound at min(SOUND_MAX_MB, 25); mirror that here so the
  // card's client-side pre-check agrees with what applySoundFromFile enforces.
  const soundMaxMb = Math.min(Number(process.env.SOUND_MAX_MB ?? 10) || 10, 25);
  const p = user.profile;

  // Discord's own identity fields, spent from the owner's access token and cached
  // for five minutes. Absent (or null after a revoked grant) means the card falls
  // back to "not connected", which is the honest state: there is nothing to show.
  const discordEnabled = getEnabledOAuthProviders().includes("discord");
  const discordAccount = user.accounts?.[0] ?? null;
  const discordIdentity =
    discordEnabled && discordAccount
      ? await getDiscordIdentityByUserId(userId)
      : null;
  // Is the owner in our server, and could they even be added? `null` means "not
  // applicable / cannot tell", which shows no hint rather than a wrong one:
  //  - no bot configured → nothing to check;
  //  - a grant issued before `guilds.join` → Discord refuses the add, so telling
  //    them they are "not in the server" would only send them in circles;
  //  - a lookup that failed → stay quiet.
  const botConfigured = guildJoinConfigured();
  const scopeOutdated = Boolean(
    discordIdentity && !hasGuildJoinScope(discordAccount?.scope ?? "")
  );
  const inGuild =
    discordIdentity && botConfigured && !scopeOutdated && p?.discordSnowflake
      ? await isGuildMember(p.discordSnowflake)
      : null;

  return (
    <CustomizeClient
      profile={{
        bio: p?.bio ?? "",
        accentColor: p?.accentColor ?? "#8B5CF6",
        avatarUrl: p?.avatarUrl ?? null,
        bannerUrl: p?.bannerUrl ?? null,
      }}
      style={buildProfileStyle(p)}
      eligibility={eligibility}
      plan={user.plan}
      homeWidgets={
        (user.widgets ?? []).filter((w) => isWidgetType(w.type)) as StoredWidget[]
      }
      discord={{
        enabled: discordEnabled,
        connected: !!discordIdentity,
        displayName: discordIdentity?.globalName ?? null,
        username: discordIdentity?.username ?? null,
        avatarUrl: discordIdentity?.avatarUrl ?? null,
        botConfigured,
        inGuild,
        scopeOutdated,
      }}
      bgAssets={bgAssets}
      avatarAssets={avatarAssets}
      cursorAssets={cursorAssets}
      soundAssets={soundAssets}
      maxMb={maxMb}
      avatarMaxMb={avatarMaxMb}
      soundMaxMb={soundMaxMb}
    />
  );
}
