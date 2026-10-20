"use server";

import { z } from "zod";

import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { isAdminUserId } from "@/lib/admin";
import { BADGES, isBadgeKey } from "@/lib/badges";
import { prisma } from "@/lib/db";
import { revalidateProfilePages } from "@/lib/revalidate";

import type { ActionResult } from "./profile";

// Admin-only surface. The guard is re-run inside every action: the dashboard
// checkbox that hides the panel is a convenience, never the permission.
async function adminGuard(): Promise<"ok" | "unauthorized" | "forbidden"> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return "unauthorized";
  return (await isAdminUserId(userId)) ? "ok" : "forbidden";
}

// Handles are claimed lowercase and are unique, so a lookup by handle is safe
// and a client-supplied userId can never be used to target somebody else.
const handleSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9-]+$/);

type Target = { ok: false; error: "invalid" } | { ok: true; id: string; handle: string };

async function resolveTarget(rawHandle: string): Promise<Target> {
  const parsed = handleSchema.safeParse(rawHandle.toLowerCase());
  if (!parsed.success) return { ok: false, error: "invalid" };

  const target = await prisma.user
    .findUnique({
      where: { handle: parsed.data },
      select: { id: true, handle: true },
    })
    .catch(() => null);
  if (!target?.handle) return { ok: false, error: "invalid" };
  return { ok: true, id: target.id, handle: target.handle };
}

export async function grantBadge(
  rawHandle: string,
  badgeKey: string
): Promise<ActionResult> {
  const guard = await adminGuard();
  if (guard !== "ok") return { ok: false, error: guard };
  if (!isBadgeKey(badgeKey)) return { ok: false, error: "invalid" };

  const target = await resolveTarget(rawHandle);
  if (!target.ok) return { ok: false, error: target.error };

  await prisma.userBadge.upsert({
    where: { userId_badgeKey: { userId: target.id, badgeKey } },
    create: { userId: target.id, badgeKey, source: "ADMIN" },
    // A re-grant refreshes the stamp and takes ownership away from AUTO, so the
    // badges page can show why this one exists.
    update: { source: "ADMIN", grantedAt: new Date() },
  });

  await revalidateProfilePages(target.handle);
  return { ok: true, data: { avatarUrl: null, bannerUrl: null, cursorUrl: null, soundUrl: null } };
}

export async function revokeBadge(
  rawHandle: string,
  badgeKey: string
): Promise<ActionResult> {
  const guard = await adminGuard();
  if (guard !== "ok") return { ok: false, error: guard };
  if (!isBadgeKey(badgeKey)) return { ok: false, error: "invalid" };

  const target = await resolveTarget(rawHandle);
  if (!target.ok) return { ok: false, error: target.error };

  // Only revocation path in the product: auto rules never take a badge away.
  await prisma.userBadge.deleteMany({
    where: { userId: target.id, badgeKey },
  });

  await revalidateProfilePages(target.handle);
  return { ok: true, data: { avatarUrl: null, bannerUrl: null, cursorUrl: null, soundUrl: null } };
}

// Owner-chosen tint for one earned badge, stored as a JSON map on Profile.
// Deliberately its OWN focused writer (the updateSoundRange pattern): folding it
// into updateProfileStyle would null the whole map on every unrelated appearance
// save, exactly why the discordCard* columns have their own action too.
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export async function setBadgeColor(
  input: { key: string; hex: string | null }
): Promise<ActionResult> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const { key: badgeKey, hex } = input;
  if (!isBadgeKey(badgeKey)) return { ok: false, error: "invalid" };
  if (hex !== null && !HEX_RE.test(hex)) return { ok: false, error: "invalid" };

  const user = await prisma.user
    .findUnique({ where: { id: userId }, select: { handle: true } })
    .catch(() => null);
  if (!user?.handle) return { ok: false, error: "invalid" };

  const profile = await prisma.profile
    .findUnique({ where: { userId }, select: { badgeColors: true } })
    .catch(() => null);

  // Read-modify-write. A corrupt or hand-edited stored map degrades to "no
  // colours" rather than throwing — the profile keeps its catalog tones.
  let map: Record<string, string> = {};
  try {
    const parsed = profile?.badgeColors ? JSON.parse(profile.badgeColors) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed)) {
        if (isBadgeKey(k) && typeof v === "string" && HEX_RE.test(v)) {
          map[k] = v.toLowerCase();
        }
      }
    }
  } catch {
    map = {};
  }

  if (hex === null) delete map[badgeKey];
  else map[badgeKey] = hex.toLowerCase();

  // The map can never grow past one entry per catalog badge, whatever was stored.
  if (Object.keys(map).length > BADGES.length) {
    map = Object.fromEntries(Object.entries(map).slice(0, BADGES.length));
  }

  const value = Object.keys(map).length > 0 ? JSON.stringify(map) : null;
  await prisma.profile.upsert({
    where: { userId },
    create: { userId, badgeColors: value },
    update: { badgeColors: value },
  });

  await revalidateProfilePages(user.handle);
  return { ok: true, data: { avatarUrl: null, bannerUrl: null, cursorUrl: null, soundUrl: null } };
}
