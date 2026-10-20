"use server";

import { randomInt } from "node:crypto";
import { z } from "zod";

import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { prisma } from "@/lib/db";
import { isValidHandleFormat } from "@/lib/handle";
import { codeEmailHtml, sendMail } from "@/lib/mailer";
import { revalidateDashboard, revalidateProfilePages } from "@/lib/revalidate";

// Server actions for the Account page's "Hesabını yönet" block. They follow the
// same discipline as app/actions/profile.ts: require a verified session, validate
// before touching the DB, then revalidate exactly the surfaces the edit changed.
// A handle change is the one action here that moves a public URL, so it revalidates
// BOTH the old and the new handle page (the old one should 404, the new one resolve).

export type AccountResult = {
  ok: boolean;
  error?: "invalid" | "taken" | "unauthorized" | "cooldown";
};

const str = (v: FormDataEntryValue | null): string =>
  typeof v === "string" ? v : "";

// Nickname storage budget: at most six, each at most 24 chars, kept as a single
// comma-separated column. Everything is trimmed and de-duplicated here so a
// crafted or sloppy submit cannot smuggle an over-long list into VARCHAR(190).
const NICK_MAX = 6;
const NICK_LEN = 24;

// Anti-squat: how long a user must wait between public-handle changes. First
// claim (no prior handle) is exempt, so a new account always gets its handle.
const HANDLE_CHANGE_COOLDOWN_DAYS = (() => {
  const raw = Number(process.env.HANDLE_CHANGE_COOLDOWN_DAYS);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 30;
})();

export async function changeHandle(formData: FormData): Promise<AccountResult> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const handle = str(formData.get("handle")).trim().toLowerCase();
  if (!isValidHandleFormat(handle)) return { ok: false, error: "invalid" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { handle: true, handleChangedAt: true },
  });
  if (!user) return { ok: false, error: "unauthorized" };
  const oldHandle = user.handle;

  // Same handle, no work (and no need to trip the availability check on ourselves).
  if (oldHandle === handle) return { ok: true };

  // Cooldown only applies once a handle already exists — the very first claim
  // (oldHandle null) never trips it, so a new account is not locked out.
  if (
    oldHandle &&
    HANDLE_CHANGE_COOLDOWN_DAYS > 0 &&
    user.handleChangedAt &&
    Date.now() - user.handleChangedAt.getTime() <
      HANDLE_CHANGE_COOLDOWN_DAYS * 86_400_000
  ) {
    return { ok: false, error: "cooldown" };
  }

  const clash = await prisma.user.findUnique({ where: { handle } });
  if (clash) return { ok: false, error: "taken" };

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { handle, handleChangedAt: new Date() },
    });
  } catch {
    // The @unique constraint is the real authority; a race lands here.
    return { ok: false, error: "taken" };
  }

  // Revalidate the moved URL (old → 404) and the new one. revalidateProfilePages
  // also bumps the dashboard, so the two calls cover every changed surface.
  await revalidateProfilePages(handle);
  if (oldHandle && oldHandle !== handle) await revalidateProfilePages(oldHandle);
  return { ok: true };
}

export async function changeDisplayName(
  formData: FormData
): Promise<AccountResult> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const name = str(formData.get("name")).trim();
  if (name.length < 2 || name.length > 40) return { ok: false, error: "invalid" };

  await prisma.user.update({ where: { id: userId }, data: { name } });
  await revalidateDashboard();
  return { ok: true };
}

export async function saveNicknames(formData: FormData): Promise<AccountResult> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const cleaned = str(formData.get("nicknames"))
    .split(",")
    .map((s) => s.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, NICK_LEN))
    .filter(Boolean);

  // De-dup, then cap the count so the joined value always fits the column.
  const unique = Array.from(new Set(cleaned)).slice(0, NICK_MAX);
  const nicknames = unique.length ? unique.join(", ") : null;

  await prisma.profile.upsert({
    where: { userId },
    create: { userId, nicknames },
    update: { nicknames },
  });
  await revalidateDashboard();
  return { ok: true };
}

// ---- Email change (mailed 6-digit code) ------------------------------------
// requestEmailChange mints a short code, stores it against the user and MAILES it
// to the new address via lib/mailer.ts — it is never returned to the client.
// confirmEmailChange applies the newest still-valid code for this user. The new
// address is validated for format and uniqueness up front.

export type EmailChangeResult = {
  ok: boolean;
  error?: "unauthorized" | "invalid" | "taken" | "invalidToken" | "emailFailed";
};

export async function requestEmailChange(
  _prev: EmailChangeResult | null,
  formData: FormData
): Promise<EmailChangeResult> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email().max(120) })
    .safeParse({ email: str(formData.get("email")) });
  if (!parsed.success) return { ok: false, error: "invalid" };

  const newEmail = parsed.data.email;
  const clash = await prisma.user.findUnique({ where: { email: newEmail } });
  if (clash) return { ok: false, error: "taken" };

  // A short, human-typeable 6-digit code, mailed to the NEW address (proof the
  // user controls it) and never handed to the client.
  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  // Replace any earlier pending request so only the newest code is live.
  await prisma.emailChangeToken.deleteMany({ where: { userId } });
  await prisma.emailChangeToken.create({
    data: { token: code, userId, newEmail, expiresAt },
  });

  const sent = await sendMail({
    to: newEmail,
    subject: "Confirm your new riasly email address",
    text: `Your confirmation code is ${code}. It expires in 15 minutes.`,
    html: codeEmailHtml(code, "email address change"),
  });
  if (!sent) {
    // Fail closed: the code exists but could not be delivered, so the user can
    // never confirm it. Clean up and report — do not pretend a code was sent.
    await prisma.emailChangeToken.deleteMany({ where: { userId } });
    return { ok: false, error: "emailFailed" };
  }
  return { ok: true };
}

export async function confirmEmailChange(
  _prev: EmailChangeResult | null,
  formData: FormData
): Promise<EmailChangeResult> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const token = str(formData.get("token")).trim();
  if (!token) return { ok: false, error: "invalidToken" };

  // The code is only unique per user now, so read THIS user's newest pending
  // request rather than looking the token up globally.
  const record = await prisma.emailChangeToken.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (!record || record.token !== token || record.expiresAt < new Date()) {
    return { ok: false, error: "invalidToken" };
  }

  await prisma.$transaction([
    // The mailed code just proved control of the new address, so the account is
    // verified by that proof and not by this form: leaving `emailVerified` empty
    // (or `verifyEmail` set) after a successful change would be a lie that locks
    // the user out at `authorize()`.
    prisma.user.update({
      where: { id: userId },
      data: { email: record.newEmail, emailVerified: new Date(), verifyEmail: false },
    }),
    prisma.emailChangeToken.delete({ where: { id: record.id } }),
  ]);
  await revalidateDashboard();
  return { ok: true };
}
