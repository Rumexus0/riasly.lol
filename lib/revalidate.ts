// riasly — cache invalidation shared by the server actions.
//
// The dashboard is now six routes under one layout, and a single profile edit can
// change every one of them plus the public page. Listing the surfaces here keeps
// that in one place instead of repeating revalidatePath() per action.

import { revalidatePath } from "next/cache";

export const DASHBOARD_PATHS = [
  "/dashboard",
  "/dashboard/links",
  "/dashboard/widgets",
  "/dashboard/badges",
  "/dashboard/customize",
  "/dashboard/files",
  "/dashboard/templates",
];

export async function revalidateDashboard(): Promise<void> {
  // Layout-scoped first, then the explicit children: the pages are all
  // force-dynamic, so double coverage costs nothing and cannot go stale if the
  // documented scope of the "layout" type ever changes.
  revalidatePath("/dashboard", "layout");
  for (const p of DASHBOARD_PATHS) revalidatePath(p);
  revalidatePath("/leaderboard");
}

/** Dashboard + this user's public handle page. */
export async function revalidateProfilePages(handle?: string | null): Promise<void> {
  await revalidateDashboard();
  if (handle) revalidatePath(`/${handle}`);
}
