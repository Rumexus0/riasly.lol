// riasly — module-boundary rules the application depends on but the compiler cannot
// express: which lib/ modules may be imported from a client component, and which must
// stay out of the browser bundle.
//
// Why this is a test and not a comment: two of these rules are already broken
// candidates. (1) lib/backgrounds.ts is read by scripts/build-templates.mjs, which
// runs with NO database and NO Prisma client — importing Prisma there does not fail
// loudly, it fails the 65-template verify step. (2) A client component that imports a
// server-only module (next/headers, node:fs, @prisma/client) drags it into the
// bundle: the build either errors on the Node builtin or, worse, ships a server
// secret path into JS that visitors can read. Both regressions arrive as someone
// adding one tidy import.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/** Read a source file from the repo root, so the rule is checked on text, not types. */
function source(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

/** Collect the module specifiers a file imports — static and dynamic alike. */
function importedFrom(rel: string): string[] {
  const body = source(rel);
  const specs = [
    ...body.matchAll(/(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*["']([^"']+)["']/g),
    ...body.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
  ].map((m) => m[1]);
  return [...new Set(specs)];
}

// What a browser may never see. `server-only` is the explicit Next marker package;
// the rest are the Node surface a bundler refuses (or silently polyfills).
const SERVER_ONLY_SPECIFIERS = [
  "@prisma/client",
  "prisma",
  "next/headers",
  "next/server",
  "server-only",
  "node:fs",
  "node:path",
  "node:crypto",
];

const CLIENT_SAFE_MODULES = [
  "lib/media-kind.ts", // classification vocabulary
  "lib/format.ts", // display helpers + the shared storage-key literals
  "lib/profile-style.ts", // the style kernel the customizer and the renderer share
  "lib/backgrounds.ts", // the gallery catalog build-templates.mjs also reads
  "lib/widgets.ts", // the widget kernel WidgetRenderer imports
  "lib/platforms.ts", // the connection grid's provider table
];

describe("client-safe modules stay client-safe", () => {
  for (const rel of CLIENT_SAFE_MODULES) {
    it(`${rel} imports nothing server-only`, () => {
      const offenders = importedFrom(rel).filter(
        (spec) =>
          SERVER_ONLY_SPECIFIERS.includes(spec) ||
          spec.startsWith("node:") ||
          spec.startsWith("@/app/")
      );
      expect(offenders, `${rel} -> ${offenders.join(", ")}`).toEqual([]);
    });
  }

  // The header comments are the documentation of these boundaries; a comment that
  // says CLIENT-SAFE while importing Prisma is worse than no comment at all.
  it("keeps the header claim honest for the modules that make it", () => {
    for (const rel of CLIENT_SAFE_MODULES) {
      const header = source(rel).slice(0, 400);
      if (/CLIENT-SAFE/i.test(header)) {
        expect(importedFrom(rel).some((s) => s.includes("prisma")), rel).toBe(false);
      }
    }
  });
});

describe("lib/backgrounds.ts stays database-free", () => {
  // scripts/build-templates.mjs imports this module in a plain Node process with no
  // generated client and no DATABASE_URL. Restricting its imports to the two local
  // modules below is what keeps `npm run templates:verify` (65/65) runnable in CI
  // without a database, which is also what keeps the gallery reproducible.
  it("only reaches media-kind and the committed facts table", () => {
    expect(importedFrom("lib/backgrounds.ts").sort()).toEqual(
      ["./media-kind", "./template-facts"].sort()
    );
  });
});

describe("server-only modules say so", () => {
  // lib/storage.ts is the counterpart: it owns disk paths and the quota query. If it
  // ever gains an import from a client-safe module that pulls it back into the
  // browser, the guard below is what catches the cycle.
  it("lib/storage.ts is deliberately on the server side", () => {
    const specs = importedFrom("lib/storage.ts");
    expect(specs).toContain("node:path");
    expect(source("lib/storage.ts")).toContain("SERVER ONLY");
  });

  it("lib/verify-cookie.ts is not importable from a client component", () => {
    // The client-side verified-email handoff therefore lives in lib/format.ts, and
    // the two literals cannot be merged without breaking the bundle boundary.
    expect(importedFrom("lib/verify-cookie.ts")).toContain("next/headers");
    expect(importedFrom("lib/format.ts")).not.toContain("next/headers");
  });
});

describe("the app's own conventions survive", () => {
  // Every lib module opens with a "why this exists" comment block rather than
  // straight into code. This is the single habit that makes the codebase reviewable
  // by someone who has never seen it — the README promises it, so the suite checks
  // it across the whole directory instead of one file. A new module that starts at
  // an import/export line is the regression this catches.
  it("every lib module starts with a comment line", () => {
    const dir = path.resolve(process.cwd(), "lib");
    const modules = readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
      .sort();
    // Sanity: the scan actually found the modules we know live there, so an empty
    // directory cannot pass the loop vacuously.
    expect(modules.length).toBeGreaterThan(10);
    for (const file of modules) {
      const first = readFileSync(path.join(dir, file), "utf8").split("\n", 1)[0].trim();
      expect(first, `lib/${file} must open with a // comment`).toMatch(/^\/\//);
    }
  });
});
