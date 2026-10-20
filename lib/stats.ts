// riasly — aggregate site-wide counters (profiles, users, uploads, subscribers) for
// the landing page's stat strip. SERVER ONLY: reads through Prisma.
import { prisma } from "./db";

export type SiteStats = {
  profileViews: number;
  users: number;
  fileUploads: number;
  subscribers: number;
};

const empty: SiteStats = {
  profileViews: 0,
  users: 0,
  fileUploads: 0,
  subscribers: 0,
};

/**
 * Real aggregate counts — never faked. If the database is unreachable
 * (e.g. during a prerender with no MySQL), we return zeros instead of throwing,
 * so the build and ISR never crash.
 */
export async function getStats(): Promise<SiteStats> {
  try {
    const [users, subscribers, fileUploads, viewAgg] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { plan: "PREMIUM" } }),
      prisma.fileAsset.count(),
      prisma.profile.aggregate({ _sum: { viewCount: true } }),
    ]);

    return {
      users,
      subscribers,
      fileUploads,
      profileViews: viewAgg._sum.viewCount ?? 0,
    };
  } catch {
    return empty;
  }
}
