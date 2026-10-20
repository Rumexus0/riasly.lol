import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { queueBadgeSync } from "@/lib/badge-sync";
import { isWidgetType, type StoredWidget } from "@/lib/widgets";
import { buildProfileStyle } from "@/lib/profile-style";
import WidgetsClient from "@/components/dashboard/WidgetsClient";

export const metadata: Metadata = { title: "Widgets — riasly" };
export const dynamic = "force-dynamic";

// Map Prisma widget rows to the client-safe shape, dropping any row whose type
// is no longer recognised (defensive: a code rollback shouldn't crash the page).
function toStored(rows: { id: string; type: string; label: string; sourceUrl: string; extra: string | null }[]): StoredWidget[] {
  return rows
    .filter((w) => isWidgetType(w.type))
    .map((w) => ({
      id: w.id,
      type: w.type as StoredWidget["type"],
      label: w.label,
      sourceUrl: w.sourceUrl,
      extra: w.extra,
    }));
}

export default async function WidgetsPage() {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return null;

  queueBadgeSync(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      handle: true,
      // The widget hub modal seeds its Discord-status panel + master switch from
      // these profile columns, so this page (not just customize) must read them.
      profile: {
        select: {
          discordCardEnabled: true,
          discordCardShowBadges: true,
          discordCardIdleText: true,
          widgetsEnabled: true,
        },
      },
      widgets: {
        where: { pageId: null },
        orderBy: { position: "asc" },
        select: { id: true, type: true, label: true, sourceUrl: true, extra: true },
      },
      pages: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          slug: true,
          title: true,
          widgets: {
            orderBy: { position: "asc" },
            select: { id: true, type: true, label: true, sourceUrl: true, extra: true },
          },
        },
      },
    },
  });
  if (!user) return null;

  const style = buildProfileStyle(user.profile);

  return (
    <WidgetsClient
      plan={user.plan}
      handle={user.handle ?? ""}
      style={style}
      widgetsEnabled={style.widgetsEnabled}
      homeWidgets={toStored(user.widgets)}
      pages={user.pages.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        widgets: toStored(p.widgets),
      }))}
    />
  );
}
