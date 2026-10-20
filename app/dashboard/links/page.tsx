import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { queueBadgeSync } from "@/lib/badge-sync";
import LinksClient from "@/components/dashboard/LinksClient";

export const metadata: Metadata = { title: "Links — riasly" };
export const dynamic = "force-dynamic";

export default async function LinksPage() {
  // The layout already proved the session and the account row exist.
  const userId = await getVerifiedSessionUserId();
  if (!userId) return null;

  // Visiting a dashboard page is also where view-count milestones get graded:
  // the public profile render must stay one query, so sync happens here instead.
  queueBadgeSync(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      socialLinks: { orderBy: { createdAt: "asc" } },
      bioLinks: { orderBy: { position: "asc" } },
      // Discord is owned by the OAuth grant, not a SocialLink row. Read the same
      // DB-only truth the customize page uses (account provider="discord" and/or
      // the mirrored snowflake) so this page stops showing it as "not connected".
      accounts: { where: { provider: "discord" }, select: { providerAccountId: true } },
      profile: { select: { discordSnowflake: true } },
    },
  });

  // The grid renders one tile per platform, so duplicates (possible in rows
  // written before the action enforced it) collapse to the newest connection.
  const byPlatform = new Map<string, NonNullable<typeof user>["socialLinks"][number]>();
  for (const s of user?.socialLinks ?? []) byPlatform.set(s.platform, s);

  return (
    <LinksClient
      socials={[...byPlatform.values()].map((s) => ({
        id: s.id,
        platform: s.platform,
        url: s.url,
        username: s.username,
        isVerified: s.isVerified,
      }))}
      links={(user?.bioLinks ?? []).map((l) => ({
        id: l.id,
        label: l.label,
        url: l.url,
      }))}
      discordConnected={Boolean(
        user?.accounts?.[0]?.providerAccountId || user?.profile?.discordSnowflake
      )}
    />
  );
}
