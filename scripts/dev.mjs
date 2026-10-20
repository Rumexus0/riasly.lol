// Dev launcher: starts the web server and the Discord presence worker together so
// `npm run dev` keeps the site live AND keeps pulling Discord data continuously.
//
// Hand-rolled on purpose — no `concurrently`/`npm-run-all` dependency. It spawns
// both children with `process.execPath` (never `npm.cmd`, which trips a false-
// positive guard in some shells), prefixes their output with `[web]`/`[bot]`,
// forwards Ctrl+C (SIGINT) / SIGTERM to both, and tears the pair down together.
//
// The worker is co-launch-safe: it takes a TCP single-instance lock on
// 127.0.0.1:8757 and exits 0 both when another instance already holds it and when
// DISCORD_BOT_TOKEN/DISCORD_GUILD_ID are unset. A `bot` exit of 0 therefore means
// "nothing for me to do", NOT "shut everything down" — so we keep the web server
// alive in that case. Only the web child exiting (or a bot crash with a non-zero
// code) brings the whole session down.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const worker = path.join(root, "scripts", "discord-presence-worker.mjs");

const children = [];
let closing = false;

function run(name, args) {
  const tag = `[${name}] `;
  const child = spawn(process.execPath, args, { cwd: root, env: process.env });
  children.push(child);

  // Prefix every line with the tag; a bare trailing chunk stays on its line.
  const pipe = (stream, out) =>
    stream?.on("data", (buf) =>
      out.write(tag + buf.toString().replace(/\n(?=.)/g, `\n${tag}`)),
    );
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);

  child.on("error", (err) => {
    console.error(`${tag}failed to start: ${err.message}`);
    shutdown(1);
  });

  child.on("exit", (code, sig) => {
    if (closing) return;
    // A clean worker exit is expected (no config, or another instance holds the
    // lock) — the web server must keep running.
    if (name === "bot" && (code === 0 || sig === "SIGINT" || sig === "SIGTERM")) {
      console.log(`${tag}bot kapandı (yapılandırma yok veya mevcut örnek çalışıyor) — web devam ediyor`);
      return;
    }
    console.log(`${tag}exited (${sig ?? code})`);
    shutdown(sig === "SIGINT" ? 0 : (code ?? 0));
  });

  return child;
}

function shutdown(code) {
  if (closing) return;
  closing = true;
  for (const c of children) {
    try {
      c.kill("SIGINT");
    } catch {
      // already gone
    }
  }
  setTimeout(() => process.exit(code), 400);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("web", [nextBin, "dev"]);
run("bot", [
  "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
  "--env-file-if-exists=.env",
  worker,
]);
