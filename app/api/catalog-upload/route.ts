import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";

import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { isAdminUserId } from "@/lib/admin";
import {
  BG_ALLOWED_MIMES,
  extForMime,
} from "@/lib/media-kind";
import {
  CATALOG_STAGING_DIR,
  catalogMaxMb,
  newCatalogId,
} from "@/lib/catalog";

export const runtime = "nodejs";

// What an admin may hand the renderer: the looping background set the profile
// already accepts, plus the two classic stills (a still becomes a motion wall via
// the ken-burns path). AVATAR_ALLOWED_MIMES is exactly this union, but spelled
// out here so widening avatars can never quietly widen the catalog.
const CATALOG_MIMES = new Set<string>([
  ...BG_ALLOWED_MIMES,
  "image/png",
  "image/jpeg",
]);

// Intake for admin-added gallery templates. Its own route (not a server action)
// for the same reason /api/upload is one: an action caps the request body, and a
// 4K source clip is bigger than that cap. Deliberately writes to
// .cache/catalog-staging and never to uploadDir() / FileAsset — those are the
// user's own media, reachable by deleteFile / releaseUnusedMedia. An admin asset
// must not be unlinkable by a profile action, so it never enters that namespace.
export async function POST(request: Request) {
  const userId = await getVerifiedSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Admin-ness is re-checked here, not assumed from the panel being visible.
  if (!(await isAdminUserId(userId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const maxBytes = catalogMaxMb() * 1024 * 1024;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }
  if (file.size > maxBytes) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const mime = file.type || "";
  if (!CATALOG_MIMES.has(mime)) {
    return NextResponse.json({ error: "unsupported" }, { status: 415 });
  }
  // Extension always from the mime, never from the client filename: the staged
  // basename is what --render-one later resolves inside the staging dir, and the
  // looping/still branch is chosen from this real extension.
  const ext = extForMime(mime);
  if (!ext) {
    return NextResponse.json({ error: "unsupported" }, { status: 415 });
  }

  // Allocate the id first — the staged filename is derived from it, and the row
  // that the action inserts uses exactly this id.
  const id = await newCatalogId();

  await fs.mkdir(CATALOG_STAGING_DIR, { recursive: true });
  const bytes = new Uint8Array(await file.arrayBuffer());
  await fs.writeFile(path.join(CATALOG_STAGING_DIR, `${id}${ext}`), bytes);

  return NextResponse.json({ id, name: file.name.slice(0, 200), mime, bytes: file.size });
}
