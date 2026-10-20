// riasly — Discord CDN URL builders. CLIENT-SAFE: no Prisma, no env secrets.
//
// Both sides of the Discord card need the same avatar math — the server when it
// maps `users/@me` to an identity, the client when it reads the same user out of
// Lanyard's payload — so it lives once here instead of being copied (two copies
// is how one of them stops honouring animated avatars).

/** Discord marks an animated avatar hash with an `a_` prefix; those are GIFs. */
export function discordAvatarUrl(
  id: string,
  hash: string | null | undefined,
  size = 128
): string | null {
  if (!id) return null;
  if (typeof hash === "string" && hash) {
    const ext = hash.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${id}/${hash}.${ext}?size=${size}`;
  }
  return discordDefaultAvatarUrl(id);
}

// No hash means the deterministic default avatar the Discord client itself shows:
// the index is derived from the snowflake ((id >> 22) % 6).
export function discordDefaultAvatarUrl(id: string): string | null {
  try {
    const idx = Number((BigInt(id) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  } catch {
    return null;
  }
}

/** Profile banner (afis). Unlike avatars, Discord has no default banner. */
export function discordBannerUrl(
  id: string,
  hash: string | null | undefined,
  size = 640
): string | null {
  if (!id || typeof hash !== "string" || !hash) return null;
  const ext = hash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${id}/${hash}.${ext}?size=${size}`;
}

/**
 * Guild (server) icon. Discord has no default guild icon, so a null hash yields
 * null and the card simply hides the icon and shows only the server name.
 */
export function discordGuildIconUrl(
  guildId: string,
  hash: string | null | undefined,
  size = 64
): string | null {
  if (!guildId || typeof hash !== "string" || !hash) return null;
  const ext = hash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${guildId}/${hash}.${ext}?size=${size}`;
}
