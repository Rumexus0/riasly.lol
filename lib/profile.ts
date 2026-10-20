// riasly — profile read/eligibility server helpers: public profile fetch, the custom-
// background account-age gate, salted IP hashing for view counts, the leaderboard.
// SERVER ONLY: node:crypto + next/headers + Prisma.
import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { prisma } from "./db";
import { getVerifiedSessionUserId } from "./auth-session";

// Custom (user-uploaded) backgrounds require an account older than this many
// days. Override with CUSTOM_BG_MIN_ACCOUNT_DAYS; the check itself lives in
// getCustomBackgroundEligibility so UI and server share one rule.
export const MIN_ACCOUNT_AGE_DAYS = (() => {
  const raw = Number(process.env.CUSTOM_BG_MIN_ACCOUNT_DAYS);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 7;
})();

const DAY_MS = 24 * 60 * 60 * 1000;

export type BackgroundEligibility = { allowed: boolean; daysLeft: number };

/**
 * Whether this account may set a self-uploaded video/GIF as its background.
 * Fail-closed: an unknown user is treated as locked.
 */
export async function getCustomBackgroundEligibility(
  userId: string
): Promise<BackgroundEligibility> {
  const user = await prisma.user
    .findUnique({ where: { id: userId }, select: { createdAt: true } })
    .catch(() => null);
  if (!user) return { allowed: false, daysLeft: MIN_ACCOUNT_AGE_DAYS };

  const daysLeft = Math.max(
    0,
    Math.ceil((user.createdAt.getTime() + MIN_ACCOUNT_AGE_DAYS * DAY_MS - Date.now()) / DAY_MS)
  );
  return { allowed: daysLeft === 0, daysLeft };
}

export async function getPublicProfile(handle: string) {
  return prisma.user.findUnique({
    where: { handle: handle.toLowerCase() },
    select: {
      id: true,
      name: true,
      handle: true,
      plan: true,
      profile: {
        select: {
          bio: true,
          accentColor: true,
          avatarUrl: true,
          bannerUrl: true,
          viewCount: true,
          // Style system — every column ProfileView feeds to buildProfileStyle.
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
          // JSON map { badgeKey: "#rrggbb" } — owner tints for the badge pill.
          badgeColors: true,
          // Discord presence-card config ("Profil Widget'ı") read by buildProfileStyle.
          discordCardEnabled: true,
          discordCardShowBadges: true,
          discordCardIdleText: true,
          // Master switch for the whole widget hub. ProfileView filters the
          // widget list AND ProfileStage hides the presence card when false.
          widgetsEnabled: true,
        },
      },
      bioLinks: { orderBy: { position: "asc" } },
      socialLinks: { orderBy: { createdAt: "asc" } },
      // Widgets + tabs stay inside the one findUnique so a public visit is still
      // a single query. Only home-page widgets (pageId null) render on `/<handle>`;
      // each tab's widgets are picked up by the subpage route from the same shape.
      widgets: {
        orderBy: { position: "asc" },
        select: { id: true, type: true, label: true, sourceUrl: true, extra: true, pageId: true },
      },
      pages: { orderBy: { position: "asc" }, select: { id: true, slug: true, title: true } },
      // Stored grants only — no rule evaluation here, so the public page stays
      // one query per visit. Earliest first: the strip shows them in earned order.
      userBadges: { select: { badgeKey: true, grantedAt: true }, orderBy: { grantedAt: "asc" } },
      fileAssets: {
        where: { isPrivate: false },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          size: true,
          mime: true,
          storageKey: true,
          downloadCount: true,
        },
      },
    },
  });
}

export type PublicProfile = NonNullable<Awaited<ReturnType<typeof getPublicProfile>>>;

// Salt for the anonymous viewer hash. Never stored and never exposed; it only
// ensures a raw IP is not written to the database as a viewer key.
const VIEW_SALT = process.env.VIEW_SALT ?? "riasly-view";

/**
 * The key that makes a view unique for one visitor. The rule the product asked
 * for is "1 account = 1 view", so a signed-in visitor is keyed by their account
 * id and repeated views never recount. An anonymous visitor is keyed by a salted
 * hash of their request IP (a browser has no stable server-side id, and cookies
 * cannot be minted from a Server Component render). Returns `null` when the
 * viewer IS the profile owner, so previewing your own page never inflates it.
 */
export async function resolveViewCountKey(
  ownerUserId: string
): Promise<string | null> {
  const viewerId = await getVerifiedSessionUserId().catch(() => null);
  if (viewerId) return viewerId === ownerUserId ? null : `u:${viewerId}`;

  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
  // No IP to key on (a misconfigured proxy): fall back to a per-request random
  // key so the view still counts, just without the dedup guarantee.
  if (!ip) return `ip:${createHash("sha256").update(VIEW_SALT + Math.random()).digest("hex")}`;
  return `ip:${createHash("sha256").update(VIEW_SALT + ip).digest("hex")}`;
}

export async function incrementViewCount(ownerUserId: string, viewerKey: string) {
  // De-dup lives in the database: the unique (owner, viewerKey) row can only be
  // created once, so `viewCount` is bumped only on that first insert. A repeat
  // view trips P2002 and is a silent no-op — no read-then-write race. Fire-and-
  // forget; never block or fail the page render on this.
  try {
    await prisma.profileView.create({
      data: { profileOwnerId: ownerUserId, viewerKey },
    });
  } catch {
    // A unique violation (P2002) means this viewer was already counted; any other
    // DB hiccup is not worth inflating the number either. Either way, do not
    // increment — the count only moves when the row is genuinely new.
    return;
  }
  await prisma.profile
    .update({ where: { userId: ownerUserId }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});
}

export async function getLeaderboard(limit = 20) {
  return prisma.profile.findMany({
    where: { user: { handle: { not: null } } },
    orderBy: { viewCount: "desc" },
    take: limit,
    select: {
      viewCount: true,
      user: { select: { handle: true, name: true, plan: true } },
    },
  });
}
