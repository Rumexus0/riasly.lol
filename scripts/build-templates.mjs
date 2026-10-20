// riasly — 4K template renderer.
//
// What it does: for every entry in the lib/backgrounds.ts catalog it renders the
// three files a template actually needs into public/templates —
//
//   <id>.mp4        silent 3840x2160 (or 2160x3840) loop, drift baked into pixels
//   <id>.prev.mp4   1280x720 proxy, streamed only while a gallery card is hovered
//   <id>.jpg        light poster frame, shown in the grid and used as an avatar
//
// and then writes the *measured* result (ffprobe pixels, byte weights, upscaled
// flag) into lib/template-facts.ts. lib/backgrounds.ts merges those facts in, so
// a template only switches to its local render once the files exist and an entry
// without facts keeps serving its external source artwork. That makes this script
// safe to run in waves, and safe to re-run: an existing output is skipped unless
// --force is passed. Every encode writes a scratch name that keeps the output
// extension and is renamed only after ffmpeg exits 0, so an interrupted run leaves
// nothing that could pass for a finished render.
//
// Why generate locally at all: free 4K video cannot be hotlinked. Mixkit answers
// 403 for every tier above -720.mp4, Wallhaven only hosts stills (its .mp4 paths
// 404), Pexels/Pixabay need a key, Coverr's CDN TLS-blocks. So "all templates
// animated, all templates 4K" means rendering the drift ourselves — with the
// catalog's own recipe (lib/template-recipes.ts) as the motion source, so the
// name printed on a card is literally what was rendered.
//
// What it deliberately does NOT do: bake the CSS effect layers (grain, scanlines,
// aurora, …) into the video. Those stay runtime decoration, because a baked layer
// would double every one of them and could no longer react to a visitor's motion
// choice.
//
// Usage:
//   npm run templates:build -- --only st-95jjgx,ne-35694
//   npm run templates:build -- --wave 1          # all still-sourced entries
//   npm run templates:build -- --verify         # no encoding, just check
//   npm run templates:build -- --verify --base http://localhost:3000
//
//   node scripts/build-templates.mjs --render-one --id up-ab12cd --src up-ab12cd.mp4
//
// --render-one is the mode the app's admin gallery upload spawns: it renders one
// staged file into the same triple and reports the measurement as a sidecar JSON
// instead of lib/template-facts.ts, because a row in the database is what owns an
// admin-added template. It never reads the code catalog and never writes facts.
//
// Flags: --only <ids>  --wave <0|1|2>  --force  --dry-run  --crf <n>
//        --duration <s>  --preset <name>  --jobs <n>  --verify  --base <url>
//        --scores (with --verify: print every drift score, not just the outliers)
//        --render-one  --id <up-…>  --src <staged basename>  --motion <key>
//
// Verification is safe to run at any time and encodes nothing:
//   npm run templates:verify -- --only st-839kvo --scores
//
// Note on paths: public/templates/ is a static directory, so it is served by
// Next's own static handler and it wins over app/[username] for those URLs.
//
// Note on git: the rendered media is deliberately ignored (~0.5-1 GB of it), while
// lib/template-facts.ts — the table that points the catalog at it — is committed.
// A fresh environment therefore has measurements without files; run this script
// there once (existing outputs are skipped) before a fact row can resolve.

import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "templates");
const SRC_DIR = path.join(ROOT, ".cache", "template-src");
const FACTS_FILE = path.join(ROOT, "lib", "template-facts.ts");

// Admin uploads land here first (bytes are never web-servable and never a
// FileAsset), and their render reports into the sidecar dir beside it.
const CATALOG_STAGING = path.join(ROOT, ".cache", "catalog-staging");
const CATALOG_RENDER = path.join(ROOT, ".cache", "catalog-render");

// Declared up here because the ffmpeg-binary guard below already needs it: an id
// is only ever a path segment when it matches, and both values arrive from the
// app. The shape is also what TEMPLATE_ASSET_RE in lib/media-kind.ts accepts, so
// an id that gets through here is an id the static handler will serve.
const SAFE_ID_RE = /^[a-z0-9][a-z0-9.-]{1,40}$/;

const FPS = 25;
const OVERSCAN = 1.18; // headroom so a pan never exposes the black page
const MAX_WALL_MB = 12; // a full-page background must not cost more than this
const MAX_POSTER_KB = 120;
const MAX_PROXY_MB = 3;
const MIN_MOTION_SCORE = 0.4; // below this, frame 0 and the half-loop frame are the same picture
const MAX_PROXY_EDGE = 1300; // a hover preview must never be a wall-sized file
const VIDEO_WINDOW_S = 10; // retry length for a source loop too heavy at 4K

// Landscape art fills a 16:9 wall; portrait art keeps its own tall composition
// and renders a tall wall. Both are UHD-class, so the printed pixels are honest.
const CANVAS = {
  landscape: { w: 3840, h: 2160 },
  portrait: { w: 2160, h: 3840 },
};

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
}

const opts = {
  only: String(opt("only", "") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  wave: opt("wave", "") === true ? "" : String(opt("wave", "")),
  force: has("--force"),
  dryRun: has("--dry-run"),
  verify: has("--verify"),
  scores: has("--scores"),
  crf: Number(opt("crf", 30)),
  duration: Number(opt("duration", 7)),
  preset: String(opt("preset", "medium")),
  jobs: Math.max(1, Number(opt("jobs", 2))),
  base: opt("base", "") === true ? "" : String(opt("base", "")),
  renderOne: has("--render-one"),
  oneId: String(opt("id", "")),
  oneSrc: String(opt("src", "")),
  oneMotion: String(opt("motion", "ken")),
};

if (!ffmpegPath) {
  const message =
    "ffmpeg-static did not install a binary. Run `npm install`, or install ffmpeg " +
    "yourself (`winget install ffmpeg`) and point FFMPEG_PATH at it.";
  if (opts.renderOne && SAFE_ID_RE.test(opts.oneId)) {
    // An admin is watching this render through a card, so the reason belongs in
    // the sidecar: otherwise the row only ever says "render never finished".
    await writeSidecar(opts.oneId, { ok: false, error: message, at: new Date().toISOString() });
  }
  console.error(message);
  process.exit(1);
}
const FFMPEG = process.env.FFMPEG_PATH || ffmpegPath;
const FFPROBE = process.env.FFPROBE_PATH || ffprobeStatic.path || ffprobeStatic.ffprobePath;

// ---------------------------------------------------------------- spawn helpers

// ffprobe answers on stdout, ffmpeg only ever talks on stderr — so the same spawn
// helper collects whichever side the caller needs and always drains the other one
// (an unread pipe eventually stalls a long encode).
function run(bin, args, { capture = false, binary = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let err = "";
    let out = "";
    const chunks = [];
    child.stderr.on("data", (b) => {
      err += b.toString();
      if (err.length > 64 * 1024) err = err.slice(-32 * 1024);
    });
    if (binary) child.stdout.on("data", (b) => chunks.push(b));
    else if (capture) child.stdout.on("data", (b) => (out += b.toString()));
    else child.stdout.resume();
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve(binary ? Buffer.concat(chunks) : capture ? out : err);
      const tail = err.trim().split("\n").slice(-6).join("\n");
      reject(new Error(`${path.basename(bin)} exited ${code}\n${tail}`));
    });
  });
}

async function probe(file) {
  const out = await run(
    FFPROBE,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      file,
    ],
    { capture: true }
  );
  const j = JSON.parse(out || "{}");
  const s = j?.streams?.[0];
  if (!s) throw new Error(`no video stream in ${path.basename(file)}`);
  return {
    w: Number(s.width),
    h: Number(s.height),
    dur: Number(j?.format?.duration ?? 0),
  };
}

// Every encode writes a scratch name and is renamed only after ffmpeg exited 0.
// A killed run therefore leaves a scratch file, which nothing reads, instead of a
// half-written .mp4 that the "already on disk" skip below would take for a
// finished render — the difference between resuming and silently shipping noise.
// The scratch name keeps the real extension at the end, because ffmpeg picks its
// muxer from the suffix and "<file>.part" alone makes it fail with EINVAL.
const partOf = (dest) => `${dest}.part${path.extname(dest)}`;

async function encodeTo(args, dest) {
  const tmp = partOf(dest);
  await run(FFMPEG, [...args, tmp]).catch(async (e) => {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw e;
  });
  await fs.rename(tmp, dest);
}

// Leftovers from an interrupted previous run; the real files were never renamed.
async function sweepParts() {
  const entries = await fs.readdir(OUT_DIR).catch(() => []);
  for (const name of entries.filter((n) => n.includes(".part."))) {
    await fs.rm(path.join(OUT_DIR, name), { force: true }).catch(() => {});
  }
}

const mb = (bytes) => Math.round((bytes / (1024 * 1024)) * 100) / 100;

// Pulls one frame out as a small raw luma plane, so it can be compared byte for
// byte without decoding anything.
async function frameGray(wall, n) {
  return run(
    FFMPEG,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      wall,
      "-vf",
      `select=eq(n\\,${n}),scale=320:180:flags=area`,
      "-frames:v",
      "1",
      "-an",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "-",
    ],
    { binary: true }
  );
}

// How much a render actually moves: the largest mean luma difference between
// frame 0 and any of the quarter / half / three-quarter frames. Sampling three
// phases rather than one is what makes the number honest — a sine-driven motion
// (breathe) is back at its starting scale halfway through, so a half-frame-only
// test would grade a genuinely moving file as static.
// A file that moves in no phase is a bug wearing a video wrapper, which is
// exactly the claim this whole pipeline is built to earn.
async function motionScore(wall, dur) {
  const frames = Math.max(2, Math.round(dur * FPS));
  const a = await frameGray(wall, 0);
  if (!a.length) return -1;
  const probes = [0.25, 0.5, 0.75].map((p) => Math.max(1, Math.round(frames * p)));
  const planes = await Promise.all(probes.map((n) => frameGray(wall, n)));
  let best = 0;
  for (const b of planes) {
    if (!b.length || b.length !== a.length) continue;
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
    best = Math.max(best, sum / a.length);
  }
  return Math.round(best * 100) / 100;
}

async function sizeOf(file) {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return -1;
  }
}

// ---------------------------------------------------------------- source cache

async function ensureSource(tpl) {
  const ext = /\.mp4$/i.test(tpl.source.url) ? ".mp4" : ".jpg";
  const file = path.join(SRC_DIR, `${tpl.id}${ext}`);
  if ((await sizeOf(file)) > 0) return file;

  if (opts.dryRun) {
    console.log(`  [dry-run] would fetch ${tpl.source.url}`);
    return file;
  }
  await fs.mkdir(SRC_DIR, { recursive: true });
  const res = await fetch(tpl.source.url, {
    headers: { "user-agent": "riasly template builder" },
    redirect: "follow",
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`source ${res.status} for ${tpl.source.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`source too small (${buf.length} B)`);
  await fs.writeFile(file, buf);
  console.log(`  fetched ${path.basename(file)} (${mb(buf.length)} MB)`);
  return file;
}

// ---------------------------------------------------------------- motion graph

// One full sine period spread over the clip, so frame 0 and the last frame land in
// the same place and the loop is seamless without a reverse pass (buffering ~175
// 4K frames to flip them would need gigabytes of RAM). `crop` is addressed in
// time, `zoompan` in output frames, hence two spellings of the same period.
// Every string below is plain concatenation: a nested template literal inside a
// template literal is far too easy to leave a bracket short.
const CYCLE_T = (dur) => `2*PI*t/${dur}`;
const CYCLE_ON = (frames) => `2*PI*on/${frames}`;

function motionFilter(motion, out, big, frames, dur) {
  const w = out.w;
  const h = out.h;
  const travel = `(in_w-out_w)*(0.5+0.45*sin(${CYCLE_T(dur)}))`;
  const climb = `(in_h-out_h)*(0.5-0.45*sin(${CYCLE_T(dur)}))`;
  const swing = `(in_h-out_h)*(0.5+0.45*cos(${CYCLE_T(dur)}))`;
  switch (motion) {
    // Pan motions keep a constant window size — an animated crop *size* is an
    // illegal variable frame size for a constant-size encoder.
    case "panX":
      return `crop=${w}:${h}:x='${travel}':y='(in_h-out_h)/2'`;
    case "driftUp":
      return `crop=${w}:${h}:x='(in_w-out_w)/2':y='${climb}'`;
    case "orbit":
      return `crop=${w}:${h}:x='${travel}':y='${swing}'`;
    // Zoom motions go through zoompan, which resamples to a fixed output size.
    case "push":
      return zoompan(`1.05+0.055*(1-cos(${CYCLE_ON(frames)}))`, "(iw-iw/zoom)*0.5", "(ih-ih/zoom)*0.62", out);
    case "breathe":
      return zoompan(`1.06+0.04*sin(${CYCLE_ON(frames)})`, "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)", out);
    case "ken":
    default:
      return zoompan(`1.06+0.04*(1-cos(${CYCLE_ON(frames)}))`, "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)", out);
  }
}

// d=1: one output frame per input frame, so the looped still image drives the
// clock and `on` counts straight to `frames`.
function zoompan(z, x, y, out) {
  return `zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${out.w}x${out.h}:fps=${FPS}`;
}

// Cover-scale the source so it fully paints the overscan frame, then trim to it:
// the motion window then has room to travel in both axes.
function prepFilter(big) {
  return (
    `scale=${big.w}:${big.h}:force_original_aspect_ratio=increase:flags=lanczos` +
    `,crop=${big.w}:${big.h}`
  );
}

// Rewrites one encoder option in an already-built argument list, so a retry is
// the same render at a different quantiser and nothing else drifts.
function withCrf(args, crf) {
  const i = args.indexOf("-crf");
  if (i === -1 || i + 1 >= args.length) return [...args];
  const copy = [...args];
  copy[i + 1] = String(crf);
  return copy;
}

// Shortens the decoded window. `-t` sits before `-i` so it caps the *input*, which
// is what both a looped still and a stock clip need; when it is missing it is
// inserted just before the input rather than tacked onto the output side.
function withDuration(args, secs) {
  const copy = [...args];
  const i = copy.indexOf("-t");
  if (i !== -1 && i + 1 < copy.length) {
    copy[i + 1] = String(secs);
    return copy;
  }
  const at = copy.indexOf("-i");
  if (at === -1) return copy;
  copy.splice(at, 0, "-t", String(secs));
  return copy;
}

// Renders the wall, then holds it to the weight ceiling: ease the quantiser first,
// and only for a looping source clip take a shorter window (its own loop is the
// motion, so it cannot be re-timed without a visible jump). Anything still too
// heavy is deleted and reported, never shipped — the catalog then keeps serving
// that entry's source artwork.
async function fitWallBudget(wall, base, { canTrim = false, trimTo = VIDEO_WINDOW_S } = {}) {
  const fits = async () => (await sizeOf(wall)) <= MAX_WALL_MB * 1024 * 1024;
  await encodeTo(base, wall);
  if (await fits()) return;
  for (const crf of [opts.crf + 3, opts.crf + 6]) {
    await encodeTo(withCrf(base, crf), wall).catch(() => {});
    if (await fits()) return;
  }
  // Last resort for a source loop: a shorter window of the same footage. Halved
  // once, because one stock clip is two minutes of white-noise-grade entropy and
  // no quantiser turns that into 12 MB at 4K.
  if (canTrim) {
    for (const secs of [trimTo, Math.max(2, Math.round(trimTo / 2))]) {
      const trimmed = withCrf(withDuration(base, secs), opts.crf + 6);
      await encodeTo(trimmed, wall).catch(() => {});
      if (await fits()) return;
    }
  }
  await fs.unlink(wall).catch(() => {});
  throw new Error(`over the ${MAX_WALL_MB} MB wall budget even at crf ${opts.crf + 6} / ${trimTo}s`);
}

// ---------------------------------------------------------------- encode steps

async function encodeWall(tpl, srcFile, motion, out, big) {
  const wall = path.join(OUT_DIR, `${tpl.id}.mp4`);
  const frames = Math.round(opts.duration * FPS);
  const vf = [prepFilter(big), motionFilter(motion, out, big, frames, opts.duration), "setsar=1", "format=yuv420p"].join(",");

  const base = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-loop",
    "1",
    "-framerate",
    String(FPS),
    "-t",
    String(opts.duration),
    "-i",
    srcFile,
    "-vf",
    vf,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    opts.preset,
    "-crf",
    String(opts.crf),
    "-pix_fmt",
    "yuv420p",
    "-g",
    "250",
    "-keyint_min",
    "250",
    "-sc_threshold",
    "0",
    "-movflags",
    "+faststart",
  ];

  if (opts.dryRun) {
    console.log(`  [dry-run] would render ${path.basename(wall)} (${out.w}x${out.h}, ${motion})`);
    return null;
  }
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fitWallBudget(wall, base);
  return wall;
}

// The stock loops are HD at best: they are stretched to the UHD canvas with a
// lanczos pass plus a light unsharp so the upscale reads as deliberate. Their own
// motion is kept — nothing is drifted on top of a loop its author chose.
async function encodeWallFromVideo(tpl, srcFile, out, srcDur) {
  const wall = path.join(OUT_DIR, `${tpl.id}.mp4`);
  const vf = [
    `scale=${out.w}:${out.h}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${out.w}:${out.h}`,
    "unsharp=5:5:0.6:5:5:0.0",
    `fps=${FPS}`,
    "setsar=1",
    "format=yuv420p",
  ].join(",");

  const base = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    srcFile,
    "-vf",
    vf,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    opts.preset,
    "-crf",
    String(opts.crf),
    "-pix_fmt",
    "yuv420p",
    "-g",
    "250",
    "-keyint_min",
    "250",
    "-sc_threshold",
    "0",
    "-movflags",
    "+faststart",
  ];

  if (opts.dryRun) {
    console.log(`  [dry-run] would upscale ${path.basename(wall)} (${out.w}x${out.h})`);
    return null;
  }
  await fs.mkdir(OUT_DIR, { recursive: true });

  // A stock loop may be trimmed to a shorter window; a rendered drift may not.
  // The window is the clip's own length capped at VIDEO_WINDOW_S, never the
  // still branch's forward pass — those are two different clocks.
  const trimTo = Math.max(2, Math.round(Math.min(VIDEO_WINDOW_S, srcDur || VIDEO_WINDOW_S)));
  await fitWallBudget(wall, base, { canTrim: true, trimTo });
  return wall;
}

async function encodeProxy(wallFile, out) {
  const file = path.join(OUT_DIR, path.basename(wallFile).replace(/\.mp4$/, ".prev.mp4"));
  if (opts.dryRun) return file;
  await encodeTo(
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      wallFile,
      "-vf",
      `scale=${Math.round(out.w / 3)}:${Math.round(out.h / 3)}:flags=lanczos,format=yuv420p`,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "34",
      "-movflags",
      "+faststart",
    ],
    file
  );
  return file;
}

// The poster is frame 0 of the render itself, so what a card shows and what a
// profile plays start from the same image. Oversized? Step the JPEG quality down.
async function encodePoster(wallFile, out) {
  const file = path.join(OUT_DIR, `${path.basename(wallFile, ".mp4")}.jpg`);
  if (opts.dryRun) return file;
  const pw = out.w >= out.h ? 960 : 720;
  const ph = out.w >= out.h ? 720 : 960;
  for (const q of [4, 6, 8, 10, 13]) {
    await encodeTo(
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        wallFile,
        "-frames:v",
        "1",
        "-vf",
        `scale=${pw}:${ph}:force_original_aspect_ratio=increase:flags=lanczos,crop=${pw}:${ph}`,
        "-q:v",
        String(q),
      ],
      file
    );
    if ((await sizeOf(file)) <= MAX_POSTER_KB * 1024) break;
  }
  return file;
}

// ---------------------------------------------------------------- facts output

const FACTS_HEADER = `// GENERATED by \`npm run templates:build\` — do not edit by hand.
//
// Measured properties of every rendered 4K template asset, written by the
// generator from ffprobe output after each encode. lib/backgrounds.ts merges
// this table into the catalog, and it is the reason a card can print a real
// pixel size and a real weight: "4K" here is a measurement, never a claim.
//
// An id missing from this map is a template whose render does not exist yet —
// the catalog then falls back to that entry's external \`source\` artwork, so a
// half-generated gallery still works instead of showing dead links.

export type TemplateFact = {
  /** True pixels of the rendered loop, e.g. "3840x2160". */
  resolution: string;
  /** Size of the 4K wall file (what a profile visitor streams), in MB. */
  sizeMb: number;
  /** Size of the 720p hover proxy, in MB. */
  previewMb: number;
  /** Size of the poster (gallery card + avatar slot), in MB. */
  posterMb: number;
  /**
   * True when the source artwork was an HD stock loop that had to be upscaled:
   * the pixels are 4K, the detail is not, and the card says so.
   */
  upscaled: boolean;
};
`;

async function writeFacts(facts) {
  const rows = Object.entries(facts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([id, f]) =>
        `  ${JSON.stringify(id)}: { resolution: ${JSON.stringify(f.resolution)}, ` +
        `sizeMb: ${f.sizeMb}, previewMb: ${f.previewMb}, posterMb: ${f.posterMb}, ` +
        `upscaled: ${f.upscaled} },`
    );
  const body = `${FACTS_HEADER}\nexport const TEMPLATE_FACTS: Record<string, TemplateFact> = {\n${rows.join("\n")}\n};\n`;
  await fs.writeFile(FACTS_FILE, body, "utf8");
}

// ---------------------------------------------------------------- selection

const WAVE_0 = [
  "ne-35694", // upscaled stock loop
  "st-95jjgx", // ken, landscape
  "st-m9gj8m", // driftUp, portrait canvas
  "st-6k2687", // panX
  "st-exyw3o", // orbit, non-16:9 source
  "st-dggeej", // push, 8K source
  "st-r29gz1", // breathe
];

function selectTemplates(all) {
  if (opts.only.length) {
    const pick = new Set(opts.only);
    const found = all.filter((t) => pick.has(t.id));
    const missing = [...pick].filter((id) => !all.some((t) => t.id === id));
    if (missing.length) console.warn(`! unknown ids ignored: ${missing.join(", ")}`);
    return found;
  }
  if (opts.wave === "0") return all.filter((t) => WAVE_0.includes(t.id));
  if (opts.wave === "1") return all.filter((t) => !isVideoUrl(t.source.url));
  if (opts.wave === "2") return all.filter((t) => isVideoUrl(t.source.url));
  return all;
}

const isVideoUrl = (u) => /\.(mp4|webm|mov)(\?|#|$)/i.test(u);

// ---------------------------------------------------------------- verify mode

async function verify(templates, facts) {
  const bad = [];
  const missing = [];
  const scores = [];
  let total = 0;
  for (const tpl of templates) {
    const f = facts[tpl.id];
    const p = templateAssetPaths(tpl.id);
    const files = [p.url, p.preview, p.thumb].map((rel) => path.join(ROOT, "public", rel.replace(/^\//, "")));
    const sizes = await Promise.all(files.map(sizeOf));
    if (!f) {
      if (sizes.some((s) => s > 0)) missing.push(`${tpl.id}: files exist but no fact row`);
      continue;
    }
    total += Math.max(0, sizes[0]);
    if (sizes.some((s) => s <= 0)) {
      missing.push(`${tpl.id}: missing ${["wall", "proxy", "poster"].filter((_, i) => sizes[i] <= 0).join(", ")}`);
      continue;
    }
    const dims = await probe(files[0]);
    const res = `${dims.w}x${dims.h}`;
    if (res !== f.resolution) bad.push(`${tpl.id}: claims ${f.resolution}, file is ${res}`);
    if (Math.abs(mb(sizes[0]) - f.sizeMb) > 0.05) bad.push(`${tpl.id}: claims ${f.sizeMb} MB, file is ${mb(sizes[0])} MB`);
    if (mb(sizes[0]) > MAX_WALL_MB) bad.push(`${tpl.id}: ${mb(sizes[0])} MB over the ${MAX_WALL_MB} MB budget`);
    if (mb(sizes[1]) > MAX_PROXY_MB) bad.push(`${tpl.id}: proxy ${mb(sizes[1])} MB over ${MAX_PROXY_MB} MB`);
    const proxyDims = await probe(files[1]);
    if (Math.max(proxyDims.w, proxyDims.h) > MAX_PROXY_EDGE) {
      bad.push(`${tpl.id}: proxy is ${proxyDims.w}x${proxyDims.h}, a hover preview must stay small`);
    }
    const score = await motionScore(files[0], dims.dur);
    scores.push([tpl.id, score]);
    if (score < MIN_MOTION_SCORE) {
      bad.push(`${tpl.id}: drift score ${score} — the clip never moves away from its first frame`);
    }
  }
  const checked = templates.filter((t) => facts[t.id]).length;
  console.log(`\nverified ${checked} of ${Object.keys(facts).length} rendered templates · wall files total ${mb(total)} MB`);
  if (scores.length) {
    const sorted = [...scores].sort((a, b) => a[1] - b[1]);
    console.log(
      `drift score (largest mean luma move from frame 0 across the loop): ` +
        `min ${sorted[0][1]} (${sorted[0][0]}) · max ${sorted[sorted.length - 1][1]} (${sorted[sorted.length - 1][0]}) · ` +
        `floor ${MIN_MOTION_SCORE}`
    );
    if (opts.scores) {
      for (const [id, score] of sorted) console.log(`  ${id.padEnd(12)} ${String(score).padStart(7)}`);
    }
  }
  const rendered = templates.filter((t) => facts[t.id]).length;
  console.log(`catalog: ${templates.length} entries · ${rendered} on local 4K renders · ${templates.length - rendered} still on source artwork`);

  // Serving gate, not a courtesy: a <video> only streams from a byte-range
  // response, and Safari/iOS refuse a 200 outright. So when a base URL is given,
  // the probe is a requirement — a failure lands in `bad` and the run exits 1,
  // which is the trigger for the named /api/t/[file] fallback route.
  if (opts.base) {
    const first = templates.find((t) => facts[t.id]);
    if (first) {
      const p = templateAssetPaths(first.id);
      const base = opts.base.replace(/\/$/, "");
      for (const rel of [p.url, p.preview]) {
        const res = await headProbe(`${base}${rel}`, { Range: "bytes=0-1023" });
        const ok = res?.status === 206 && !!res.headers["content-range"];
        console.log(
          `range probe ${rel} -> ${res ? res.status : "no server"}` +
            (ok ? ` (${res.headers["accept-ranges"] ?? "no Accept-Ranges"}, ${res.headers["content-type"]})` : "")
        );
        if (!ok) {
          bad.push(
            `${first.id}: ${rel} answered ${res ? res.status : "unreachable"} to a Range request — ` +
              "a <video> wall will not play on Safari/iOS (serve it through /api/t/[file])"
          );
        }
      }
      const poster = await headProbe(`${base}${p.thumb}`);
      console.log(
        `poster ${p.thumb} -> ${poster ? poster.status : "no server"} ${poster?.headers["content-type"] ?? ""}`
      );
      if (!poster || poster.status >= 400) {
        bad.push(`${first.id}: poster answered ${poster ? poster.status : "unreachable"}`);
      }
    }
  }

  for (const m of missing) console.log(`  MISSING ${m}`);
  for (const b of bad) console.log(`  BAD ${b}`);
  process.exitCode = missing.length || bad.length ? 1 : 0;
}

// A serving probe without fetch(): undici keeps its sockets in a keep-alive pool,
// and the process.exit() that ends a verification run then trips a Windows-only
// libuv assertion — an exit code that reports a clean run as a crash. One socket
// per request, destroyed as soon as the headers are in, so the teardown is quiet.
function headProbe(url, headers = {}) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(
      url,
      { headers: { ...headers, Connection: "close" }, agent: false, timeout: 8000 },
      (res) => {
        const answer = { status: res.statusCode, headers: res.headers };
        // Listener first, then the teardown: nothing may be lost between the two.
        res.on("close", () => resolve(answer));
        res.destroy();
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => req.destroy());
  });
}

// ---------------------------------------------------------------- single-asset mode

// What an admin upload may be, by the extension the intake route derived from the
// mime (never from the client filename). Looping containers and GIFs keep their
// own motion; a true still gets a drift rendered into its pixels, exactly like a
// Wallhaven seed in the batch path.
const ALLOWED_SRC_EXTS = new Set([".mp4", ".webm", ".mov", ".gif", ".png", ".jpg", ".jpeg", ".webp"]);
const LOOP_EXT_RE = /\.(mp4|webm|mov|gif)$/i;
// A staged basename gets the same treatment as the id: no separator, no dot-dot,
// no absolute prefix, and it is always joined to the staging directory.
const STAGED_NAME_RE = /^[a-z0-9][a-z0-9.-]{1,60}$/;
const MOTION_KEYS = new Set(["ken", "driftUp", "panX", "push", "orbit", "breathe"]);

// The measurement a single render reports. lib/template-facts.ts is generated
// only by the batch path: an admin row lives in the database, and the reconcile
// step in lib/catalog.ts copies these numbers into it.
async function writeSidecar(id, payload) {
  if (!SAFE_ID_RE.test(id)) return;
  await fs.mkdir(CATALOG_RENDER, { recursive: true });
  await fs.writeFile(
    path.join(CATALOG_RENDER, `${id}.json`),
    JSON.stringify(payload, null, 2),
    "utf8"
  );
}

// Removes a triple that never became valid, so a failed render cannot leave the
// gallery with a card streaming a half-file.
async function dropTriple(id) {
  const p = templateAssetPaths(id);
  for (const rel of [p.url, p.preview, p.thumb]) {
    await fs
      .rm(path.join(ROOT, "public", rel.replace(/^\//, "")), { force: true })
      .catch(() => {});
  }
}

async function failOne(id, error) {
  await dropTriple(id);
  await writeSidecar(id, { ok: false, error, at: new Date().toISOString() });
  console.error(`x ${id}: ${error}`);
  process.exitCode = 1;
}

async function renderOne() {
  const id = opts.oneId;
  const staged = opts.oneSrc;
  if (!SAFE_ID_RE.test(id) || !STAGED_NAME_RE.test(staged)) {
    // Refused before touching the filesystem, so nothing is written for a name we
    // cannot trust as a path segment.
    console.error("x render-one: refused unsafe --id/--src");
    process.exit(2);
  }
  const ext = path.extname(staged).toLowerCase();
  if (!ALLOWED_SRC_EXTS.has(ext)) {
    await failOne(id, `unsupported source extension ${ext}`);
    return;
  }
  const srcFile = path.join(CATALOG_STAGING, staged);
  if ((await sizeOf(srcFile)) <= 0) {
    await failOne(id, `staged source is missing (${staged})`);
    return;
  }

  const looping = LOOP_EXT_RE.test(staged);
  const motion = MOTION_KEYS.has(opts.oneMotion) ? opts.oneMotion : "ken";
  try {
    const dims = await probe(srcFile);
    const out = dims.h > dims.w ? CANVAS.portrait : CANVAS.landscape;
    const big = {
      w: even(Math.round(out.w * OVERSCAN)),
      h: even(Math.round(out.h * OVERSCAN)),
    };
    // A retry must not inherit a previous partial triple: the skip logic lives in
    // the batch path, and this mode re-renders from scratch on purpose.
    await dropTriple(id);
    const wall = looping
      ? await encodeWallFromVideo({ id }, srcFile, out, dims.dur)
      : await encodeWall({ id }, srcFile, motion, out, big);
    if (!wall) throw new Error("encoder produced no wall file");
    await encodeProxy(wall, out);
    await encodePoster(wall, out);

    const wallFile = path.join(OUT_DIR, `${id}.mp4`);
    const wallDims = await probe(wallFile);
    const score = await motionScore(wallFile, wallDims.dur);
    // Same floor the batch verification uses: a file that never moves away from
    // its first frame must not carry a "4K Animated" card, whoever uploaded it.
    if (score < MIN_MOTION_SCORE) {
      throw new Error(
        `drift score ${score} — this clip never moves away from its first frame`
      );
    }
    // upscaled is measured, not typed: an admin's 1080p edit is UHD in pixels and
    // the card says where those pixels came from.
    const fact = await factFrom(id, Math.max(dims.w, dims.h) < 3840);
    const payload = {
      ok: true,
      ...fact,
      sourceResolution: `${dims.w}x${dims.h}`,
      sourceDuration: Math.round((dims.dur || 0) * 10) / 10,
      looping,
      motion: looping ? null : motion,
      driftScore: score,
      at: new Date().toISOString(),
    };
    await writeSidecar(id, payload);
    console.log(`RESULT ${JSON.stringify(payload)}`);
    // The staged bytes have done their job; the triple is what ships.
    await fs.rm(srcFile, { force: true }).catch(() => {});
  } catch (e) {
    await failOne(id, e.message.split("\n")[0]);
  }
}

// ---------------------------------------------------------------- main

// Node needs the ".ts" extension the app's bundler-style imports leave off.
register(pathToFileURL(path.join(ROOT, "scripts", "ts-ext-loader.mjs")).href, import.meta.url);

const { templates, templateAssetPaths } = await import(
  pathToFileURL(path.join(ROOT, "lib", "backgrounds.ts")).href
);
const { TEMPLATE_FACTS } = await import(pathToFileURL(FACTS_FILE).href);

if (opts.verify) {
  // --only narrows a verification run to the ids it names, so one suspicious
  // render can be re-measured without decoding the whole gallery again.
  await verify(selectTemplates(templates), TEMPLATE_FACTS);
  process.exit(process.exitCode ?? 0);
}

if (opts.renderOne) {
  // One staged admin upload, no catalog selection and no facts file — this is the
  // mode the app spawns, and it must never rewrite the committed measurements.
  await renderOne();
  process.exit(process.exitCode ?? 0);
}

const jobs = selectTemplates(templates);
if (!opts.dryRun) await sweepParts();
const facts = { ...TEMPLATE_FACTS };
const done = [];
const failed = [];

console.log(
  `rendering ${jobs.length}/${templates.length} templates -> public/templates ` +
    `(crf ${opts.crf}, preset ${opts.preset}, ${opts.duration}s forward, ${FPS} fps, ${opts.jobs} parallel)`
);

let cursor = 0;
async function worker() {
  for (;;) {
    const tpl = jobs[cursor++];
    if (!tpl) return;
    const tag = `${tpl.id} (${tpl.name})`;
    try {
      const upscaled = isVideoUrl(tpl.source.url);
      // A stock loop keeps its own motion, so it has no drift name of its own.
      const label = upscaled ? "own loop" : ((await recipeMotion(tpl)) ?? "ken");
      const srcFile = await ensureSource(tpl);
      if (opts.dryRun && (await sizeOf(srcFile)) <= 0) {
        // Nothing cached and no fetch during a dry run: state the intent, which
        // is all a dry run can honestly report about the canvas.
        console.log(`- ${tag}: [dry-run] would fetch ${tpl.source.url} -> ${label}`);
        continue;
      }
      const dims = await probe(srcFile);
      const out = dims.h > dims.w ? CANVAS.portrait : CANVAS.landscape;
      const big = {
        w: even(Math.round(out.w * OVERSCAN)),
        h: even(Math.round(out.h * OVERSCAN)),
      };

      const wallFile = path.join(OUT_DIR, `${tpl.id}.mp4`);
      if ((await sizeOf(wallFile)) > 0 && !opts.force) {
        // The wall survived, but its cheap halves may not have — a kill between the
        // encode and the proxy leaves a complete .mp4 with no poster. Top them up
        // here rather than trusting the skip, so a re-run cannot report a template
        // as done while the gallery still has a broken card for it.
        const prev = path.join(OUT_DIR, `${tpl.id}.prev.mp4`);
        const poster = path.join(OUT_DIR, `${tpl.id}.jpg`);
        if ((await sizeOf(prev)) <= 0) await encodeProxy(wallFile, out);
        if ((await sizeOf(poster)) <= 0) await encodePoster(wallFile, out);
        facts[tpl.id] = await factFrom(tpl.id, upscaled);
        console.log(`= ${tag}: reusing the render on disk (${facts[tpl.id].sizeMb} MB wall)`);
        continue;
      }

      const wall = upscaled
        ? await encodeWallFromVideo(tpl, srcFile, out, dims.dur)
        : await encodeWall(tpl, srcFile, label, out, big);
      if (!wall) {
        console.log(`- ${tag}: ${dims.w}x${dims.h} source -> ${out.w}x${out.h} ${label}${upscaled ? " (upscale)" : ""}`);
        continue;
      }
      await encodeProxy(wall, out);
      await encodePoster(wall, out);
      facts[tpl.id] = await factFrom(tpl.id, upscaled);
      done.push(tag);
      console.log(
        `+ ${tag}: ${dims.w}x${dims.h} -> ${facts[tpl.id].resolution} ${label}${upscaled ? " upscaled" : ""} · ` +
          `${facts[tpl.id].sizeMb} MB wall / ${facts[tpl.id].previewMb} MB proxy / ${facts[tpl.id].posterMb} MB poster`
      );
    } catch (e) {
      failed.push(`${tag}: ${e.message.split("\n")[0]}`);
      delete facts[tpl.id];
      console.error(`x ${tag}: ${e.message.split("\n")[0]}`);
    }
  }
}

function even(n) {
  return n % 2 === 0 ? n : n + 1;
}

async function factFrom(id, upscaled) {
  const p = templateAssetPaths(id);
  const wall = path.join(OUT_DIR, `${id}.mp4`);
  const proxy = path.join(ROOT, "public", p.preview.replace(/^\//, ""));
  const poster = path.join(ROOT, "public", p.thumb.replace(/^\//, ""));
  const dims = await probe(wall);
  return {
    resolution: `${dims.w}x${dims.h}`,
    sizeMb: mb(await sizeOf(wall)),
    previewMb: mb(await sizeOf(proxy)),
    posterMb: mb(await sizeOf(poster)),
    upscaled,
  };
}

// The catalog owns the recipe table; importing it lazily keeps this file honest
// about which drift a template is supposed to carry.
let recipeModule = null;
async function recipeMotion(tpl) {
  recipeModule ??= await import(pathToFileURL(path.join(ROOT, "lib", "template-recipes.ts")).href);
  return recipeModule.getRecipeFor(tpl).motion;
}

await Promise.all(Array.from({ length: opts.jobs }, worker));

if (!opts.dryRun) {
  await writeFacts(facts);
  console.log(`\nwrote lib/template-facts.ts (${Object.keys(facts).length} rows)`);
  if (failed.length) {
    console.log(`\nTOO BIG / FAILED (${failed.length}):`);
    for (const f of failed) console.log(`  ${f}`);
    console.log(
      "Those entries keep serving their source artwork until a lighter render exists — nothing is half-written."
    );
  }
  console.log(`rendered this run: ${done.length}`);
}
