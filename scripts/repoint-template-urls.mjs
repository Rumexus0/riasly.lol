// riasly — legacy template URL repointer (optional, part of the 4K rollout).
//
// Nothing here is needed for correctness. lib/template-recipes.ts matches a
// profile's stored URL against Template.url, Template.thumb *and*
// Template.source.url / source.thumb, so a row that still holds the old absolute
// Wallhaven or Mixkit address keeps its drift, its effect layers and its credit
// exactly as before. That is the real back-compat fix, and it is why no migration
// ships with the renderer.
//
// What this script adds is the second step: it moves such a row onto the local
// render, so the profile streams a file we serve instead of a third-party CDN.
// Run it in any environment where profiles were created before the renders
// existed — it is deliberately not part of `templates:build`, because it touches
// other people's pages.
//
// Safe by default and idempotent: it prints every candidate change and writes
// nothing unless --apply is passed. Only templates that have a fact row (so: real
// files on disk) are candidates; anything else keeps the URL that currently works.
// Re-running is a no-op, because a repointed row already stores the new path.
//
// Usage:
//   npm run templates:repoint            # report only
//   npm run templates:repoint -- --apply # rewrite Profile.bannerUrl / avatarUrl

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");

// The app's internal imports are written without an extension, which Node's ESM
// loader (and its type stripping) needs spelled out.
register(pathToFileURL(path.join(ROOT, "scripts", "ts-ext-loader.mjs")).href, import.meta.url);

const { templates, templateAssetPaths } = await import(
  pathToFileURL(path.join(ROOT, "lib", "backgrounds.ts")).href
);
const { TEMPLATE_FACTS } = await import(
  pathToFileURL(path.join(ROOT, "lib", "template-facts.ts")).href
);
const { prisma } = await import(pathToFileURL(path.join(ROOT, "lib", "db.ts")).href);

// Legacy artwork URL -> the rendered asset that replaces it. Both the loop and
// the poster are mapped, because bannerUrl holds the one and avatarUrl the other.
const repoint = new Map();
for (const tpl of templates) {
  if (!TEMPLATE_FACTS[tpl.id]) continue; // no render yet: leave the row alone
  const asset = templateAssetPaths(tpl.id);
  repoint.set(tpl.source.url, asset.url);
  repoint.set(tpl.source.thumb, asset.thumb);
  if (tpl.url !== asset.url) repoint.set(tpl.url, asset.url);
}

const wanted = [...new Set(repoint.keys())];
const rows = await prisma.profile.findMany({
  where: {
    OR: [{ bannerUrl: { in: wanted } }, { avatarUrl: { in: wanted } }],
  },
  select: {
    id: true,
    bannerUrl: true,
    avatarUrl: true,
    user: { select: { handle: true } },
  },
  orderBy: { user: { handle: "asc" } },
});

let changes = 0;
for (const row of rows) {
  const handle = row.user?.handle ?? "?";
  for (const field of ["bannerUrl", "avatarUrl"]) {
    const current = row[field];
    const next = current ? repoint.get(current) : undefined;
    if (!next) continue;
    changes++;
    console.log(`${apply ? "repoint" : "would repoint"} @${handle} · ${field}\n  ${current}\n  -> ${next}`);
    if (apply) {
      // The new value is a short same-origin path, comfortably under the
      // VARCHAR(191) the column was built with.
      await prisma.profile.update({ where: { id: row.id }, data: { [field]: next } });
    }
  }
}

console.log(
  `\n${rows.length} profile(s) still on legacy artwork URLs · ${changes} field change(s)` +
    (apply ? " — applied." : " — nothing written (pass --apply).")
);
if (changes && !apply) {
  console.log(
    "Skipping this is harmless: those profiles keep their motion and effects through\n" +
      "getTemplateByUrl(), they just still stream the original CDN file."
  );
}

await prisma.$disconnect();
