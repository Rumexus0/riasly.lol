"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { HANDLE_RE } from "@/lib/handle";
import { signIn } from "@/auth";
import { issueVerificationCode, verificationEnforced } from "@/lib/email-verify";
import { clearVerifyCookie, setVerifyCookie } from "@/lib/verify-cookie";

export type AuthResult = { ok: boolean; error?: string };

// Anti-squat: cap how many signup attempts one IP may make per hour. Kept in the
// SignupAttempt table (not in-memory) so it survives a cold start and stays
// consistent across restarts. Every attempt is recorded — rejected or successful
// — so handle-enumeration via fresh emails is counted too.
const SIGNUP_IP_HOURLY_LIMIT = (() => {
  const raw = Number(process.env.SIGNUP_IP_HOURLY_LIMIT);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 3;
})();

// First hop of x-forwarded-for, else x-real-ip, else "unknown" (still throttled,
// just shared) so a missing proxy header can't disable the limiter.
function clientIp(h: Headers): string {
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return h.get("x-real-ip")?.trim() || "unknown";
}

const signupSchema = z.object({
  name: z.string().trim().min(2).max(40),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(100),
  handle: z.string().trim().toLowerCase().regex(HANDLE_RE),
});

export async function signUpUser(
  _prev: AuthResult | null,
  formData: FormData
): Promise<AuthResult> {
  const h = await headers();
  const ip = clientIp(h);

  // Count the current hour's attempts before doing any work; over the cap, stop.
  const since = new Date(Date.now() - 3600_000);
  const recent = await prisma.signupAttempt.count({
    where: { ip, createdAt: { gte: since } },
  });
  if (recent >= SIGNUP_IP_HOURLY_LIMIT) {
    return { ok: false, error: "tooMany" };
  }

  // Record exactly one attempt per processed submit (fire-and-forget; a logging
  // failure must never block the signup flow).
  const record = (ok: boolean, email?: string) =>
    prisma.signupAttempt
      .create({ data: { ip, email: email ?? null, ok } })
      .catch(() => {});

  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    handle: formData.get("handle"),
  });
  if (!parsed.success) {
    await record(false);
    return { ok: false, error: "invalid" };
  }

  const { name, email, password, handle } = parsed.data;

  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    await record(false, email);
    return { ok: false, error: "emailTaken" };
  }

  const existingHandle = await prisma.user.findUnique({ where: { handle } });
  if (existingHandle) {
    await record(false, email);
    return { ok: false, error: "handleTaken" };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // One boolean decides the whole feature: with no mail transport the gate is off
  // and signup behaves exactly as it did before. `verifyEmail` is the only thing
  // `authorize()` consults, and no existing row can ever have been set to true.
  const needsVerification = verificationEnforced();

  const user = await prisma.user
    .create({
      data: {
        name,
        email,
        passwordHash,
        handle,
        verifyEmail: needsVerification,
        profile: { create: {} },
      },
    })
    .catch(() => null);
  if (!user) {
    await record(false, email);
    return { ok: false, error: "generic" };
  }
  await record(true, email);

  if (needsVerification) {
    // No session yet — there is nothing to sign into until the address is proved,
    // and `authorize()` would refuse the credentials anyway. `/verify` is reached
    // with a signed cookie naming this account, so the visitor only types the six
    // digits that arrive in their inbox.
    const sent = await issueVerificationCode(user.id, email, ip);
    if (!sent) {
      // Fail closed, like requestEmailChange: the account exists but nothing was
      // delivered, so say so and point at the retry path instead of pretending.
      await clearVerifyCookie();
      return { ok: false, error: "emailFailed" };
    }
    await setVerifyCookie(user.id);
    redirect("/verify");
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, error: "generic" };
    }
    throw error; // NEXT_REDIRECT on success — let Next handle it
  }

  return { ok: true };
}

export async function signInWithProvider(provider: string): Promise<void> {
  await signIn(provider, { redirectTo: "/dashboard" });
}
