import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";

import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { prisma } from "@/lib/db";
import {
  isAllowedAvatarMime,
  isAllowedBackgroundMime,
  isAllowedCursorMime,
  isAllowedSoundMime,
} from "@/lib/media-kind";
import { overUploadQuota, safeExtFor, uploadDir } from "@/lib/storage";

export const runtime = "nodejs";

// Which mime types a declared upload slot accepts. The four profile slots reuse the
// allowlists in lib/media-kind.ts — the same predicates the apply-actions use — so
// the store step and the apply step cannot disagree about what an avatar is.
//
// A request with no `kind` (every current caller: the Files page and the four cards,
// which validate on the follow-up action) is the plain file-hosting flow and keeps
// arbitrary types, because "upload anything and share it" is the product promise.
// That is safe now for one specific reason: the bytes land outside public/
// (lib/storage.ts) and leave only through /api/files/[id] as an attachment, while
// /api/media refuses any mime off its inline list. Both of those gates, not this
// leniency, are what keep a stored .html from executing on our origin.
const SLOT_MIME: Record<string, (mime: string) => boolean> = {
  avatar: isAllowedAvatarMime,
  background: isAllowedBackgroundMime,
  cursor: isAllowedCursorMime,
  sound: isAllowedSoundMime,
};

export async function POST(request: Request) {
  // Existence-checked: inserting a FileAsset for a session whose user row was
  // deleted would die on the ownerId foreign key instead of answering 401.
  const userId = await getVerifiedSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const maxMb = Number(process.env.MAX_UPLOAD_MB ?? 25);
  const maxBytes = maxMb * 1024 * 1024;

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }
  if (file.size > maxBytes) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const slot = String(form.get("kind") ?? "file");
  const guard = SLOT_MIME[slot];
  if (guard && !guard(file.type || "")) {
    return NextResponse.json({ error: "unsupported" }, { status: 415 });
  }

  // Checked before the bytes are written, so a rejected upload cannot leave an
  // orphaned file on disk that no FileAsset row points at.
  if (await overUploadQuota(userId, file.size)) {
    return NextResponse.json({ error: "quota" }, { status: 507 });
  }

  const dir = uploadDir();
  await fs.mkdir(dir, { recursive: true });

  // Never trust the client filename for the on-disk path: generate a random key and
  // take only a cleaned extension from the name (safeExtFor collapses anything a
  // browser would execute, .html or .svg, onto .bin).
  const storageKey = `${randomUUID()}${safeExtFor(file.name)}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, storageKey), bytes);

  const isPrivate = form.get("isPrivate") === "on" || form.get("isPrivate") === "true";

  const created = await prisma.fileAsset.create({
    data: {
      storageKey,
      name: file.name.slice(0, 200),
      size: file.size,
      mime: file.type || "application/octet-stream",
      isPrivate,
      ownerId: userId,
    },
  });

  return NextResponse.json({ id: created.id });
}
