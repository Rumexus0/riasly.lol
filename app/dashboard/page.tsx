import type { Metadata } from "next";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { queueBadgeSync, getBadgeMetrics } from "@/lib/badge-sync";
import { guildJoinConfigured, isGuildMember } from "@/lib/discord-guild";
import AccountOverview from "@/components/dashboard/AccountOverview";
import type { DeviceSessionView } from "@/components/dashboard/ActiveSessionsCard";

export const metadata: Metadata = { title: "Hesap — riasly" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Auth, the stale-session redirect and the shell all live in
  // app/dashboard/layout.tsx — this page is the Account overview's data fetcher.
  const userId = await getVerifiedSessionUserId();
  if (!userId) return null;

  queueBadgeSync(userId);

  const [user, metrics, session, deviceRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        handle: true,
        name: true,
        plan: true,
        createdAt: true,
        handleChangedAt: true,
        email: true,
        emailVerified: true,
        twoFactorEnabled: true,
        profile: {
          select: { viewCount: true, nicknames: true, discordSnowflake: true },
        },
        accounts: { select: { provider: true } },
        socialLinks: { select: { platform: true } },
        bioLinks: { select: { id: true } },
      },
    }),
    getBadgeMetrics(userId),
    auth(),
    prisma.deviceSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: "desc" },
      take: 10,
      select: {
        id: true,
        tokenHash: true,
        userAgent: true,
        ip: true,
        createdAt: true,
        lastSeenAt: true,
      },
    }),
  ]);

  if (!user) return null;

  const providers = Array.from(new Set(user.accounts.map((a) => a.provider)));

  // Flag the row that matches THIS browser: its tokenHash is SHA-256 of the live
  // JWT's jti. Without a jti (shouldn't happen) no row is marked current, which is
  // the safe default — it means "sign out others" simply revokes everything.
  const currentHash = session?.user?.jti
    ? createHash("sha256").update(session.user.jti).digest("hex")
    : null;
  const sessions: DeviceSessionView[] = deviceRows.map((d) => ({
    id: d.id,
    userAgent: d.userAgent,
    ip: d.ip,
    createdAt: d.createdAt.getTime(),
    lastSeenAt: d.lastSeenAt.getTime(),
    current: !!currentHash && d.tokenHash === currentHash,
  }));

  const discordConnected =
    providers.includes("discord") || !!user.profile?.discordSnowflake;

  // Guild membership check: if the user is already in our Discord server, the
  // "Hemen katıl" button is replaced with a "Zaten sunucudasın" message.
  const snowflake = user.profile?.discordSnowflake;
  const inGuild =
    discordConnected && guildJoinConfigured() && snowflake
      ? await isGuildMember(snowflake)
      : null;

  // Anti-squat: mirror the action's cooldown window (same env knob, same default)
  // so the form locks exactly when the server would refuse the change. First-time
  // claims have no handleChangedAt, so daysLeft stays 0 and the form is unlocked.
  const COOLDOWN_DAYS = (() => {
    const raw = Number(process.env.HANDLE_CHANGE_COOLDOWN_DAYS);
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 30;
  })();
  const handleCooldownDaysLeft =
    user.handle && user.handleChangedAt && COOLDOWN_DAYS > 0
      ? Math.max(
          0,
          Math.ceil(
            (user.handleChangedAt.getTime() +
              COOLDOWN_DAYS * 86_400_000 -
              Date.now()) /
              86_400_000
          )
        )
      : 0;

  return (
    <AccountOverview
      handle={user.handle ?? ""}
      displayName={user.name}
      views={user.profile?.viewCount ?? 0}
      plan={user.plan}
      nicknames={user.profile?.nicknames ?? ""}
      discordConnected={discordConnected}
      providers={providers}
      metrics={metrics}
      email={user.email}
      emailVerified={!!user.emailVerified}
      twoFactorEnabled={user.twoFactorEnabled}
      sessions={sessions}
      // The Discord band now just links to our public invite, so it only needs a
      // linked account — no bot configuration is required for the button to work.
      guildJoinAvailable={discordConnected}
      inGuild={inGuild}
      googleAvailable={!!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)}
      handleCooldownDaysLeft={handleCooldownDaysLeft}
    />
  );
}
