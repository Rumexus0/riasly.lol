"use server";

import { z } from "zod";

import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { queueBadgeSync } from "@/lib/badge-sync";
import { prisma } from "@/lib/db";
import { revalidateDashboard } from "@/lib/revalidate";

export type RedeemResult = {
  ok: boolean;
  error?: "invalid" | "used" | "needLogin";
};

export async function redeemCode(
  _prev: RedeemResult | null,
  formData: FormData
): Promise<RedeemResult> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return { ok: false, error: "needLogin" };

  const parsed = z
    .object({ code: z.string().trim().min(3).max(64) })
    .safeParse({ code: formData.get("code") });
  if (!parsed.success) return { ok: false, error: "invalid" };

  const code = parsed.data.code.toUpperCase();
  const record = await prisma.redeemCode
    .findUnique({ where: { code } })
    .catch(() => null);

  if (!record) return { ok: false, error: "invalid" };
  if (record.usedById) return { ok: false, error: "used" };
  if (record.expiresAt && record.expiresAt < new Date())
    return { ok: false, error: "invalid" };

  try {
    await prisma.$transaction([
      prisma.redeemCode.update({
        where: { id: record.id },
        data: { usedById: userId },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { plan: "PREMIUM" },
      }),
    ]);
  } catch {
    return { ok: false, error: "used" };
  }

  // The plan flipped, so the badge rules must be re-read (Insider + Premium-era
  // effects). Fire-and-forget: a badge never blocks a redemption.
  queueBadgeSync(userId);
  await revalidateDashboard();
  return { ok: true };
}
