"use server";

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";

import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { isAdminUserId } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { revalidateDashboard, revalidateProfilePages } from "@/lib/revalidate";
import { templateAssetPaths, templateCategories } from "@/lib/backgrounds";
import {
  CATALOG_ID_RE,
  CATALOG_RENDER_DIR,
  CATALOG_STAGING_DIR,
  findStagedSource,
  pendingCatalogTemplates,
  reconcileRendering,
  type CatalogPending,
} from "@/lib/catalog";

// Own result type: the codes here are about a render pipeline, not a profile
// edit, so they live beside — not inside — profile.ts's ActionResult union.
export type CatalogResult = {
  ok: boolean;
  error?:
    | "invalid"
    | "unauthorized"
    | "forbidden"
    | "busy" // a render is already in flight; one at a time is a hard rule
    | "missing" // the staged upload is gone (expired / never landed)
    | "unsupported"
    | "inuse" // a profile still applies this template's artwork
    | "dberror"; // a DB read failed during delete (must NOT read as "in use")
  data?: { id?: string; pending?: CatalogPending[] };
  count?: number; // how many profiles reference the template (with "inuse")
};

// Same local guard as app/actions/templates.ts: a visible button is a
// convenience, the permission is re-checked inside every action.
async function adminGuard(): Promise<
  { ok: true; userId: string } | { ok: false; error: "unauthorized" | "forbidden" }
> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return { ok: false, error: "unauthorized" };
  return (await isAdminUserId(userId))
    ? { ok: true, userId }
    : { ok: false, error: "forbidden" };
}

// FormData.get() is null for an absent field, but zod's optional() only covers
// undefined — normalise through this so an empty input never breaks validation.
const str = (v: FormDataEntryValue | null): string =>
  typeof v === "string" ? v : "";

const ACCENT_RE = /^#[0-9a-fA-F]{6}$/;
const LOOP_EXTS = new Set([".mp4", ".webm", ".mov", ".gif"]);

// Informational mime, derived from the trusted on-disk extension rather than
// echoed back from the client. Not used for serving (that is the rendered triple).
const MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".gif": "image/gif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, "scripts", "build-templates.mjs");

// One 4K render at a time. Parallel jobs are what exhausted RAM in a previous
// rollout, so the count is checked before every spawn and the row's own status is
// the lock (no separate table). The reconcile timeout is the leak-breaker if a
// child dies without ever writing a report.
async function renderInFlight(): Promise<boolean> {
  const n = await prisma.catalogTemplate
    .count({ where: { status: "RENDERING" } })
    .catch(() => 1);
  return n >= 1;
}

// Detached so it survives the request that started it; argv as an array, never a
// shell string. stdio ignored — the child reports through its sidecar file, not a
// pipe nobody is reading. cwd is ROOT because the script resolves its output
// directory from its own location and expects to find .cache relative to the app.
function spawnRender(id: string, stagedName: string): void {
  const child = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      SCRIPT,
      "--render-one",
      "--id",
      id,
      "--src",
      stagedName,
      "--motion",
      "ken",
    ],
    { detached: true, windowsHide: true, stdio: "ignore", cwd: ROOT }
  );
  child.unref();
}

/**
 * Turn a staged upload (from /api/catalog-upload) into a rendered template.
 * Inserts a RENDERING row, kicks off the encoder, and returns without waiting —
 * the admin watches progress via the status poll.
 */
export async function createCatalogTemplate(
  formData: FormData
): Promise<CatalogResult> {
  const guard = await adminGuard();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = z
    .object({
      id: z.string().regex(CATALOG_ID_RE),
      name: z.string().trim().min(1).max(60),
      category: z
        .string()
        .refine((c): c is (typeof templateCategories)[number] =>
          (templateCategories as string[]).includes(c)
        ),
      author: z.string().trim().max(40).optional().default(""),
      tagsRaw: z.string().max(200).optional().default(""),
      accent: z.string().trim().optional().default(""),
    })
    .safeParse({
      id: str(formData.get("id")),
      name: str(formData.get("name")),
      category: str(formData.get("category")),
      author: str(formData.get("author")),
      tagsRaw: str(formData.get("tags")),
      accent: str(formData.get("accent")),
    });
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { id, name, category } = parsed.data;

  // accent is optional, but when present it must be a real 6-digit hex: it is
  // interpolated into an inline linear-gradient on the card.
  const accentRaw = parsed.data.accent;
  if (accentRaw && !ACCENT_RE.test(accentRaw)) return { ok: false, error: "invalid" };

  // tags: <= 6 entries, each <= 24 chars, joined back for storage.
  const tags = parsed.data.tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6);
  if (tags.some((t) => t.length > 24)) return { ok: false, error: "invalid" };

  // author falls back to the admin's handle, never to a client guess.
  let author = parsed.data.author;
  if (!author) {
    const admin = await prisma.user
      .findUnique({ where: { id: guard.userId }, select: { handle: true } })
      .catch(() => null);
    author = admin?.handle ?? "riasly";
  }

  if (await renderInFlight()) return { ok: false, error: "busy" };

  // The upload must still be on disk; only its on-disk bytes and extension are
  // trusted, so re-read them here instead of taking the client's numbers.
  const staged = await findStagedSource(id);
  if (!staged) return { ok: false, error: "missing" };
  const ext = path.extname(staged.name).toLowerCase();
  const looping = LOOP_EXTS.has(ext);

  try {
    await prisma.catalogTemplate.create({
      data: {
        id,
        name,
        author,
        category,
        tags: tags.join(","),
        accent: accentRaw || null,
        sourceKind: looping ? "video" : "still",
        sourceMime: MIME_BY_EXT[ext] ?? "application/octet-stream",
        sourceBytes: staged.bytes,
        status: "RENDERING",
        createdById: guard.userId,
      },
    });
  } catch {
    // A duplicate id (row already exists) is the only realistic failure.
    return { ok: false, error: "invalid" };
  }

  try {
    spawnRender(id, staged.name);
  } catch {
    await prisma.catalogTemplate
      .update({ where: { id }, data: { status: "FAILED", failure: "could not start the encoder" } })
      .catch(() => null);
    return { ok: false, error: "unsupported" };
  }

  await revalidateDashboard();
  return { ok: true, data: { id } };
}

/**
 * Re-run a FAILED render. Only FAILED rows are retryable, and only while the
 * staged source survives — otherwise the admin re-uploads.
 */
export async function retryCatalogTemplate(id: string): Promise<CatalogResult> {
  const guard = await adminGuard();
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!CATALOG_ID_RE.test(id)) return { ok: false, error: "invalid" };

  const row = await prisma.catalogTemplate
    .findUnique({ where: { id }, select: { status: true } })
    .catch(() => null);
  if (!row) return { ok: false, error: "missing" };
  if (row.status !== "FAILED") return { ok: false, error: "invalid" };

  if (await renderInFlight()) return { ok: false, error: "busy" };

  const staged = await findStagedSource(id);
  if (!staged) return { ok: false, error: "missing" };

  // Reset first, so the row is RENDERING (single-flight) and its updatedAt clock
  // restarts the timeout window.
  await prisma.catalogTemplate
    .update({ where: { id }, data: { status: "RENDERING", failure: null, updatedAt: new Date() } })
    .catch(() => null);

  try {
    spawnRender(id, staged.name);
  } catch {
    await prisma.catalogTemplate
      .update({ where: { id }, data: { status: "FAILED", failure: "could not start the encoder" } })
      .catch(() => null);
    return { ok: false, error: "unsupported" };
  }

  await revalidateDashboard();
  return { ok: true, data: { id } };
}

/**
 * Hard-delete an admin template: the row, its rendered triple, its sidecar and
 * any leftover staging. Refused while a profile still shows the artwork — hiding
 * (reversible) stays the default, this is the deliberate second step.
 */
export async function deleteCatalogTemplate(
  id: string,
  force = false
): Promise<CatalogResult> {
  const guard = await adminGuard();
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!CATALOG_ID_RE.test(id)) return { ok: false, error: "invalid" };

  const row = await prisma.catalogTemplate
    .findUnique({ where: { id }, select: { id: true } })
    .catch(() => null);
  if (!row) return { ok: false, error: "missing" };

  const p = templateAssetPaths(id);
  // A profile may store the wall, the poster (avatar-from-poster) or the proxy.
  // Any live reference means the files are still in use. A failed read is a
  // distinct "dberror" — the old .catch(() => 1) turned every outage into a
  // misleading "in use" refusal.
  const urls = [p.url, p.thumb, p.preview];
  const refs = await prisma.profile
    .findMany({
      where: { OR: [{ bannerUrl: { in: urls } }, { avatarUrl: { in: urls } }] },
      select: { user: { select: { handle: true } } },
    })
    .catch(() => null);
  if (!refs) return { ok: false, error: "dberror" };
  if (refs.length > 0 && !force) {
    return { ok: false, error: "inuse", count: refs.length };
  }
  // Force: clear the reference on each profile — only the field that actually
  // points at this template, so a profile using another banner is untouched —
  // BEFORE unlinking, so no public page is left rendering deleted bytes.
  if (refs.length > 0) {
    await prisma.profile.updateMany({
      where: { bannerUrl: { in: urls } },
      data: { bannerUrl: null },
    });
    await prisma.profile.updateMany({
      where: { avatarUrl: { in: urls } },
      data: { avatarUrl: null },
    });
  }

  // Files are removed before the row: if an unlink throws the row stays and the
  // admin can retry, rather than losing the record of orphaned bytes.
  const publicDir = path.join(ROOT, "public");
  await fs
    .rm(path.join(publicDir, p.url.replace(/^\//, "")), { force: true })
    .catch(() => {});
  await fs
    .rm(path.join(publicDir, p.preview.replace(/^\//, "")), { force: true })
    .catch(() => {});
  await fs
    .rm(path.join(publicDir, p.thumb.replace(/^\//, "")), { force: true })
    .catch(() => {});
  await fs.rm(path.join(CATALOG_RENDER_DIR, `${id}.json`), { force: true }).catch(() => {});

  const staged = await findStagedSource(id);
  if (staged) {
    await fs.rm(path.join(CATALOG_STAGING_DIR, staged.name), { force: true }).catch(() => {});
  }

  // No FK between these, so clear the gallery-hidden marker too (deleteMany: a
  // template that was never hidden must not turn the delete into a P2025).
  await prisma.hiddenTemplate.deleteMany({ where: { templateId: id } }).catch(() => {});
  await prisma.catalogTemplate.delete({ where: { id } }).catch(() => null);

  await revalidateDashboard();
  // Every profile that lost its background must re-render its public page now.
  for (const r of refs) await revalidateProfilePages(r.user?.handle);
  return { ok: true, data: { id } };
}

/**
 * Land any finished renders and hand back what is still pending. Called by the
 * admin status poll (never by a visitor's render), so the disk checks are bounded.
 */
export async function refreshCatalogStatus(): Promise<CatalogResult> {
  const guard = await adminGuard();
  if (!guard.ok) return { ok: false, error: guard.error };

  await reconcileRendering();
  const pending = await pendingCatalogTemplates();
  return { ok: true, data: { pending } };
}
