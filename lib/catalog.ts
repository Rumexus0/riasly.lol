// riasly — admin-added gallery templates. SERVER-ONLY (reads Prisma + disk).
//
// Split from lib/backgrounds.ts the same way lib/badge-sync.ts is split from
// lib/badges.ts: the code catalog stays importable from client components, and
// everything that knows database rows exist lives here. `getCatalogTemplates()`
// is the only merge point, so the gallery, the actions and the public profile all
// read one combined list instead of each re-inventing the join.
//
// An admin row owns an id, never a path: the three asset URLs derive from
// templateAssetPaths(id) exactly like a rendered seed does, so there is no second
// copy of a path to keep in sync and VARCHAR(191) can never be a problem.

import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import {
  templateAssetPaths,
  templates,
  type Template,
  type TemplateCategory,
} from "./backgrounds";
import { prisma } from "./db";

// Same shape scripts/build-templates.mjs accepts as --id, and a subset of
// TEMPLATE_ASSET_RE, so an id that can be created is an id the static handler
// serves. The "up-" prefix is what keeps admin rows out of the code catalog's
// namespace (sp-, ne-, dk-, st-, …) and out of its generated facts file.
export const CATALOG_ID_RE = /^up-[a-z0-9]{4,20}$/;

// Both directories sit under .cache (already gitignored) and are addressed
// relative to the project root, which is the process cwd for `next dev` and
// `next start` — and the same ROOT the generator resolves from its own file.
export const CATALOG_STAGING_DIR = path.join(process.cwd(), ".cache", "catalog-staging");
export const CATALOG_RENDER_DIR = path.join(process.cwd(), ".cache", "catalog-render");

// A 4K render of a short clip takes tens of seconds. Past this window a row still
// marked RENDERING has no live worker behind it (a crash, a dev-server restart),
// so it is flipped to FAILED and can be retried instead of hanging forever.
const RENDER_TIMEOUT_MS = 10 * 60 * 1000;

/** Ceiling for a catalog upload — deliberately its own knob, not MAX_UPLOAD_MB. */
export const catalogMaxMb = (): number => Number(process.env.CATALOG_MAX_MB ?? 40);

// What the generator's --render-one mode reports. Written by the child process,
// read by reconcileRendering(); the numbers are measurements, never typed by a
// human, which is what keeps a card's "4K · 5.5 MB" honest.
type RenderReport = {
  ok: boolean;
  error?: string;
  resolution?: string;
  sizeMb?: number;
  previewMb?: number;
  posterMb?: number;
  upscaled?: boolean;
  driftScore?: number;
  sourceResolution?: string;
  looping?: boolean;
  motion?: string | null;
  at?: string;
};

export type CatalogPending = {
  id: string;
  name: string;
  status: "RENDERING" | "FAILED";
  failure: string | null;
  /** Poster path, so a pending card shows the frame as soon as it exists. */
  thumb: string;
};

/**
 * Fresh id for a staged upload. Called by the intake route, before the file is
 * written, because the staged filename is derived from it.
 */
export async function newCatalogId(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = `up-${randomBytes(5).toString("hex").slice(0, 8)}`;
    if (!CATALOG_ID_RE.test(id)) continue;
    if (templates.some((tpl) => tpl.id === id)) continue;
    const taken = await prisma.catalogTemplate
      .findUnique({ where: { id }, select: { id: true } })
      .catch(() => null);
    if (!taken) return id;
  }
  // Eight collisions on an 8-hex-char suffix would mean the table is enormous;
  // say so rather than hand back an id that overwrites somebody's template.
  throw new Error("could not allocate a catalog template id");
}

/**
 * The staged upload for one id, found by prefix rather than passed back by the
 * client: nothing that reaches the filesystem may come from the browser.
 */
export async function findStagedSource(
  id: string
): Promise<{ name: string; bytes: number } | null> {
  if (!CATALOG_ID_RE.test(id)) return null;
  const entries = await fs.readdir(CATALOG_STAGING_DIR).catch(() => [] as string[]);
  const name = entries.find((e) => e.startsWith(`${id}.`) && e !== id);
  if (!name) return null;
  const stat = await fs.stat(path.join(CATALOG_STAGING_DIR, name)).catch(() => null);
  if (!stat || !stat.isFile() || stat.size <= 0) return null;
  return { name, bytes: stat.size };
}

function rowToTemplate(row: {
  id: string;
  name: string;
  author: string;
  category: string;
  tags: string;
  accent: string | null;
  resolution: string | null;
  sizeMb: number | null;
  previewMb: number | null;
  posterMb: number | null;
  upscaled: boolean;
  createdAt: Date;
}): Template {
  const p = templateAssetPaths(row.id);
  return {
    id: row.id,
    name: row.name,
    author: row.author,
    category: row.category as TemplateCategory,
    tags: row.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 6),
    kind: "video", // a READY row exists precisely because its loop was rendered
    url: p.url,
    thumb: p.thumb,
    preview: p.preview,
    // Points at itself: the artwork was never hotlinked, so getTemplateByUrl's
    // four-way match still resolves this row for a profile that stores any of
    // its own URLs.
    source: { url: p.url, thumb: p.thumb },
    accent: row.accent ?? undefined,
    resolution: row.resolution ?? undefined,
    sizeMb: row.sizeMb ?? undefined,
    // Measured by the renderer: true when the uploaded pixels were under UHD and
    // had to be scaled up, which is the same honest note a stock loop prints.
    upscaled: row.upscaled,
    // A placeholder, never what a card renders: the row's own `usage` column was
    // a tally of apply *events*, which is not "how many profiles use this now".
    // getCatalogTemplates() overwrites this with the measured live count.
    usage: 0,
    createdAt: row.createdAt.toISOString(),
  };
}

/** READY rows in catalog shape, in the order the gallery expects. */
export async function readyCatalogTemplates(): Promise<Template[]> {
  const rows = await prisma.catalogTemplate
    .findMany({ where: { status: "READY" }, orderBy: { createdAt: "asc" } })
    .catch(() => []);
  return rows.map(rowToTemplate);
}

/**
 * The whole visible gallery, with every `usage` figure measured.
 *
 * A card's "N uses" used to print a number invented in lib/backgrounds.ts. It now
 * answers a real question — how many profiles are running this template as their
 * background or avatar *right now* — from one grouped read over Profile. Applying
 * and un-applying are therefore both reflected, which an increment-only counter
 * never was, and the same rule covers a code seed and an admin row because both
 * are matched by the URL their profile stores.
 */
export async function getCatalogTemplates(): Promise<Template[]> {
  // Independent reads, so they run together: the group does not need the admin
  // rows, it only needs the merged list to be resolved against afterwards.
  const [added, groups] = await Promise.all([
    readyCatalogTemplates(),
    profileMediaGroups(),
  ]);
  const list = [...templates, ...added];
  const counts = usageCountsFor(list, groups);
  return list.map((tpl) => ({ ...tpl, usage: counts[tpl.id] ?? 0 }));
}

// One row per distinct (background, avatar) pair a profile actually stores, with
// how many profiles sit on it. Unreachable database reads answer an empty list,
// so a gallery load degrades to honest zeros instead of failing (same discipline
// as getStats in lib/stats.ts).
type MediaGroup = { bannerUrl: string | null; avatarUrl: string | null; n: number };

async function profileMediaGroups(): Promise<MediaGroup[]> {
  const rows = await prisma.profile
    .groupBy({ by: ["bannerUrl", "avatarUrl"], _count: { _all: true } })
    .catch(() => []);
  return rows
    .map((r) => ({
      bannerUrl: r.bannerUrl ?? null,
      avatarUrl: r.avatarUrl ?? null,
      n: r._count._all,
    }))
    .filter((r) => r.n > 0);
}

/**
 * Fold those groups into per-template counts.
 *
 * The match is the same four URLs getCatalogTemplateByUrl already answers with
 * (rendered file, poster, external source artwork, source thumb), so a profile
 * that predates its template's local render still counts for that template.
 * Within one group the ids go through a Set: a profile whose banner and avatar
 * both come from template A is one use of A, not two, while a profile pairing
 * A's loop with B's poster is a genuine use of both.
 */
function usageCountsFor(list: Template[], groups: MediaGroup[]): Record<string, number> {
  const byUrl = new Map<string, string>();
  for (const tpl of list) {
    for (const url of [tpl.url, tpl.thumb, tpl.source.url, tpl.source.thumb]) {
      if (url && !byUrl.has(url)) byUrl.set(url, tpl.id);
    }
  }
  const out: Record<string, number> = {};
  if (byUrl.size === 0) return out;
  for (const group of groups) {
    const ids = new Set<string>();
    if (group.bannerUrl) {
      const id = byUrl.get(group.bannerUrl);
      if (id) ids.add(id);
    }
    if (group.avatarUrl) {
      const id = byUrl.get(group.avatarUrl);
      if (id) ids.add(id);
    }
    for (const id of ids) out[id] = (out[id] ?? 0) + group.n;
  }
  return out;
}

export async function getCatalogTemplateById(
  id: string
): Promise<Template | undefined> {
  const code = templates.find((tpl) => tpl.id === id);
  if (code) return code;
  if (!CATALOG_ID_RE.test(id)) return undefined;
  // Any existing row answers here, READY or not: hiding a template is a gallery
  // filter, and an admin may legitimately curate a card while its render is in
  // flight. The lookup is a guard against a made-up key, not a status check.
  const row = await prisma.catalogTemplate
    .findUnique({ where: { id } })
    .catch(() => null);
  return row ? rowToTemplate(row) : undefined;
}

/**
 * Resolve a stored bannerUrl / avatarUrl back to its catalog entry.
 *
 * The code catalog is searched first and the database is only consulted on a
 * miss, so the public profile keeps the single-query render lib/badge-sync.ts
 * documents for every one of the 65 curated templates. Only an admin-added asset
 * costs the extra read, and only on the server (components/ProfileView.tsx).
 */
export async function getCatalogTemplateByUrl(
  url: string | null | undefined
): Promise<Template | undefined> {
  if (!url) return undefined;
  const code = templates.find(
    (tpl) =>
      tpl.url === url ||
      tpl.thumb === url ||
      tpl.source.url === url ||
      tpl.source.thumb === url
  );
  if (code) return code;

  const id = /^\/templates\/([a-z0-9][a-z0-9.-]*)\.(?:mp4|jpg)$/i.exec(url)?.[1] ?? "";
  if (!CATALOG_ID_RE.test(id)) return undefined;
  const row = await prisma.catalogTemplate
    .findUnique({ where: { id } })
    .catch(() => null);
  return row ? rowToTemplate(row) : undefined;
}

/** Rows an admin needs to see progress on: encoding, or failed with a reason. */
export async function pendingCatalogTemplates(): Promise<CatalogPending[]> {
  const rows = await prisma.catalogTemplate
    .findMany({
      where: { status: { in: ["RENDERING", "FAILED"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, status: true, failure: true },
    })
    .catch(() => []);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status === "READY" ? "FAILED" : r.status,
    failure: r.failure,
    thumb: templateAssetPaths(r.id).thumb,
  }));
}

async function readReport(id: string): Promise<RenderReport | null> {
  if (!CATALOG_ID_RE.test(id)) return null;
  const raw = await fs
    .readFile(path.join(CATALOG_RENDER_DIR, `${id}.json`), "utf8")
    .catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RenderReport;
  } catch {
    return null;
  }
}

/** True when every file the row claims to serve is actually on disk. */
async function missingAssets(id: string): Promise<string[]> {
  const p = templateAssetPaths(id);
  const pairs: Array<[string, string]> = [
    ["wall", p.url],
    ["proxy", p.preview],
    ["poster", p.thumb],
  ];
  const out: string[] = [];
  for (const [label, rel] of pairs) {
    const file = path.join(process.cwd(), "public", rel.replace(/^\//, ""));
    const stat = await fs.stat(file).catch(() => null);
    if (!stat || stat.size <= 0) out.push(label);
  }
  return out;
}

async function settle(
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  await prisma.catalogTemplate
    .update({ where: { id }, data })
    .catch(() => null);
}

/**
 * Land the rows that have stopped being in-flight, and re-check the ones that
 * already landed.
 *
 * Called from the admin's own gallery load and from the status poll — never from
 * a visitor's render, so the disk checks below are bounded by one admin.
 *   RENDERING + a successful report + all three files  -> READY
 *   RENDERING + a failed report                        -> FAILED with that reason
 *   RENDERING + nothing after RENDER_TIMEOUT_MS        -> FAILED (worker is gone)
 *   READY but its files vanished (a fresh environment)  -> FAILED, so the card
 *     cannot offer a background that would 404
 */
export async function reconcileRendering(): Promise<number> {
  const rows = await prisma.catalogTemplate
    .findMany({
      where: { status: { in: ["RENDERING", "READY"] } },
      select: { id: true, status: true, updatedAt: true },
    })
    .catch(() => []);
  if (rows.length === 0) return 0;

  let changed = 0;
  for (const row of rows) {
    if (row.status === "READY") {
      const missing = await missingAssets(row.id);
      if (missing.length) {
        await settle(row.id, {
          status: "FAILED",
          failure: `render files are missing on disk (${missing.join(", ")})`,
        });
        changed++;
      }
      continue;
    }

    const report = await readReport(row.id);
    if (report) {
      if (report.ok) {
        const missing = await missingAssets(row.id);
        if (missing.length === 0) {
          await settle(row.id, {
            status: "READY",
            resolution: report.resolution ?? null,
            sizeMb: report.sizeMb ?? null,
            previewMb: report.previewMb ?? null,
            posterMb: report.posterMb ?? null,
            upscaled: report.upscaled ?? false,
            driftScore: report.driftScore ?? null,
            failure: null,
          });
        } else {
          await settle(row.id, {
            status: "FAILED",
            failure: `render reported success but ${missing.join(", ")} is missing`,
          });
        }
      } else {
        await settle(row.id, {
          status: "FAILED",
          failure: report.error ?? "the renderer failed without a reason",
        });
      }
      changed++;
      continue;
    }

    // No report yet. A real render is well inside the window; past it there is no
    // child process left to write one.
    if (Date.now() - row.updatedAt.getTime() > RENDER_TIMEOUT_MS) {
      await settle(row.id, {
        status: "FAILED",
        failure: "render never finished (the encoder did not report back)",
      });
      changed++;
    }
  }
  return changed;
}
