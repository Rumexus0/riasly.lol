"use server";

import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { isAdminUserId } from "@/lib/admin";
import { getCatalogTemplateById } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { revalidateDashboard } from "@/lib/revalidate";

import type { ActionResult } from "./profile";

// Admin-only gallery curation. The guard is re-run inside every action: the
// button that shows up on a card is a convenience, never the permission. It
// answers with the admin's own id, which is what gets stamped on the row.
async function adminGuard(): Promise<
  { ok: true; userId: string } | { ok: false; error: "unauthorized" | "forbidden" }
> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return { ok: false, error: "unauthorized" };
  return (await isAdminUserId(userId))
    ? { ok: true, userId }
    : { ok: false, error: "forbidden" };
}

/**
 * Hide a curated template from the gallery, or bring it back.
 *
 * Only the gallery list is affected. Nothing here touches a Profile row, so an
 * admin removing a template they don't like cannot break the page of the person
 * who already applied it — and lib/template-recipes.ts keeps resolving its
 * motion recipe for exactly that reason.
 */
export async function setTemplateHidden(
  templateId: string,
  hidden: boolean
): Promise<ActionResult> {
  const guard = await adminGuard();
  if (!guard.ok) return { ok: false, error: guard.error };

  // Never trust a client-supplied key: it has to be a real entry in the catalog,
  // the same way badge keys are checked against lib/badges.ts. The merged lookup
  // means an admin can hide or restore their own added template too.
  const template = await getCatalogTemplateById(templateId);
  if (!template) return { ok: false, error: "invalid" };

  if (hidden) {
    await prisma.hiddenTemplate.upsert({
      where: { templateId: template.id },
      create: { templateId: template.id, hiddenBy: guard.userId },
      // A re-hide refreshes who did it and when, so the removed tab can say.
      update: { hiddenBy: guard.userId, hiddenAt: new Date() },
    });
  } else {
    // deleteMany, not delete: hiding something that was never hidden (or
    // restoring twice) must be a no-op rather than a P2025.
    await prisma.hiddenTemplate.deleteMany({ where: { templateId: template.id } });
  }

  // No handle to revalidate: this changes a list, not a page. The dashboard
  // layout plus every dashboard route and the leaderboard are what read counts.
  await revalidateDashboard();
  return { ok: true, data: { avatarUrl: null, bannerUrl: null, cursorUrl: null, soundUrl: null } };
}
