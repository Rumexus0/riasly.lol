// riasly — resolves the real signed-in user from the NextAuth session, deciding
// account existence and email-verification server-side (middleware on Edge can
// only see token presence). SERVER ONLY: pulls node:crypto, @/auth and Prisma.
import { createHash } from "node:crypto";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * Session truth that also survives a deleted account.
 *
 * The session JWT lives in an httpOnly cookie and outlives the row it points to
 * (deleted test fixture, closed account, banned user). `middleware.ts` can only
 * see the token, so a page that trusts `session.user.id` alone will fetch a
 * missing user and bounce the visitor into a redirect cycle. Anything that reads
 * or writes user rows must go through this helper instead.
 *
 * It is also the single enforcement point for session revocation: the strategy is
 * JWT (stateless), so the only server-side hook is here. If this browser's
 * DeviceSession row (looked up by SHA-256 of its `jti`) has been revoked, the
 * session reads as gone and the middleware bounces protected routes to /login.
 */
export async function getVerifiedSessionUserId(): Promise<string | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const jti = session.user.jti;
  if (jti) {
    const tokenHash = createHash("sha256").update(jti).digest("hex");
    const device = await prisma.deviceSession
      .findUnique({ where: { tokenHash }, select: { revokedAt: true } })
      .catch(() => null);
    if (device?.revokedAt) return null;
  }

  const exists = await prisma.user
    .findUnique({ where: { id }, select: { id: true } })
    .catch(() => null);
  return exists ? id : null;
}

/**
 * Raw token presence without touching the database. Only used to phrase UI copy
 * (e.g. the login page explaining why a "signed in" visitor sees the form).
 */
export async function hasSessionToken(): Promise<boolean> {
  return !!(await auth())?.user?.id;
}

/**
 * Guard for `?next=` style redirect targets: internal, root-relative paths only.
 * Rejects absolute URLs, protocol-relative `//host` and `/api/...` endpoints.
 */
export function safeInternalPath(
  raw: string | null | undefined
): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (raw.startsWith("/api/")) return null;
  return raw;
}
