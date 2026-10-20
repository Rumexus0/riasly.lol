"use server";

// riasly — the email-verification form's three moves.
//
// `requestVerificationCode` is the address-only entry point (somebody who closed
// the tab, or whose mail failed), `submitVerificationCode` consumes the code, and
// `resendVerificationCode` is the same issue path bound to the cookie instead of a
// typed address. Which account is being verified comes from lib/verify-cookie.ts,
// never from a form field, so this file cannot be pointed at somebody else's code.
//
// Nothing here opens a session — `authorize()` in auth.ts owns that and is the
// actual gate. These actions only ever flip `verifyEmail` back to false, which is
// what makes the gate let the account through.

import { z } from "zod";
import { headers } from "next/headers";

import { prisma } from "@/lib/db";
import {
  canRequestCode,
  issueVerificationCode,
  verifyAndConsumeCode,
} from "@/lib/email-verify";
import {
  clearVerifyCookie,
  readVerifyUserId,
  setVerifyCookie,
} from "@/lib/verify-cookie";

export type VerifyResult = {
  ok: boolean;
  error?: "invalid" | "invalidToken" | "tooMany" | "emailFailed";
  /** Which stage the form should be showing after this call. */
  stage?: "email" | "code";
  /** On success: the address that was just confirmed, for the client to hand the
   *  login form. Never put in a URL — see VerifyEmailForm. */
  email?: string;
};

// Same first-hop rule as the signup limiter (app/actions/auth.ts). The value is
// stored in EmailVerifyToken.ip, a VARCHAR(64).
function clientIp(h: Headers): string {
  const xff = h.get("x-forwarded-for");
  const ip = xff ? xff.split(",")[0]?.trim() || "unknown" : h.get("x-real-ip")?.trim() || "unknown";
  return ip.slice(0, 64);
}

/**
 * Mail a code to `email`. The answer is deliberately shape-identical for the two
 * paths that must not be distinguished ("this address has an account pending
 * verification" and "it does not"): both report success and leave the form on the
 * address stage, the same discipline `requestPasswordReset` follows. A *blocked*
 * request is still reported honestly, because signup already tells the world
 * whether an address is taken, so the resend cap is the real limit here.
 */
export async function requestVerificationCode(
  _prev: VerifyResult | null,
  formData: FormData
): Promise<VerifyResult> {
  const ip = clientIp(await headers());

  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email().max(120) })
    .safeParse({ email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: "invalid" };

  const user = await prisma.user
    .findUnique({
      where: { email: parsed.data.email },
      select: { id: true, email: true, verifyEmail: true },
    })
    .catch(() => null);
  // A signup always writes an address, but `User.email` is nullable in the schema,
  // so the path that has nothing to mail to is answered like the address being
  // unknown rather than with a special case.
  if (!user || !user.email || !user.verifyEmail) return { ok: true, stage: "email" };

  if (!(await canRequestCode(user.id, ip))) {
    return { ok: false, error: "tooMany", stage: "code" };
  }

  const sent = await issueVerificationCode(user.id, user.email, ip);
  if (!sent) return { ok: false, error: "emailFailed", stage: "email" };

  await setVerifyCookie(user.id);
  return { ok: true, stage: "code" };
}

/** Consume the code for whichever account the signed cookie names. */
export async function submitVerificationCode(
  _prev: VerifyResult | null,
  formData: FormData
): Promise<VerifyResult> {
  const userId = await readVerifyUserId();
  if (!userId) return { ok: false, error: "invalid", stage: "email" };

  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { ok: false, error: "invalidToken", stage: "code" };

  const account = await prisma.user
    .findUnique({
      where: { id: userId },
      select: { email: true, verifyEmail: true },
    })
    .catch(() => null);
  if (!account || !account.verifyEmail) {
    // Nothing pending for this pointer — verified already, or the account is gone.
    await clearVerifyCookie();
    return { ok: false, error: "invalid", stage: "email" };
  }

  const ok = await verifyAndConsumeCode(userId, code);
  if (!ok) return { ok: false, error: "invalidToken", stage: "code" };

  // Verified: the account can log in now, so the pointer to a finished
  // verification is worth nothing and should not outlive its purpose.
  await clearVerifyCookie();
  return { ok: true, email: account.email ?? undefined };
}

/**
 * Send the code again, for the account already in progress. Rate-limited exactly
 * like the address-driven path, because a resend button is the cheap way around an
 * hourly cap.
 */
export async function resendVerificationCode(): Promise<VerifyResult> {
  const [userId, ip] = [await readVerifyUserId(), clientIp(await headers())];
  if (!userId) return { ok: false, error: "invalid", stage: "email" };

  const user = await prisma.user
    .findUnique({
      where: { id: userId },
      select: { id: true, email: true, verifyEmail: true },
    })
    .catch(() => null);
  if (!user || !user.email || !user.verifyEmail) {
    await clearVerifyCookie();
    return { ok: true, stage: "email" };
  }

  if (!(await canRequestCode(user.id, ip))) {
    return { ok: false, error: "tooMany", stage: "code" };
  }

  const sent = await issueVerificationCode(user.id, user.email, ip);
  if (!sent) return { ok: false, error: "emailFailed", stage: "code" };

  return { ok: true, stage: "code" };
}
