// riasly — sitemap.xml. Two audiences of URLs: the handful of public marketing /
// utility pages, and every claimed public profile at /[username]. force-dynamic is
// required because the profile list is live database content — a statically
// generated sitemap at build time would freeze whoever happened to exist during the
// build and never list a profile claimed afterwards (the same force-dynamic choice
// app/verify/page.tsx makes for its request-time content).
import type { MetadataRoute } from "next";

import { prisma } from "@/lib/db";
import { appOrigin } from "@/lib/widgets";

export const dynamic = "force-dynamic";

// Public, non-robots-disallowed pages. "" is the landing page. Ranked so the home
// page and the creator-facing discovery pages lead.
const STATIC_PATHS: Array<{ path: string; priority: number }> = [
  { path: "", priority: 1 },
  { path: "/signup", priority: 0.9 },
  { path: "/leaderboard", priority: 0.7 },
  { path: "/status", priority: 0.5 },
  { path: "/changelog", priority: 0.5 },
  { path: "/login", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appOrigin();

  const statics: MetadataRoute.Sitemap = STATIC_PATHS.map(({ path, priority }) => ({
    url: `${base}${path}`,
    changeFrequency: "weekly",
    priority,
  }));

  // Join Profile only for its @updatedAt timestamp; a user without a Profile row
  // still gets listed, just without a lastModified hint.
  const users = await prisma.user.findMany({
    where: { handle: { not: null } },
    select: { handle: true, profile: { select: { updatedAt: true } } },
  });

  const profiles: MetadataRoute.Sitemap = users
    .filter((u): u is typeof u & { handle: string } => Boolean(u.handle))
    .map((u) => ({
      url: `${base}/${u.handle}`,
      lastModified: u.profile?.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

  return [...statics, ...profiles];
}
