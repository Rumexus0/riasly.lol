// riasly — where user bytes live on disk, and what may be written there. SERVER ONLY.
//
// Why the directory is NOT under public/: Next.js serves every file inside public/
// as a static asset with no authentication and no middleware hook, so a stored
// upload used to be readable as `/uploads/<storageKey>` — which silently defeated
// FileAsset.isPrivate (the guard lives in /api/files/[id], not in the static
// server) and turned an authenticated upload of `evil.html` into same-origin script
// execution on the visitor's session. Nothing in the app ever linked `/uploads/`
// (every read goes through /api/files or /api/media), so moving the bytes out of
// the web root costs nothing and removes the whole class.
//
// The same reasoning already governed admin catalog assets — see the comment in
// app/api/catalog-upload/route.ts, which writes to .cache/catalog-staging for
// exactly this reason. This module generalises it to user uploads.
//
// One function per fact: before this file existed the `UPLOAD_DIR ?? default`
// literal was duplicated in four places, so changing the location meant finding
// every one of them and hoping none was missed.

import path from "node:path";
import { prisma } from "./db";

/** Root for uploaded user bytes. Always resolved by the caller that touches disk. */
export function uploadDir(): string {
  return process.env.UPLOAD_DIR ?? "./storage/uploads";
}

/**
 * Extensions a browser would execute or render instead of download. The stored key
 * keeps a real (harmless) extension so `ensureMediaKey` and the media-kind matchers
 * keep working, but anything on this list is rewritten to `.bin`: the download
 * feature survives (the bytes and the DB mime are untouched), the same-origin
 * interpret-as-code path does not.
 */
const WEB_EXECUTABLE_EXT = new Set([
  "html", "htm", "xhtml", "html5", "shtml", "svg", "xml", "xsl",
  "js", "mjs", "cjs", "jsx", "css", "php", "php3", "php4", "php5", "phtml",
  "py", "pl", "pm", "rb", "sh", "bash", "zsh", "bat", "cmd", "com", "exe",
  "dll", "msi", "scr", "vbs", "vbe", "jsm", "jsp", "asp", "aspx", "cfm", "swf",
]);

/**
 * Cleaned extension for a storage key, derived from the *client* filename — which is
 * display metadata, never a path. Keeps the existing sanitisation (alnum only, max
 * 10 chars) and collapses anything web-executable onto `.bin`.
 */
export function safeExtFor(clientName: string): string {
  const raw = path.extname(clientName || "").slice(0, 11).replace(/[^.a-zA-Z0-9]/g, "");
  const ext = raw.replace(/^\./, "").toLowerCase();
  if (!ext) return "";
  return WEB_EXECUTABLE_EXT.has(ext) ? ".bin" : `.${ext}`;
}

/**
 * Per-account storage ceiling in bytes, from FILE_QUOTA_GB (default 5, matching the
 * "5 GB file hosting" line on the pricing card). Premium is unlimited because the
 * same card promises "Unlimited file hosting" — reading the promise out of the
 * dictionary instead of the database is how a copy change quietly becomes a bug.
 * Set FILE_QUOTA_GB=0 to disable the check entirely.
 */
export function fileQuotaBytes(plan: string): number | null {
  if (plan === "PREMIUM") return null;
  const gb = Number(process.env.FILE_QUOTA_GB ?? 5);
  if (!Number.isFinite(gb) || gb <= 0) return null;
  return gb * 1024 * 1024 * 1024;
}

/**
 * True when storing `incomingBytes` more would push the account over its ceiling.
 * Deliberately fails open on a database error: an unreachable aggregate must not
 * block a paying user's upload, and the size cap in the route still bounds the
 * single write. Never throws.
 */
export async function overUploadQuota(
  ownerId: string,
  incomingBytes: number
): Promise<boolean> {
  try {
    const account = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { plan: true },
    });
    if (!account) return true; // owner gone: nothing may be stored for them
    const quota = fileQuotaBytes(account.plan);
    if (quota === null) return false;
    const used = await prisma.fileAsset.aggregate({
      where: { ownerId },
      _sum: { size: true },
    });
    return (used._sum.size ?? 0) + incomingBytes > quota;
  } catch {
    return false;
  }
}
