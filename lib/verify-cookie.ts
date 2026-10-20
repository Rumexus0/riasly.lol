// riasly — which account is mid-verification. SERVER ONLY.
//
// Why this exists: signup stops at "we mailed you a code", so `/verify` has to
// know *whose* code to ask for. Putting the address in the URL would leak it into
// browser history, the referer header and server logs; putting it in a form field
// the client controls would let anyone point the code step at somebody else's
// account. A short-lived signed cookie is the only place this fact can honestly
// live: it survives a refresh, it is sent only to us, and it is read by nobody but
// the server.
//
// What it is *not*: it is not a session and it grants nothing. `authorize()` is
// still the only thing that opens a login, and the code step still requires the
// 6 digits that arrived in the mailbox. The cookie only chooses which stage of the
// form the visitor sees.
//
// Never throws. When `AUTH_SECRET` is missing the cookie is treated as untrusted
// rather than as unsigned-but-fine: a value we cannot verify is a value we ignore.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const VERIFY_COOKIE = "riasly.verify";

// Long enough to finish reading an email and typing six digits on a second
// device, short enough that it is gone before it can become a stale surprise.
const MAX_AGE_S = 30 * 60;

/** Signature over a user id. Empty secret → no signature, and no gate either. */
function sign(userId: string): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(userId).digest("base64url");
}

/** Constant-time compare of two base64url strings that we produced ourselves. */
function matches(a: string, b: string): boolean {
  // TextEncoder rather than Buffer: `timingSafeEqual` wants a plain byte view, and
  // length is compared first so a differently-shaped signature never reaches it.
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  return timingSafeEqual(enc.encode(a), enc.encode(b));
}

/** Remember "this account just signed up" for the `/verify` form. */
export async function setVerifyCookie(userId: string): Promise<boolean> {
  const sig = sign(userId);
  if (!sig) return false;
  try {
    const store = await cookies();
    store.set(VERIFY_COOKIE, `${userId}.${sig}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE_S,
    });
    return true;
  } catch {
    // Called from a context where cookies are already flushed (a redirect): the
    // form then simply starts at the address stage, which is the safe default.
    return false;
  }
}

/** Whose verification is in progress, or null if that is not trustable. */
export async function readVerifyUserId(): Promise<string | null> {
  if (!process.env.AUTH_SECRET) return null;
  try {
    const store = await cookies();
    const raw = store.get(VERIFY_COOKIE)?.value;
    if (!raw) return null;
    const dot = raw.lastIndexOf(".");
    if (dot <= 0) return null;
    const userId = raw.slice(0, dot);
    const sig = raw.slice(dot + 1);
    const expected = sign(userId);
    if (!expected || !matches(sig, expected)) return null;
    return userId;
  } catch {
    return null;
  }
}

/** Drop it: verification is over, one way or the other. */
export async function clearVerifyCookie(): Promise<void> {
  try {
    const store = await cookies();
    store.delete(VERIFY_COOKIE);
  } catch {
    // Nothing to undo; the cookie expires on its own.
  }
}
