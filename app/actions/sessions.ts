"use server";

import { createHash } from "node:crypto";

import { auth } from "@/auth";
import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { prisma } from "@/lib/db";
import { revalidateDashboard } from "@/lib/revalidate";

// The Account page's "Aktif oturumlar" management. Every action requires a live,
// verified session and only ever touches the caller's own DeviceSession rows. The
// current browser's session is identified by the SHA-256 of its `jti`, so a user
// can never lock themselves out by revoking the very session they are using.

export type SessionResult = { ok: boolean; error?: "unauthorized" };

/** SHA-256 hash of the current session's jti, or null when not signed in. */
async function currentTokenHash(): Promise<string | null> {
  const jti = (await auth())?.user?.jti;
  return jti ? createHash("sha256").update(jti).digest("hex") : null;
}

export async function revokeSession(id: string): Promise<SessionResult> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const row = await prisma.deviceSession.findUnique({ where: { id } });
  if (!row || row.userId !== userId) return { ok: false, error: "unauthorized" };

  const current = await currentTokenHash();
  if (row.tokenHash === current) return { ok: false, error: "unauthorized" };

  await prisma.deviceSession.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  revalidateDashboard();
  return { ok: true };
}

/** Revoke every other device, keeping the one the user is acting from. */
export async function revokeOtherSessions(): Promise<SessionResult> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const current = await currentTokenHash();
  await prisma.deviceSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      // Keep the active row; when we cannot tell which is active, keep none extra
      // risked by matching on a hash that simply will not equal any row.
      ...(current ? { tokenHash: { not: current } } : {}),
    },
    data: { revokedAt: new Date() },
  });
  revalidateDashboard();
  return { ok: true };
}

/**
 * Revoke every session INCLUDING this one — a "sign out everywhere" that also
 * drops the current browser (the next server read fails the revocation check and
 * the middleware bounces to /login).
 */
export async function revokeAllSessions(): Promise<SessionResult> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  await prisma.deviceSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidateDashboard();
  return { ok: true };
}
