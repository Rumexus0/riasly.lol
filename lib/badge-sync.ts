// riasly — badge metrics + auto-grant sync. SERVER-ONLY.
//
// Split from lib/badges.ts (client-safe catalog) the same way lib/media.ts is
// split from lib/media-kind.ts, so a client component can render badge visuals
// without pulling Prisma into the browser bundle.
//
// Rules are evaluated only where a user is already doing dashboard work: profile
// mutations and dashboard page visits. Never on the public profile render, which
// stays at its current single query per visit.

import { prisma } from "./db";
import { isOwnMediaPath } from "./media-kind";
import { DEFAULT_ACCENT, earnedBadgeKeys, type BadgeMetrics } from "./badges";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One snapshot query. Returns null for an unknown user (a stale session token),
 * which every caller treats as "no badge work to do".
 */
export async function getBadgeMetrics(userId: string): Promise<BadgeMetrics | null> {
  const user = await prisma.user
    .findUnique({
      where: { id: userId },
      select: {
        createdAt: true,
        profile: {
          select: {
            bio: true,
            accentColor: true,
            avatarUrl: true,
            bannerUrl: true,
            viewCount: true,
          },
        },
        // Distinct platforms matter (one tile per platform in the UI), so read
        // them rather than trusting the row count.
        socialLinks: { select: { platform: true } },
        bioLinks: { select: { id: true } },
        fileAssets: { where: { isPrivate: false }, select: { downloadCount: true } },
        usedRedeemCodes: { select: { id: true } },
      },
    })
    .catch(() => null);
  if (!user) return null;

  const views = user.profile?.viewCount ?? 0;
  const banner = user.profile?.bannerUrl ?? "";
  const ownBg = isOwnMediaPath(banner);
  const socials = new Set(user.socialLinks.map((s) => s.platform)).size;
  const links = user.bioLinks.length;
  const files = user.fileAssets.length;
  const hasBio = !!user.profile?.bio?.trim();
  const hasAvatar = !!user.profile?.avatarUrl;

  const [earlier, ahead] = await Promise.all([
    prisma.user
      .count({ where: { createdAt: { lt: user.createdAt } } })
      .catch(() => 0),
    prisma.profile.count({ where: { viewCount: { gt: views } } }).catch(() => 0),
  ]);

  return {
    accountDays: Math.floor((Date.now() - user.createdAt.getTime()) / DAY_MS),
    joinRank: earlier + 1,
    socials,
    links,
    files,
    downloads: user.fileAssets.reduce((sum, f) => sum + (f.downloadCount ?? 0), 0),
    views,
    rank: ahead + 1,
    hasBio,
    hasAvatar,
    customAccent:
      // <input type="color"> reports lowercase ("#8b5cf6") while the seed value
      // is uppercase, so the default must compare equal in both spellings.
      (user.profile?.accentColor ?? DEFAULT_ACCENT).toLowerCase() !==
      DEFAULT_ACCENT.toLowerCase(),
    templateBg: !!banner && !ownBg,
    ownBg,
    redeemed: user.usedRedeemCodes.length > 0,
    completeParts:
      (hasBio ? 1 : 0) +
      (hasAvatar ? 1 : 0) +
      (socials > 0 ? 1 : 0) +
      (links > 0 ? 1 : 0),
  };
}

export type EarnedBadge = {
  badgeKey: string;
  source: "AUTO" | "ADMIN";
  grantedAt: Date;
};

/** Stored grants (what the public profile shows) plus live metrics (progress). */
export async function getBadgeState(userId: string): Promise<{
  metrics: BadgeMetrics | null;
  earned: EarnedBadge[];
} | null> {
  const [metrics, rows] = await Promise.all([
    getBadgeMetrics(userId),
    prisma.userBadge
      .findMany({
        where: { userId },
        select: { badgeKey: true, source: true, grantedAt: true },
        orderBy: { grantedAt: "asc" },
      })
      .catch(() => []),
  ]);
  if (!metrics) return null;
  return { metrics, earned: rows as EarnedBadge[] };
}

/**
 * Grant everything the account currently qualifies for. Writes only the
 * difference, so the common case is one read and no write. Never deletes:
 * an earned badge is permanent, and only an admin can take one away.
 */
export async function syncAutoBadges(userId: string): Promise<number> {
  const metrics = await getBadgeMetrics(userId);
  if (!metrics) return 0;

  const eligible = earnedBadgeKeys(metrics);
  if (eligible.length === 0) return 0;

  const have = new Set(
    (
      await prisma.userBadge
        .findMany({ where: { userId }, select: { badgeKey: true } })
        .catch(() => [] as { badgeKey: string }[])
    ).map((r) => r.badgeKey)
  );

  const missing = eligible.filter((k) => !have.has(k));
  if (missing.length === 0) return 0;

  await prisma.userBadge
    .createMany({
      data: missing.map((badgeKey) => ({ userId, badgeKey, source: "AUTO" })),
      skipDuplicates: true,
    })
    .catch(() => null);

  return missing.length;
}

/** Fire-and-forget wrapper: badge work must never fail the user's real action. */
export function queueBadgeSync(userId: string): void {
  void syncAutoBadges(userId).catch(() => {});
}
