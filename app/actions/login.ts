"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";

import { prisma } from "@/lib/db";
import { signIn } from "@/auth";
import { safeInternalPath } from "@/lib/auth-session";
import { issueLoginOtp } from "@/lib/login-otp";
import { setVerifyCookie } from "@/lib/verify-cookie";
import type { AuthResult } from "./auth";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  token: z.string().trim().optional(),
});

export async function loginUser(
  _prev: AuthResult | null,
  formData: FormData
): Promise<AuthResult> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    token: (formData.get("token") as string | null) || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid" };

  const rawNext = formData.get("next");

  // Explain the verification block instead of silently failing — and only for a
  // password that has already been proven, exactly like probeMfaRequired. Until the
  // credentials are right, an unverified account looks identical to a wrong
  // password, so this cannot be used to find accounts that are stuck mid-signup.
  // `authorize()` stays the actual gate; nothing here opens a session.
  const account = await prisma.user
    .findUnique({
      where: { email: parsed.data.email },
      select: {
        id: true,
        passwordHash: true,
        verifyEmail: true,
        emailVerified: true,
      },
    })
    .catch(() => null);
  if (account?.verifyEmail && !account.emailVerified && account.passwordHash) {
    const proven = await bcrypt.compare(parsed.data.password, account.passwordHash);
    if (proven) {
      // Hand `/verify` the account, so the visitor is not asked for an address they
      // just typed correctly.
      await setVerifyCookie(account.id);
      return { ok: false, error: "emailNotVerified" };
    }
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      // The second factor. Empty for accounts without 2FA (authorize() ignores
      // it there); a TOTP or backup code otherwise.
      token: parsed.data.token ?? "",
      // Honour the page the visitor was sent away from, but only to an internal
      // path — never to an absolute or protocol-relative URL.
      redirectTo: safeInternalPath(typeof rawNext === "string" ? rawNext : null) ?? "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, error: "invalidCredentials" };
    }
    throw error; // successful redirect
  }

  return { ok: true };
}

export type MfaProbe = { mfa: boolean };

/**
 * Does this credential pair need a second factor? The login form calls this to
 * decide whether to reveal the code field BEFORE attempting the real sign-in.
 *
 * It verifies the password (bcrypt) but never opens a session — the actual login
 * still goes through `signIn("credentials")`/`authorize`, the only place a
 * session is issued. A wrong password and an account without 2FA both answer
 * `{ mfa: false }`, so this cannot be used to enumerate who has 2FA or which
 * emails exist; the real rejection happens in authorize().
 */
export async function probeMfaRequired(
  email: string,
  password: string
): Promise<MfaProbe> {
  const parsed = z
    .object({
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(1),
    })
    .safeParse({ email, password });
  if (!parsed.success) return { mfa: false };

  const user = await prisma.user
    .findUnique({
      where: { email: parsed.data.email },
      select: { passwordHash: true, twoFactorEnabled: true },
    })
    .catch(() => null);
  if (!user || !user.passwordHash || !user.twoFactorEnabled) return { mfa: false };

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  return { mfa: valid };
}

/**
 * Email a 2FA sign-in code. The login form offers this at the code step for users
 * who use email as their second factor. Mirrors probeMfaRequired's discipline: the
 * password is verified first, and every failure (wrong password, no 2FA, no email
 * on file, a failed send) answers the same `{ ok: false }`, so nothing is
 * enumerable and no session is ever opened here.
 */
export async function sendLoginOtp(
  email: string,
  password: string
): Promise<{ ok: boolean }> {
  const parsed = z
    .object({
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(1),
    })
    .safeParse({ email, password });
  if (!parsed.success) return { ok: false };

  const user = await prisma.user
    .findUnique({
      where: { email: parsed.data.email },
      select: { id: true, passwordHash: true, twoFactorEnabled: true, email: true },
    })
    .catch(() => null);
  if (!user || !user.passwordHash || !user.twoFactorEnabled || !user.email) {
    return { ok: false };
  }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) return { ok: false };

  return { ok: await issueLoginOtp(user.id, user.email) };
}
