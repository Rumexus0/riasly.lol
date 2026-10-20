// The social platforms this product supports, in display order. This mirrors the
// `Platform` enum in prisma/schema.prisma and is the single source of truth for
// the links grid, the server-action validation and the icon registry.
export const PLATFORMS = [
  "Instagram",
  "YouTube",
  "TikTok",
  "X",
  "Twitch",
  "Discord",
  "GitHub",
  "Telegram",
  "Other",
] as const;

export type PlatformName = (typeof PLATFORMS)[number];
