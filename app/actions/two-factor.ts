"use server";

import QRCode from "qrcode";

import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { prisma } from "@/lib/db";
import { revalidateDashboard } from "@/lib/revalidate";
import {
  buildOtpauthUri,
  generateBackupCodes,
  matchBackupCode,
  newTotpSecret,
  verifyTotp,
} from "@/lib/two-factor";

// The Account page's "Çok faktörlü kimlik doğrulama" control. Three steps:
//   start   → mint a secret + otpauth URI + QR data URL (nothing persisted yet),
//   confirm → prove the user can generate a code for that secret, THEN store it
//             and hand back one-time backup codes,
//   disable → prove a current code (or backup), then clear everything.
// The secret is returned to the client between start and confirm rather than
// stored server-side: it is already shown on screen for manual entry, and an
// unconfirmed secret must never be persisted (a half-finished setup would leave
// a secret nobody holds).

export type TwoFactorStartResult = {
  ok: boolean;
  error?: "unauthorized";
  secret?: string;
  otpauthUri?: string;
  qrDataUrl?: string;
};

export type TwoFactorResult = {
  ok: boolean;
  error?: "unauthorized" | "invalid";
  backupCodes?: string[];
};

export async function startTwoFactor(): Promise<TwoFactorStartResult> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, handle: true },
  });
  if (!user) return { ok: false, error: "unauthorized" };

  const secret = newTotpSecret();
  const label = user.email ?? user.handle ?? userId;
  const otpauthUri = await buildOtpauthUri(secret, label);
  // A data URL keeps the QR entirely self-contained — no third-party QR service
  // ever sees the account's otpauth URI (which contains the secret).
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 240 });

  return { ok: true, secret, otpauthUri, qrDataUrl };
}

export async function confirmTwoFactor(input: {
  code: string;
  secret: string;
}): Promise<TwoFactorResult> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const secret = typeof input.secret === "string" ? input.secret : "";
  const code = typeof input.code === "string" ? input.code : "";
  if (!secret || !(await verifyTotp(secret, code))) {
    return { ok: false, error: "invalid" };
  }

  const { plain, hashed } = await generateBackupCodes();
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: secret,
      twoFactorEnabled: true,
      twoFactorBackup: JSON.stringify(hashed),
    },
  });
  revalidateDashboard();
  // The only time the plaintext backup codes exist anywhere — the client shows
  // them once and the server keeps nothing but their hashes.
  return { ok: true, backupCodes: plain };
}

export async function disableTwoFactor(input: {
  code: string;
}): Promise<TwoFactorResult> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true, twoFactorBackup: true },
  });
  if (!user?.twoFactorSecret) return { ok: false, error: "invalid" };

  const code = typeof input.code === "string" ? input.code : "";
  const validTotp = await verifyTotp(user.twoFactorSecret, code);
  const matched = validTotp ? null : await matchBackupCode(user.twoFactorBackup, code);
  if (!validTotp && !matched) return { ok: false, error: "invalid" };

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: null, twoFactorEnabled: false, twoFactorBackup: null },
  });
  revalidateDashboard();
  return { ok: true };
}
