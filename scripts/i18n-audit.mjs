// Durable i18n guard for riasly.
//
// WHY THIS EXISTS
// The customize redesign briefly rendered raw keys like
// `dashboard.customizePage.sections.colors` in the browser. The dictionaries
// were in fact complete — the raw keys came from a stale dev render — but that
// class of bug (a translation key the code asks for that no dictionary defines)
// is silent: next-intl just prints the key path and the build still passes. This
// script makes it loud and cheap to catch, before it can ever ship again.
//
// WHAT IT CHECKS (all read-only; it never writes a file)
//   1. Parity      — en.json and tr.json have the exact same set of leaf keys.
//   2. Static      — every literal `t("a.b")` under a `useTranslations("ns")`
//                    resolves to `ns.a.b` in BOTH dictionaries.
//   3. Dynamic     — template-literal keys (`tp(\`effects.${k}\`)`, …) are expanded
//                    against their real choice set, parsed straight from the lib
//                    source (BG_EFFECT_CHOICES, USERNAME_EFFECTS, WIDGET_TYPES,
//                    MotionKey/FxKey, BADGES keys, TABS) so the check can never
//                    drift from the code. Trailing suffixes (`.name`/`.desc`) are
//                    honoured, and translator wrappers (`ta(k) => t(\`admin.${k}\`)`)
//                    have their literal call sites resolved too. A dynamic prefix
//                    with no provable set is reported as a warning (never a fail).
//   4. ICU parse   — every leaf message parses under intl-messageformat, so a
//                    stray `{`, `}` or `#` fails here instead of at a visitor.
//
// Exit code: 1 on any parity/static/dynamic/ICU FAILURE; 0 otherwise (warnings
// never fail the gate, so a green build stays green).
//
// Run directly: `node scripts/i18n-audit.mjs`  (also wired as `npm run check:i18n`).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IntlMessageFormat } from "intl-messageformat";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOTS = ["app", "components"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

const errors = [];
const warningSet = new Set();
const fail = (msg) => errors.push(msg);
const warn = (msg) => warningSet.add(msg);

// ---- dictionary helpers ----
function readDict(locale) {
  const file = path.join(ROOT, "dictionaries", `${locale}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function flatLeaves(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatLeaves(v, key, out);
    else out[key] = v;
  }
  return out;
}

// ---- generic TS extractors (keep the dynamic sets in sync with the source) ----
function extractConstArray(src, name) {
  const m = src.match(
    new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const`)
  );
  return m ? [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]) : null;
}
function extractUnionType(src, name) {
  const m = src.match(new RegExp(`export\\s+type\\s+${name}\\s*=([\\s\\S]*?);`));
  return m ? [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]) : null;
}
// A `const NAME: T[] = ["a", "b"]` (or without the type) written on one line —
// used for component-local sets like TemplateGallery's TABS.
function extractStringArrayNamed(src, name) {
  const m = src.match(
    new RegExp(`(?:export\\s+)?const\\s+${name}\\b[^=\\n]*=\\s*\\[([^\\]]*)\\]`)
  );
  return m ? [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]) : null;
}
// Badge ids are the `key: "..."` fields inside the BADGES catalog.
function extractObjKeys(src) {
  return [...src.matchAll(/\bkey:\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

function readSource(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// ---- file walk ----
function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const fp = path.join(dir, name);
    const st = fs.statSync(fp);
    if (st.isDirectory()) out.push(...walk(fp));
    else if (/\.(tsx|ts)$/.test(name)) out.push(fp);
  }
  return out;
}

function main() {
  const en = readDict("en");
  const tr = readDict("tr");
  const enLeaves = flatLeaves(en);
  const trLeaves = flatLeaves(tr);
  const enKeys = new Set(Object.keys(enLeaves));
  const trKeys = new Set(Object.keys(trLeaves));

  // 1. Parity
  for (const k of enKeys) if (!trKeys.has(k)) fail(`PARITY  key in EN but missing in TR: ${k}`);
  for (const k of trKeys) if (!enKeys.has(k)) fail(`PARITY  key in TR but missing in EN: ${k}`);

  // Resolve the choice sets the dynamic keys draw from.
  const profileStyle = readSource("lib/profile-style.ts");
  const widgets = readSource("lib/widgets.ts");
  const recipes = readSource("lib/template-recipes.ts");
  const badgesSrc = readSource("lib/badges.ts");
  const gallerySrc = readSource("components/dashboard/TemplateGallery.tsx");
  const BG_EFFECT_CHOICES = extractConstArray(profileStyle, "BG_EFFECT_CHOICES");
  const USERNAME_EFFECTS = extractConstArray(profileStyle, "USERNAME_EFFECTS");
  const WIDGET_TYPES = extractConstArray(widgets, "WIDGET_TYPES");
  const MOTION_KEYS = extractUnionType(recipes, "MotionKey");
  const FX_KEYS = extractUnionType(recipes, "FxKey");
  const TAB_KEYS = extractStringArrayNamed(gallerySrc, "TABS");
  const BADGE_KEYS = extractObjKeys(badgesSrc);

  /** Full prefix -> complete value set we can statically prove. */
  const RESOLVERS = {
    "dashboard.customizePage.effects": BG_EFFECT_CHOICES
      ? [...BG_EFFECT_CHOICES, "template"]
      : null,
    "dashboard.customizePage.usernameEffects": USERNAME_EFFECTS,
    "dashboard.widgetsPage.types": WIDGET_TYPES,
    "dashboard.widgetsPage.hint": WIDGET_TYPES,
    "templates.motionNames": MOTION_KEYS ? [...MOTION_KEYS, "none"] : null,
    "templates.fx": FX_KEYS,
    "templates.tabs": TAB_KEYS,
    // badges.items.<key>.name/.desc — the suffix is carried by the call site, so
    // every badge key gets checked once per suffix actually used in the source.
    "badges.items": BADGE_KEYS.length ? BADGE_KEYS : null,
  };
  for (const [p, set] of Object.entries(RESOLVERS)) {
    if (!set) warn(`DYNAMIC resolver "${p}" had no parsable choice set — skipped`);
  }

  // 2 + 3. Static + dynamic coverage across the source.
  const files = [];
  for (const root of SCAN_ROOTS) {
    const abs = path.join(ROOT, root);
    if (fs.existsSync(abs)) files.push(...walk(abs));
  }

  const nsDecl = /const\s+(\w+)\s*=\s*useTranslations\(\s*["']([^"']+)["']\s*\)/g;
  // A thin translator wrapper: `const ta = (key, ...) => t(\`admin.${key}\`, ...)`.
  // Its LITERAL call args (`ta("forbidden")`) are static keys behind a dynamic
  // template, so we resolve them back to `<ns>.<prefix>.<key>` leaves.
  const wrapperDecl =
    /const\s+(\w+)\s*=\s*\([^)]*\)\s*=>\s*(\w+)\(\s*`([^`]*)\$\{/g;
  const dynamicSeen = new Set();
  let staticChecked = 0;
  let dynamicChecked = 0;

  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const binds = [];
    const varToNs = new Map();
    for (const m of src.matchAll(nsDecl)) {
      binds.push({ v: m[1], ns: m[2] });
      varToNs.set(m[1], m[2]);
    }

    // Pre-pass: thin translator wrappers (`const ta = (k, ...) => t(\`admin.${k}\`)`).
    // The wrapper body is a dynamic template, but every real call site passes a
    // string literal, so we prove each leaf statically and mark the prefix covered
    // (so the dynamic scan below doesn't also raise a redundant warning for it).
    const wrappers = [];
    for (const wm of src.matchAll(wrapperDecl)) {
      const baseNs = varToNs.get(wm[2]);
      if (!baseNs) continue;
      wrappers.push({ fn: wm[1], fullPrefix: `${baseNs}.${wm[3].replace(/\.$/, "")}` });
    }
    const wrapperCovered = new Set(wrappers.map((w) => w.fullPrefix));
    for (const w of wrappers) {
      const callRe = new RegExp(`\\b${w.fn}\\(\\s*["']([^"'\\n]+)["']`, "g");
      for (const cm of src.matchAll(callRe)) {
        const full = `${w.fullPrefix}.${cm[1]}`;
        staticChecked++;
        if (!enKeys.has(full)) fail(`STATIC  missing in EN: ${full}   (${rel})`);
        if (!trKeys.has(full)) fail(`STATIC  missing in TR: ${full}   (${rel})`);
      }
    }

    for (const b of binds) {
      // Static literal calls: <v>("key") or <v>("key", ...)
      const staticRe = new RegExp(
        `\\b${b.v}\\(\\s*["']([^"'\\n]+)["']`,
        "g"
      );
      for (const m of src.matchAll(staticRe)) {
        const full = `${b.ns}.${m[1]}`;
        staticChecked++;
        if (!enKeys.has(full)) fail(`STATIC  missing in EN: ${full}   (${rel})`);
        if (!trKeys.has(full)) fail(`STATIC  missing in TR: ${full}   (${rel})`);
      }

      // Dynamic template-literal calls: <v>(`prefix.${expr}...`)
      const dynRe = new RegExp(`\\b${b.v}\\(\\s*\`([^\`]*)\``, "g");
      for (const m of src.matchAll(dynRe)) {
        const tmpl = m[1];
        if (!tmpl.includes("${")) continue; // plain backtick string, already static
        if ((tmpl.match(/\$\{/g) || []).length > 1) {
          // Multiple interpolations — can't prove the leaf statically; eyeball it.
          warn(`DYNAMIC "${b.ns}.${tmpl}" has >1 interpolation — verify by hand`);
          continue;
        }
        const dollar = tmpl.indexOf("${");
        const close = tmpl.indexOf("}", dollar);
        const prefix = tmpl.slice(0, dollar).replace(/\.$/, "");
        const suffix = close === -1 ? "" : tmpl.slice(close + 1);
        const fullPrefix = `${b.ns}.${prefix}`;
        if (wrapperCovered.has(fullPrefix)) continue; // already proven above
        dynamicSeen.add(fullPrefix);
        const set = RESOLVERS[fullPrefix];
        if (!set) {
          // One line per unknown prefix, not per call site — keeps the report
          // readable while still flagging every dynamic family to eyeball.
          warn(
            `DYNAMIC "${fullPrefix}.*" has no fixed choice set — verify its keys by hand`
          );
          continue;
        }
        for (const value of set) {
          const full = `${fullPrefix}.${value}${suffix}`;
          dynamicChecked++;
          if (!enKeys.has(full)) fail(`DYNAMIC missing in EN: ${full}   (${rel})`);
          if (!trKeys.has(full)) fail(`DYNAMIC missing in TR: ${full}   (${rel})`);
        }
      }
    }
  }

  // 4. ICU parse of every leaf message.
  for (const [locale, leaves] of [
    ["en", enLeaves],
    ["tr", trLeaves],
  ]) {
    for (const [key, value] of Object.entries(leaves)) {
      if (typeof value !== "string") continue;
      try {
        // Parsing alone surfaces brace/quote structural errors; no values needed.
        new IntlMessageFormat(value, locale);
      } catch (e) {
        fail(`ICU     ${locale}.${key} failed to parse: ${e.message}`);
      }
    }
  }

  // ---- report ----
  console.log("i18n-audit");
  console.log(`  dictionaries : en=${enKeys.size} tr=${trKeys.size} leaves`);
  console.log(`  source files : ${files.length}`);
  console.log(`  static keys  : ${staticChecked} checked`);
  console.log(`  dynamic keys : ${dynamicChecked} checked (${[...dynamicSeen].length} prefixes)`);
  console.log(`  ICU messages : ${enKeys.size + trKeys.size} parsed`);

  const warnings = [...warningSet];
  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  ~ ${w}`);
  }
  if (errors.length) {
    console.error(`\n${errors.length} ERROR(S):`);
    for (const e of errors) console.error(`  x ${e}`);
    console.error("\ni18n-audit FAILED");
    process.exit(1);
  }
  console.log("\ni18n-audit PASSED (0 missing keys)");
}

main();
