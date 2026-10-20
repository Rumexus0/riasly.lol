// riasly — admin allowlist. SERVER-ONLY (reads process.env + Prisma).
//
// There is no role column on User: moderation rights come from ADMIN_EMAILS so a
// mistake is a one-line .env edit instead of a schema change, and an unset list
// means nobody is an admin (fail closed). Every grant/revoke action re-checks this
// itself — the dashboard only uses it to decide whether to render the panel.

import { prisma } from "./db";

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email || ADMIN_EMAILS.size === 0) return false;
  return ADMIN_EMAILS.has(email.toLowerCase());
}

/** Authoritative: reads the stored email, not the JWT claim a provider gave us. */
export async function isAdminUserId(
  userId: string | null | undefined
): Promise<boolean> {
  if (!userId || ADMIN_EMAILS.size === 0) return false;
  const user = await prisma.user
    .findUnique({ where: { id: userId }, select: { email: true } })
    .catch(() => null);
  return isAdminEmail(user?.email);
}
