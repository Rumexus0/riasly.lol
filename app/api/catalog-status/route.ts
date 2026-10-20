import { NextResponse } from "next/server";

import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { isAdminUserId } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { pendingCatalogTemplates, reconcileRendering } from "@/lib/catalog";

export const runtime = "nodejs";
// Every poll must see the newest row state; a cached answer would freeze a card
// at "rendering" forever.
export const dynamic = "force-dynamic";

// A narrow, cheap poll endpoint exists for one reason: polling
// /dashboard/templates instead would re-run that page, and it calls
// queueBadgeSync(userId) on every render (app/dashboard/templates/page.tsx) — a
// 5-second poll would become badge-sync spam. This route reads only the catalog.
export async function GET() {
  const userId = await getVerifiedSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await isAdminUserId(userId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // One reconcile per poll: lands finished renders, fails timed-out ones, and
  // re-checks READY rows whose files may have vanished. Bounded by this one admin.
  await reconcileRendering();
  const pending = await pendingCatalogTemplates();
  const ready = await prisma.catalogTemplate
    .count({ where: { status: "READY" } })
    .catch(() => 0);

  return NextResponse.json({ pending, ready });
}
