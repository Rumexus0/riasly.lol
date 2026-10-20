// riasly — email one-time codes for the 2FA login step. SERVER ONLY.
//
// The email arm of two-factor: a user who turned 2FA on can, at the login code
// step, ask for a 6-digit code by email instead of (or in addition to) their
// authenticator app. Codes are short-lived, single-use and attempt-capped, and are
// only ever issued to accounts with 2FA enabled and an email on file.
//
// Never throws: a delivery failure reads as false so the caller can show a generic
// "couldn't send" message. The plaintext code lives only for its short window and
// is deleted the moment it is used.

import { randomInt } from "node:crypto";
import { prisma } from "./db";
import { codeEmailHtml, sendMail } from "./mailer";

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

/** Mint a code, store it (replacing any earlier one) and email it. True on success. */
export async function issueLoginOtp(userId: string, email: string): Promise<boolean> {
  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + TTL_MS);
  try {
    await prisma.loginOtpToken.deleteMany({ where: { userId } });
    await prisma.loginOtpToken.create({ data: { userId, code, expiresAt } });
  } catch {
    return false;
  }
  const sent = await sendMail({
    to: email,
    subject: "Your riasly sign-in code",
    text: `Your sign-in code is ${code}. It expires in 10 minutes and works once.`,
    html: codeEmailHtml(code, "sign-in"),
  });
  if (!sent) {
    // Nothing was delivered, so drop the orphan code rather than leave it live.
    await prisma.loginOtpToken.deleteMany({ where: { userId } }).catch(() => {});
  }
  return sent;
}

/**
 * Does `code` match the user's live emailed code? On a match the row is deleted
 * (single use). On a wrong guess the attempt counter rises and the row is dropped
 * once exhausted, so a leaked code cannot be brute-forced.
 */
export async function verifyAndConsumeLoginOtp(
  userId: string,
  code: string
): Promise<boolean> {
  const clean = code.replace(/\s+/g, "");
  if (!/^[0-9]{6}$/.test(clean)) return false;
  try {
    const record = await prisma.loginOtpToken.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!record) return false;
    if (record.code !== clean) {
      if (record.attempts + 1 >= MAX_ATTEMPTS) {
        await prisma.loginOtpToken.delete({ where: { id: record.id } }).catch(() => {});
      } else {
        await prisma.loginOtpToken
          .update({ where: { id: record.id }, data: { attempts: record.attempts + 1 } })
          .catch(() => {});
      }
      return false;
    }
    await prisma.loginOtpToken.delete({ where: { id: record.id } });
    return true;
  } catch {
    return false;
  }
}
