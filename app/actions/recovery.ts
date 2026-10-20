"use server";

import crypto from "node:crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";

export type RequestResetResult = {
  ok: boolean;
  error?: "invalidEmail" | "noAccount";
  token?: string;
};

export async function requestPasswordReset(
  _prev: RequestResetResult | null,
  formData: FormData
): Promise<RequestResetResult> {
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email() })
    .safeParse({ email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: "invalidEmail" };

  const user = await prisma.user
    .findUnique({ where: { email: parsed.data.email } })
    .catch(() => null);

  // Do not leak whether the address exists — always return ok.
  if (!user) return { ok: true };

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.passwordResetToken.create({
    data: { token, userId: user.id, expiresAt },
  });

  return { ok: true, token };
}

export type ResetResult = { ok: boolean; error?: "invalidToken" | "invalid" };

export async function completePasswordReset(
  token: string,
  _prev: ResetResult | null,
  formData: FormData
): Promise<ResetResult> {
  const parsed = z
    .object({ password: z.string().min(8).max(100) })
    .safeParse({ password: formData.get("password") });
  if (!parsed.success) return { ok: false, error: "invalid" };

  const record = await prisma.passwordResetToken
    .findUnique({ where: { token } })
    .catch(() => null);

  if (!record || record.expiresAt < new Date())
    return { ok: false, error: "invalidToken" };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.delete({ where: { id: record.id } }),
  ]);

  return { ok: true };
}
