import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { isAdminUserId } from "@/lib/admin";
import { queueBadgeSync } from "@/lib/badge-sync";
import {
  catalogMaxMb,
  getCatalogTemplates,
  pendingCatalogTemplates,
} from "@/lib/catalog";
import TemplateGallery from "@/components/dashboard/TemplateGallery";

export const metadata: Metadata = { title: "Templates — riasly" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  // The layout already proved the session and the account row exist, so this
  // page is the built-in gallery only — self-uploaded backgrounds live on
  // /dashboard/customize now.
  const userId = await getVerifiedSessionUserId();
  if (!userId) return null;

  queueBadgeSync(userId);

  // Admin-ness decides whether the pending strip is fetched at all: a visitor
  // never sees another user's in-flight renders, and the gallery gates on it too.
  const canAdmin = await isAdminUserId(userId);

  // The same fan-out the badges page does: nothing here depends on anything else
  // here. Hiding a template is a gallery filter, so the list of hidden ids is the
  // only curation state; the merged catalog comes from lib/catalog.ts (code seeds
  // + admin READY rows). Finished renders are landed by /api/catalog-status, so
  // this page stays a pure read.
  const [user, hidden, items, pending] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { profile: { select: { bannerUrl: true, avatarUrl: true } } },
    }),
    prisma.hiddenTemplate
      .findMany({ select: { templateId: true } })
      .catch(() => []),
    getCatalogTemplates(),
    canAdmin ? pendingCatalogTemplates() : Promise.resolve([]),
  ]);

  return (
    <main>
      <TemplateGallery
        currentBannerUrl={user?.profile?.bannerUrl ?? null}
        currentAvatarUrl={user?.profile?.avatarUrl ?? null}
        canAdmin={canAdmin}
        hiddenIds={hidden.map((h) => h.templateId)}
        items={items}
        pending={pending}
        maxMb={catalogMaxMb()}
      />
    </main>
  );
}
