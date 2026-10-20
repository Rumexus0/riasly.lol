"use client";

import BadgeStrip from "@/components/profile/BadgeStrip";

/**
 * The riasly earned-badge line, painted next to the headline name in the hero
 * (the reference layouts put earned marks beside the name, not inside the
 * presence card).
 *
 * This row carries ONLY the owner's earned riasly badges (the catalog in
 * lib/badges.ts). The Discord marks our bot reads from `users/{id}` (public_flags,
 * plus the OAuth-only premium_type) are painted inside the Discord card itself
 * (ProfileCard), which is where the reference shows them.
 */
export default function ProfileBadgeRow({
  badges,
  badgeColors,
  glitterBadges,
}: {
  /** Earned riasly badge keys (lib/badges.ts catalog). */
  badges: string[];
  /** Owner tints { badgeKey: "#rrggbb" }; absent key = the catalog tone. */
  badgeColors: Record<string, string>;
  glitterBadges: boolean;
}) {
  if (badges.length === 0) return null;

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 align-middle${glitterBadges ? " glitter" : ""}`}>
      <BadgeStrip keys={badges} colors={badgeColors} />
    </span>
  );
}
