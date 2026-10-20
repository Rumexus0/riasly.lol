"use client";

import { useState } from "react";

// Discord's own badge glyphs, drawn as filled brand marks.
//
// Two rules from the project's icon standard apply here: fill-only paths (a
// stroke glyph next to Discord's real ones reads as a cheap copy) and no invented
// badges — every key below is derived from a bit Discord actually publishes on
// `users/@me`. Server boost TIER is deliberately absent: it is per-guild state and
// never appears in public_flags, so drawing it would be a lie.
//
// The bit values are Discord's documented UserFlags enum; `premium_type` carries
// the subscription, which is not part of the flag field.

export type DiscordBadgeKey =
  | "staff"
  | "partner"
  | "moderator"
  | "developer"
  | "activeDeveloper"
  | "verifiedBot"
  | "bugHunter"
  | "early"
  | "nitro"
  | "nitroClassic"
  | "hypesquadEvents"
  | "bravery"
  | "brilliance"
  | "balance";

const FLAG = {
  discordEmployee: 1 << 0,
  discordPartner: 1 << 1,
  hypesquadEvents: 1 << 2,
  bugHunter1: 1 << 3,
  houseBravery: 1 << 6,
  houseBrilliance: 1 << 7,
  houseBalance: 1 << 8,
  earlySupporter: 1 << 9,
  bugHunter2: 1 << 14,
  verifiedBot: 1 << 16,
  verifiedDeveloper: 1 << 17,
  certifiedModerator: 1 << 18,
  activeDeveloper: 1 << 22,
} as const;

/**
 * Which badges this identity earned, in the order they are painted. Stable and
 * fixed — a card that reshuffles its badges between two visitors is a bug report
 * waiting to happen.
 */
export function discordBadges(
  premiumType: number,
  publicFlags: number
): DiscordBadgeKey[] {
  const out: DiscordBadgeKey[] = [];
  // Discord's own display grouping: subscription first, then HypeSquad, then the
  // achievement/supporter marks, then staff/partner/dev/bot.
  // Fixed literal order — never sorted by input (a card that reshuffles its
  // badges between two visitors is a bug report waiting to happen).
  // 2 = Nitro, 3 = Nitro Basic (same gem, different colour); 1 = Classic.
  if (premiumType === 2 || premiumType === 3) out.push("nitro");
  else if (premiumType === 1) out.push("nitroClassic");
  if (publicFlags & FLAG.hypesquadEvents) out.push("hypesquadEvents");
  if (publicFlags & FLAG.houseBravery) out.push("bravery");
  if (publicFlags & FLAG.houseBrilliance) out.push("brilliance");
  if (publicFlags & FLAG.houseBalance) out.push("balance");
  if (publicFlags & (FLAG.bugHunter1 | FLAG.bugHunter2)) out.push("bugHunter");
  if (publicFlags & FLAG.earlySupporter) out.push("early");
  if (publicFlags & FLAG.discordEmployee) out.push("staff");
  if (publicFlags & FLAG.discordPartner) out.push("partner");
  if (publicFlags & FLAG.certifiedModerator) out.push("moderator");
  if (publicFlags & FLAG.verifiedDeveloper) out.push("developer");
  if (publicFlags & FLAG.activeDeveloper) out.push("activeDeveloper");
  if (publicFlags & FLAG.verifiedBot) out.push("verifiedBot");
  return out;
}

type Glyph = {
  /** Brand colour Discord uses for this badge. */
  color: string;
  /** Fill-only paths, painted in order. */
  d: string[];
  /** Set when a second path is a cut-out mark and needs the plate colour. */
  contrast?: string;
};

const GLYPHS: Record<DiscordBadgeKey, Glyph> = {
  // Discord's own mark: staff.
  staff: {
    color: "#5865F2",
    d: [
      "M19.3 5.4A16 16 0 0 0 15.3 4l-.3.5a14.7 14.7 0 0 1 4.2 1.9 13.4 13.4 0 0 0-11.5 0A14.7 14.7 0 0 1 12 4.5l-.3-.5A16 16 0 0 0 7.7 5.4 18.7 18.7 0 0 0 5 16.6a16.2 16.2 0 0 0 4.9 2.5l.4-.6a10.6 10.6 0 0 1-1.7-.8l.4-.3a11.5 11.5 0 0 0 9.9 0l.4.3c-.5.3-1.1.6-1.7.8l.4.6a16.2 16.2 0 0 0 4.9-2.5 18.6 18.6 0 0 0-2.9-11.2zM10.3 14.5c-.9 0-1.7-.9-1.7-2s.8-2 1.7-2 1.7.9 1.7 2-.7 2-1.7 2zm3.4 0c-.9 0-1.7-.9-1.7-2s.8-2 1.7-2 1.7.9 1.7 2-.7 2-1.7 2z",
    ],
  },
  partner: {
    color: "#5865F2",
    d: [
      "M12 2.6l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 8.3l5.4-.8L12 2.6z",
    ],
  },
  moderator: {
    color: "#FAA61A",
    d: [
      "M12 2.5l7 2.6v6.1c0 4-2.9 7.4-7 8.3-4.1-.9-7-4.3-7-8.3V5.1l7-2.6z",
      "M9.2 12.2l1.9 1.9 3.7-3.9-1.3-1.3-2.4 2.5-.6-.6-1.3 1.4z",
    ],
    contrast: "#1e1f24",
  },
  developer: {
    color: "#5865F2",
    d: [
      "M12 2.4l8.4 4.8v9.6L12 21.6 3.6 16.8V7.2L12 2.4z",
      "M10.6 9.2L8 12l2.6 2.8 1.3-1.2-1.4-1.6 1.4-1.6-1.3-1.2zm2.8 0l-1.3 1.2 1.4 1.6-1.4 1.6 1.3 1.2L16 12l-2.6-2.8z",
    ],
    contrast: "#1e1f24",
  },
  activeDeveloper: {
    color: "#3BA45A",
    d: [
      "M12 2.4l8.4 4.8v9.6L12 21.6 3.6 16.8V7.2L12 2.4z",
      "M11 8.4l-3 4.2h2.2l-1 3.4 3.4-4.6h-2l1.4-3zm3.6 0l-.9 3.2h1.8l-1.1 4.4 3-5h-2.1l1.3-2.6z",
    ],
    contrast: "#1e1f24",
  },
  verifiedBot: {
    color: "#5865F2",
    d: [
      "M12 2.6a9.4 9.4 0 100 18.8 9.4 9.4 0 000-18.8z",
      "M8.4 11.9l2.3 2.3 4.6-4.8-1.4-1.4-3.2 3.3-.9-.9-1.4 1.5z",
    ],
    contrast: "#ffffff",
  },
  bugHunter: {
    color: "#57F287",
    d: [
      "M12 3.4c2.7 0 4.6 2 4.6 4.6v3.6c0 2.6-2 4.6-4.6 4.6s-4.6-2-4.6-4.6V8c0-2.6 1.9-4.6 4.6-4.6z",
      "M6.2 8.8L4 7.4l1-1.6 2.4 1.5zM17.8 8.8L20 7.4l-1-1.6-2.4 1.5zM5.6 15.4l-2.4.6-.4-1.8 2.4-.6zM18.4 15.4l2.4.6.4-1.8-2.4-.6zM12 20.6c-1.6 0-3-.6-4-1.6h8c-1 1-2.4 1.6-4 1.6z",
    ],
  },
  early: {
    // The Early Supporter badge is a rocket, not a flag — drawn as one gold
    // silhouette with a dark porthole cut-out (the second path reads `contrast`).
    color: "#D6C28C",
    d: [
      "M12 2.5c2.5 2 4 5 4 8.2v3.3l2.2 2.2v1.8l-2.6-1.1c-.6 1.4-1.9 2.3-3.6 2.3s-3-.9-3.6-2.3L5.8 20v-1.8l2.2-2.2v-3.3c0-3.2 1.5-6.2 4-8.2z",
      "M12 9a1.7 1.7 0 100 3.4 1.7 1.7 0 000-3.4z",
    ],
    contrast: "#1e1f24",
  },
  nitro: {
    // Brilliant cut gem: a full-blurple silhouette with a lighter table facet on
    // top (the second path), so it catches the eye the way the real Nitro mark does.
    color: "#5865F2",
    d: [
      "M7 4h10l3 5-8 11-8-11 3-5z",
      "M7 4h10l-2 5H9l-2-5z",
    ],
    contrast: "#a5b4fc",
  },
  nitroClassic: {
    // The classic subscription reuses the same gem, drawn flat gold — no facet.
    color: "#F1C40F",
    d: ["M7 4h10l3 5-8 11-8-11 3-5z"],
  },
  hypesquadEvents: {
    // HypeSquad Events: a four-point burst in Discord's event gold.
    color: "#faa61a",
    d: ["M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z"],
  },
  bravery: {
    // HypeSquad Bravery: the purple shield.
    color: "#b967ff",
    d: ["M12 2.5l7 2.6v6.1c0 4-2.9 7.4-7 8.3-4.1-.9-7-4.3-7-8.3V5.1l7-2.6z"],
  },
  brilliance: {
    // HypeSquad Brilliance: the gold light bulb (base is a second same-colour path).
    color: "#f0c26b",
    d: [
      "M12 3a6 6 0 0 0-3.5 10.9V16A1.5 1.5 0 0 0 10 17.5h4A1.5 1.5 0 0 0 15.5 16v-2.1A6 6 0 0 0 12 3z",
      "M9.5 19h5v1.2a1.2 1.2 0 0 1-1.2 1.2h-2.6A1.2 1.2 0 0 1 9.5 20.2z",
    ],
  },
  balance: {
    // HypeSquad Balance: the teal leaf.
    color: "#67d4c5",
    d: ["M20 4c-8 0-14 4-15 12 0 0 0 2 1 3 1-6 5-9 9-10-3 2-6 5-7 10 5 1 11-3 12-15z"],
  },
};

// Discord serves its own badge art from its CDN under these slugs. They are
// Discord's stable badge names, not our keys, so the rendered look stays theirs —
// we only pick the file. `GLYPHS` above is kept as the offline fallback.
//
// The CDN itself is unreachable from a browser (it 403s every request shape), so
// the byte-identical client SVGs are vendored under `/public/discord-badges/` and
// served from there — the art is still Discord's own, just delivered locally.
const BADGE_SLUG: Record<DiscordBadgeKey, string> = {
  staff: "staff",
  partner: "partner",
  moderator: "discord_certified_moderator",
  developer: "early_verified_bot_developer",
  activeDeveloper: "active_developer",
  verifiedBot: "verified_bot",
  bugHunter: "bug_hunter",
  early: "early_supporter",
  nitro: "nitro",
  nitroClassic: "nitro_classic",
  hypesquadEvents: "hypesquad",
  bravery: "hypesquad_bravery",
  brilliance: "hypesquad_brilliance",
  balance: "hypesquad_balance",
};

// Every badge except these two has a vendored SVG. `verified_bot` only ever shows
// on a bot account (never a human OAuth profile) and `nitro_classic` is rare; no
// official client art is mirrored for them, so we draw the hand-made glyph inline
// instead of firing a request at a file that is not on disk (which would 404).
const HAS_LOCAL_ART: ReadonlySet<DiscordBadgeKey> = new Set<DiscordBadgeKey>([
  "staff",
  "partner",
  "moderator",
  "developer",
  "activeDeveloper",
  "bugHunter",
  "early",
  "nitro",
  "hypesquadEvents",
  "bravery",
  "brilliance",
  "balance",
]);

export default function DiscordBadgeGlyph({
  badgeKey,
  className = "h-4 w-4",
}: {
  badgeKey: DiscordBadgeKey;
  className?: string;
}) {
  // The official Discord badge art, served from our own `/public/discord-badges/`
  // (the CDN it mirrors 403s a browser) — the appearance is theirs, never ours. If
  // that local read ever fails we fall back to the hand-drawn glyph below, so a
  // chip is never blank. Keys with no mirrored art skip the request entirely.
  const [failed, setFailed] = useState(false);
  if (HAS_LOCAL_ART.has(badgeKey) && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/discord-badges/${BADGE_SLUG[badgeKey]}.svg`}
        alt=""
        width={16}
        height={16}
        decoding="async"
        loading="lazy"
        className={className}
        onError={() => setFailed(true)}
      />
    );
  }
  // Fallback glyph. GLYPHS is exhaustive over DiscordBadgeKey, so the lookup is
  // always defined — no defensive default (it would only mask a future key added
  // without a glyph).
  const glyph = GLYPHS[badgeKey];
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      {glyph.d.map((path, i) => (
        <path
          key={i}
          d={path}
          // The last path of a plate+mark pair is the cut-out; everything else
          // carries the brand colour.
          fill={i > 0 && glyph.contrast ? glyph.contrast : glyph.color}
        />
      ))}
    </svg>
  );
}
