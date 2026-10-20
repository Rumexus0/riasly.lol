import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { getBadgeState, syncAutoBadges } from "@/lib/badge-sync";
import { parseBadgeColors } from "@/lib/badges";
import { isAdminUserId } from "@/lib/admin";
import BadgesClient from "@/components/dashboard/BadgesClient";

export const metadata: Metadata = { title: "Badges — riasly" };
export const dynamic = "force-dynamic";

export default async function BadgesPage() {
  // The layout already proved the session and the account row exist.
  const userId = await getVerifiedSessionUserId();
  if (!userId) return null;

  // Unlike the mutation hooks, this one is awaited: arriving on the page should
  // show a badge that the latest profile change just earned.
  await syncAutoBadges(userId).catch(() => 0);

  const [state, canAdmin, user] = await Promise.all([
    getBadgeState(userId),
    isAdminUserId(userId),
    prisma.user
      .findUnique({
        where: { id: userId },
        // The handle seeds the admin panel's target field; the profile row is
        // only here for the stored badge-colour map the pickers start from.
        select: {
          handle: true,
          profile: { select: { badgeColors: true } },
        },
      })
      .catch(() => null),
  ]);

  return (
    <BadgesClient
      earned={state?.earned ?? []}
      metrics={state?.metrics ?? null}
      canAdmin={canAdmin}
      handle={user?.handle ?? ""}
      badgeColors={parseBadgeColors(user?.profile?.badgeColors)}
    />
  );
}
