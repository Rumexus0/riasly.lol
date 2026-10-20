// riasly — email verification codes for new accounts. SERVER ONLY.
//
// Why this exists: an account used to be reachable the instant it was created,
// which means a mailbox nobody owns can become a permanent identity here. This
// module is the other half of the fix: `signUpUser` marks the new row
// `verifyEmail = true`, mails a 6-digit code, and `authorize()` refuses to open a
// session until that code has been entered.
//
// Two properties are load-bearing and easy to lose:
//  * The gate is *always* conditioned on a working mail transport. Without SMTP
//    there is nothing that can deliver a code, so forcing verification would
//    reject every single signup — `verificationEnforced()` no-ops instead, exactly
//    like the email-change and 2FA flows already do.
//  * Existing rows carry `verifyEmail = false` (the column default), so enabling
//    this feature can never lock out an account that predates it. Nothing here
//    reads or writes that field for anybody but a freshly created user.
//
// Never throws: a delivery failure reads as false so the caller can fail closed,
// and the stored code is deleted when the send failed, mirroring lib/login-otp.ts.
// Codes are newest-row-wins, single-use and attempt-capped for the same reason.

import { randomInt } from "node:crypto";
import { prisma } from "./db";
import { codeEmailHtml, mailConfigured, sendMail } from "./mailer";

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours: an inbox may be checked tomorrow
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

// How many codes one IP may start per hour. Generous next to the signup cap
// because a legitimate user resends; the point is to stop a scripted probe of the
// form, not to punish a slow inbox.
const VERIFY_IP_HOURLY_LIMIT = (() => {
  const raw = Number(process.env.VERIFY_IP_HOURLY_LIMIT);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 5;
})();

/**
 * Is the verification gate live? True when a mail transport exists and nobody has
 * explicitly opted out with `REQUIRE_EMAIL_VERIFICATION="false"`. One boolean, read
 * by signup and by nothing else — the flag on the user row is what later gates
 * actually consult, so flipping this in `.env` never retroactively touches anyone.
 */
export function verificationEnforced(): boolean {
  return mailConfigured() && process.env.REQUIRE_EMAIL_VERIFICATION !== "false";
}

/** Mint a code, store it (replacing any earlier one) and email it. True on success. */
export async function issueVerificationCode(
  userId: string,
  email: string,
  ip: string
): Promise<boolean> {
  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + TTL_MS);
  try {
    await prisma.emailVerifyToken.deleteMany({ where: { userId } });
    await prisma.emailVerifyToken.create({
      data: { userId, code, expiresAt, ip },
    });
  } catch {
    return false;
  }
  const sent = await sendMail({
    to: email,
    subject: "Confirm your riasly email address",
    text: `Your verification code is ${code}. It expires in 24 hours and works once.`,
    html: codeEmailHtml(code, "email verification"),
  });
  if (!sent) {
    // Nothing was delivered, so drop the orphan code rather than leave it live.
    await prisma.emailVerifyToken.deleteMany({ where: { userId } }).catch(() => {});
  }
  return sent;
}

/**
 * May this account be sent another code right now? Two cheap checks before any
 * work happens: the newest live code must be at least a minute old (resend
 * cooldown, read off its `createdAt` so the table needs no extra column), and one
 * IP may not start more than `VERIFY_IP_HOURLY_LIMIT` codes in an hour — which is
 * why `ip` is stored at all, and why `@@index([ip, createdAt])` exists.
 */
export async function canRequestCode(userId: string, ip: string): Promise<boolean> {
  try {
    const newest = await prisma.emailVerifyToken.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (newest && Date.now() - newest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      return false;
    }
    const since = new Date(Date.now() - 3600_000);
    const recent = await prisma.emailVerifyToken.count({
      where: { ip, createdAt: { gte: since } },
    });
    return recent < VERIFY_IP_HOURLY_LIMIT;
  } catch {
    // A limiter we cannot read is a limiter that says no.
    return false;
  }
}

/**
 * Does `code` match the account's live verification code? On a match the row is
 * deleted (single use) and the account becomes verified in the same call, which is
 * the only place `verifyEmail` ever goes back to false. On a wrong guess the
 * attempt counter rises and the row is dropped once exhausted, so a guessed code
 * cannot be brute-forced.
 */
export async function verifyAndConsumeCode(
  userId: string,
  code: string
): Promise<boolean> {
  const clean = code.replace(/\s+/g, "");
  if (!/^[0-9]{6}$/.test(clean)) return false;
  try {
    const record = await prisma.emailVerifyToken.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!record) return false;
    if (record.code !== clean) {
      if (record.attempts + 1 >= MAX_ATTEMPTS) {
        await prisma.emailVerifyToken.delete({ where: { id: record.id } }).catch(() => {});
      } else {
        await prisma.emailVerifyToken
          .update({ where: { id: record.id }, data: { attempts: record.attempts + 1 } })
          .catch(() => {});
      }
      return false;
    }
    await prisma.$transaction([
      prisma.emailVerifyToken.delete({ where: { id: record.id } }),
      prisma.user.update({
        where: { id: userId },
        data: { emailVerified: new Date(), verifyEmail: false },
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}
