// riasly — Discord presence worker. A separate, persistent process.
//
// What it does: keeps one gateway websocket open as our bot, listens for
// PRESENCE_UPDATE events in OUR guild, and writes the newest known state per user
// into DiscordPresence. `GET /api/discord/<handle>` then answers with a live
// "Playing …" line, and the browser never has to talk to Lanyard.
//
// Why a separate process (and not instrumentation.ts): every `next dev` restart
// and every deploy would drop the socket and empty the presence state, and more
// than one Next instance would mean more than one identify for the same bot.
//
// Why no dependency: the whole job is a handful of opcodes and three events. Node
// 24 ships a global WebSocket, so a library would only add moving parts — this
// matches the rest of the project, which hand-rolls OAuth and ffmpeg as well.
//
// Configuration (see .env.example): DISCORD_BOT_TOKEN + DISCORD_GUILD_ID. Without
// either, this process exits immediately and says so; the site keeps working
// because the card falls back to Lanyard.
//
// Secrets: the bot token is never logged, and the activity that reaches the
// database is rebuilt field by field from a whitelist, so nothing extra Discord
// hands us (party ids, session ids) can be stored by accident. The whitelist does
// carry `timestamps.start` and the split asset names on purpose: the profile card
// shows an elapsed-time readout and a tile+corner-badge pair, and both are
// session-stable public presence data, not secrets.

import { createServer } from "node:net";
import { PrismaClient } from "@prisma/client";

const GATEWAY_VERSION = "10";

// Gateway opcodes this process actually speaks.
const OP_DISPATCH = 0;
const OP_HEARTBEAT = 1;
const OP_IDENTIFY = 2;
const OP_HEARTBEAT_ACK = 11;
const OP_RECONNECT = 13;
const OP_HELLO = 10;
const OP_INVALID_SESSION = 9;
const OP_REQUEST_MEMBERS = 8;

// GUILDS (1 << 0) + GUILD_PRESENCES (1 << 8 = 256). GUILD_PRESENCES is privileged:
// it must be enabled in the Developer Portal (Bot → Privileged Gateway Intents), or
// the gateway closes with 4013 — see CLOSE_HINTS.
// The bit is 256, NOT 4096: 4096 is DIRECT_MESSAGES, which is unprivileged, so a
// typo there produces a healthy-looking connection that simply never receives a
// single PRESENCE_UPDATE and gets no `presences` in GUILD_CREATE or in an op 8 chunk
// (Discord forces `presences = false` without the intent). The IDENTIFY log line in
// identify() exists to keep that failure mode visible.
const INTENTS = 1 | 256;
// GUILD_MEMBER_REMOVE and the full op 8 member list additionally need GUILD_MEMBERS
// (1 << 1 = 2), a second privileged switch. It stays opt-in: the stale sweep covers
// leavers without it.
const INTENTS_WITH_MEMBERS = INTENTS | 2;
// The same switch decides whether op 8 may be sent at all: without GUILD_MEMBERS
// Discord answers the request with nothing, so asking would only hide the problem.
const WANTS_MEMBERS_INTENT = process.env.DISCORD_PRESENCE_MEMBERS_INTENT === "1";

const TRACK_QUERY_MS = 60_000; // refresh "who has a Discord link at all"
const FLUSH_MS = 2_000; // dirty rows are written in batches
const MIN_ROW_GAP_MS = 5_000; // per user: never hammer the database
const BEAT_MS = 60_000; // proof of life for the reader (lib/discord-presence.ts)
const SWEEP_MS = 6 * 60 * 60 * 1000; // stale-row sweep
const SWEEP_OLDER_THAN_MS = 24 * 60 * 60 * 1000;
const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 60_000;
// The gateway only sends presence on CHANGE, so a row that disappears (a disconnect,
// a manual delete, a database reset) would never come back on its own. One reconciling
// pass per beat makes the database the thing we trust, not our memory.
const RECONCILE_MS = BEAT_MS; // 60s: "deleted externally" is healed within a minute
const SEED_COOLDOWN_MS = 5 * 60 * 1000; // per user: never re-ask for the same id sooner
const SEED_BATCH = 100; // Discord caps a `user_ids` request at 100 returned members

// Single-instance guard. MySQL's GET_LOCK is connection-scoped, and Prisma hands
// every raw query a pooled connection that may be closed later, so an advisory
// lock would silently evaporate. Loopback TCP is honest instead: it is exactly as
// strong as the accident it needs to stop (the same command started twice in two
// terminals) and it is released by the OS when the process dies.
const LOCK_HOST = "127.0.0.1";
const LOCK_PORT = Number(process.env.DISCORD_WORKER_PORT) || 8757;

const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

log("starting up");
if (!token || !guildId) {
  log(
    "DISCORD_BOT_TOKEN and/or DISCORD_GUILD_ID is missing — nothing to do. " +
      "Profiles keep using the Lanyard fallback until both are set."
  );
  process.exit(0);
}

const prisma = new PrismaClient({ log: ["warn", "error"] });

let ws = null;
let seq = null;
let heartbeatTimer = null;
let heartbeatInterval = null;
let reconnectTimer = null;
let lockServer = null;
let backoffMs = BACKOFF_MIN_MS;
let heartbeatAcked = true;
let stopping = false;
// One member-list request per connection: READY and GUILD_CREATE both notice the
// gap, and asking twice only spends gateway quota.
let membersRequested = false;

// Snowflakes we care about: an event for anybody else is dropped without a write.
// Replaced wholesale by refreshTracked() rather than cleared, so an event landing
// mid-refresh cannot read an empty set and be thrown away for good.
let tracked = new Set();
// The row we believe the database holds for each user, so an unchanged event is free.
// `reconcile()` revalidates it against the database: a row can be deleted by somebody
// else, and an assumption that survives that would silence writes forever.
const lastKnown = new Map();
// Rows waiting for the next flush.
const dirty = new Map();
// Last actual write per user, for MIN_ROW_GAP_MS.
const wroteAt = new Map();
// When we last asked the gateway about a user we have nothing for (SEED_COOLDOWN_MS).
const seededAt = new Map();
// Ids an op 8 answer already covered, presence or not: asking again returns the same
// nothing, so they stop being seed candidates until the next connection.
const seedResolved = new Set();
// Ids Discord answered with `not_found` — linked users who are not in our guild.
const notInGuild = new Set();

void main();

async function main() {
  if (!(await acquireProcessLock())) {
    log(`another worker already holds ${LOCK_HOST}:${LOCK_PORT} — exiting.`);
    await prisma.$disconnect();
    process.exit(0);
  }
  await refreshTracked();
  await seedLastKnown();
  connect();

  setInterval(() => void refreshTracked(), TRACK_QUERY_MS);
  setInterval(() => void flushDirty(), FLUSH_MS);
  void beat();
  void sweepStaleRows();
  setInterval(() => void beat(), BEAT_MS);
  setInterval(() => void sweepStaleRows(), SWEEP_MS);
  // Deliberately not run immediately: the first pass is useful once the startup
  // snapshot and its op 8 answer have landed, otherwise it would ask the gateway for
  // members it is about to be handed anyway.
  setInterval(() => void reconcile(), RECONCILE_MS);

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  // Nothing here is worth killing the process for: a failed write is retried by
  // the flush loop, a failed read keeps the previous tracked set.
  process.on("unhandledRejection", (reason) => log(`unexpected error: ${reason}`));
}

// ------------------------------------------------------------------ connection

function connect() {
  if (stopping) return;
  clearReconnect();
  seq = null;
  heartbeatAcked = true;
  membersRequested = false;
  // A fresh connection rebuilds the truth from READY/GUILD_CREATE, so everything we
  // remembered about "already asked" and "not in this guild" is dropped with it.
  seededAt.clear();
  seedResolved.clear();
  notInGuild.clear();

  log("connecting to the gateway");
  ws = new WebSocket(`wss://gateway.discord.gg/?v=${GATEWAY_VERSION}&encoding=json`);
  ws.addEventListener("message", (event) => void onMessage(event.data));
  ws.addEventListener("close", (event) => onClose(event.code, event.reason));
  ws.addEventListener("error", () => log("websocket error (the close handler retries)"));
}

function onClose(code, reason) {
  stopHeartbeat();
  if (stopping) return;
  log(`gateway closed (${code}${reason ? `: ${reason}` : ""})`);
  const hint = CLOSE_HINTS[code];
  if (hint) {
    // Retrying an invalid token or a disabled intent only produces log spam and a
    // rate limit, so name the one thing that has to change and stop.
    log(hint);
    void failFast();
    return;
  }
  scheduleReconnect();
}

async function failFast() {
  stopping = true;
  // An explicit exit matters: the housekeeping intervals would otherwise keep a
  // useless process alive with a database connection and a taken lock.
  await releaseProcessLock();
  await prisma.$disconnect();
  process.exit(1);
}

// A gateway RESUME is deliberately not implemented: READY is a full snapshot, so
// every reconnect rebuilds the truth instead of trusting a partial replay. The one
// documented exception is op 9 INVALID_SESSION, which always re-identifies.
const CLOSE_HINTS = {
  4014:
    "Intent disallowed for this event. Enable it in the Developer Portal: Bot → " +
    "Privileged Gateway Intents → “Server Presence Intent”, then start this worker again.",
  4013:
    "Disallowed intent: IDENTIFY asked for a privileged intent that is not enabled. " +
    "Either turn on the matching Portal switch (Bot → Privileged Gateway Intents → " +
    "Server Presence / Server Members) or remove DISCORD_PRESENCE_MEMBERS_INTENT. " +
    "Retrying only repeats the refusal.",
  // 4002 is a plain decode error and 4008 a rate limit: both are transient, so they
  // are deliberately absent here and fall through to the reconnect backoff.
  4003: "Not authenticated — a payload was sent before IDENTIFY finished.",
  4004: "Authentication failed — the bot token is invalid or was revoked.",
  4005: "Already authenticated: this connection sent a second IDENTIFY. Ours sends " +
    "exactly one, so look for a handshake bug here — a worker on another machine does " +
    "NOT show up as 4005; it silently swaps the session.",
  4010: "Invalid shard — this worker connects as shard [0,1].",
  4011: "Sharding required — the guild is too large for a single shard.",
};

function scheduleReconnect() {
  if (stopping) return;
  clearReconnect();
  log(`reconnecting in ${Math.round(backoffMs / 1000)}s`);
  reconnectTimer = setTimeout(connect, backoffMs);
  backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
}

function clearReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function send(payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function closeSocket() {
  try {
    ws?.close();
  } catch {
    /* already gone */
  }
}

async function onMessage(raw) {
  let payload;
  try {
    payload = JSON.parse(typeof raw === "string" ? raw : String(raw));
  } catch {
    return;
  }
  const { op, t, d, s } = payload;
  if (typeof s === "number") seq = s;
  // Gated: with the presence intent correct, a busy guild would log every status
  // flicker of every member, so this stays behind a switch.
  if (process.env.DISCORD_PRESENCE_DEBUG === "1" && op === OP_DISPATCH) {
    log(`dispatch ${t} user=${d?.user?.id ?? "-"}`);
  }

  if (op === OP_HELLO) {
    startHeartbeat(d?.heartbeat_interval);
    identify();
    return;
  }
  if (op === OP_HEARTBEAT_ACK) {
    heartbeatAcked = true;
    return;
  }
  if (op === OP_RECONNECT || op === OP_INVALID_SESSION) {
    log(`gateway asked to ${op === OP_INVALID_SESSION ? "re-identify" : "reconnect"}`);
    closeSocket(); // the close handler reconnects and sends a fresh READY
    return;
  }
  if (op !== OP_DISPATCH) return;

  if (t === "READY") {
    backoffMs = BACKOFF_MIN_MS;
    log(`READY — ${tracked.size} profile(s) tracked`);
    applyGuildSnapshot((d?.guilds ?? []).find((g) => g?.id === guildId) ?? null, "READY");
    return;
  }
  if (t === "GUILD_CREATE") {
    // Only our own guild matters; its payload carries the same snapshot as READY.
    if (d?.id === guildId) applyGuildSnapshot(d, "GUILD_CREATE");
    return;
  }
  if (t === "GUILD_MEMBERS_CHUNK") {
    if (d?.guild_id === guildId) applyMemberChunk(d);
    return;
  }
  if (t === "PRESENCE_UPDATE") {
    const id = d?.user?.id;
    if (id && tracked.has(id)) record(id, d.status, d.activities?.[0]);
    return;
  }
  if (t === "GUILD_MEMBER_REMOVE") {
    const id = d?.user?.id;
    if (id && tracked.has(id) && d?.guild_id === guildId) {
      log("a tracked member left the guild — marking them offline");
      record(id, "offline", null);
    }
  }
  // Discord added a dedicated rate limit for op 8 and reports a dropped request
  // with this event instead of an error code. Without it a missing chunk looks
  // exactly like a guild with nobody online. `retry_after` is SECONDS, and the
  // requested opcode arrives as `opcode` — printing either other field says `undefined`.
  if (t === "RATE_LIMITED") {
    log(`gateway rate limit: opcode=${d?.opcode} retry_after=${d?.retry_after}s`);
  }
}

function identify() {
  const intents = WANTS_MEMBERS_INTENT ? INTENTS_WITH_MEMBERS : INTENTS;
  // Spelled out because a wrong bit is silent: Discord accepts an unprivileged
  // request and simply never sends the data (see the INTENTS comment).
  log(`IDENTIFY intents=${intents} ` +
    `(guilds=${intents & 1 ? "on" : "off"}, ` +
    `members=${intents & 2 ? "on" : "off"}, ` +
    `presences=${intents & 256 ? "on" : "off"})`);
  // `shard: [0, 1]` is what a single-shard bot must send. It is NOT a guard against a
  // second worker: the process lock in acquireProcessLock() only binds 127.0.0.1, so it
  // cannot see another machine, and two workers sharing a bot token from different
  // machines just keep replacing each other's session — which matters because Discord
  // budgets IDENTIFY per token per day. Run this worker on one machine.
  send({
    op: OP_IDENTIFY,
    d: {
      token,
      intents,
      shard: [0, 1],
      properties: { os: "linux", browser: "riasly", device: "presence-worker" },
    },
  });
}

function startHeartbeat(intervalMs) {
  stopHeartbeat();
  const interval = Number(intervalMs);
  if (!Number.isFinite(interval) || interval <= 0) {
    log("HELLO carried no heartbeat interval — forcing a reconnect");
    closeSocket();
    return;
  }
  let unanswered = 0;
  heartbeatAcked = true;
  const beatOnce = () => {
    if (!heartbeatAcked) {
      // Two beats ignored is a dead connection, whatever the socket says.
      if (++unanswered >= 2) {
        log("heartbeat went unanswered — dropping the connection");
        closeSocket();
        return;
      }
    } else {
      unanswered = 0;
    }
    heartbeatAcked = false;
    send({ op: OP_HEARTBEAT, d: seq });
  };
  // Discord's own guidance: jitter the first beat, then keep to the interval.
  heartbeatTimer = setTimeout(() => {
    heartbeatTimer = null;
    beatOnce();
    heartbeatInterval = setInterval(beatOnce, interval);
  }, Math.random() * interval);
}

function stopHeartbeat() {
  if (heartbeatTimer) clearTimeout(heartbeatTimer);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatTimer = null;
  heartbeatInterval = null;
}

// ------------------------------------------------------------------- presence

/**
 * The guild snapshot carries `members` and `presences`. Both are written, and a
 * tracked member the snapshot does not mention is marked offline — that is what
 * makes a restart self-correcting instead of leaving stale rows behind.
 */
function applyGuildSnapshot(guild, source) {
  if (!guild) {
    log(`${source} did not include guild ${guildId} — the bot is not a member of it.`);
    return;
  }
  const members = Array.isArray(guild.members) ? guild.members : null;
  if (!members) {
    log(`${source} arrived without a member list; asking the gateway for it.`);
    requestGuildMembers(source);
    return;
  }

  const seen = new Set();
  const pending = new Set();
  for (const member of members) {
    const id = member?.user?.id;
    if (!id) continue;
    seen.add(id);
    // Membership Screening left them pending: Discord publishes no presence.
    if (member.pending === true) pending.add(id);
  }
  if (guild.lazy) {
    // A `lazy` guild holds only a handful of members in the gateway's cache even at
    // two members total, and PRESENCE_UPDATE is streamed only for cached ones.
    // Without this request the first row for a linked user appears when they happen
    // to change their status — which for a quiet user may never be while we watch.
    log(`${source} member list is lazy (${seen.size} cached); asking for the full list.`);
    requestGuildMembers(source);
  }
  const presences = Array.isArray(guild.presences) ? guild.presences : [];
  for (const presence of presences) {
    const id = presence?.user?.id;
    if (id && tracked.has(id)) record(id, presence.status, presence.activities?.[0]);
  }
  let offlineCount = 0;
  for (const id of tracked) {
    if (seen.has(id) && !pending.has(id)) continue; // a full member: `presences` decides
    // Nothing was ever written about them, so there is no state to correct: most
    // tracked users simply are not in our server, and they need no row.
    if (!lastKnown.has(id)) continue;
    record(id, "offline", null);
    offlineCount += 1;
  }
  // `lazy` + an empty presences array is what a guild without the GUILD_MEMBERS
  // intent looks like: the first real row then arrives with a PRESENCE_UPDATE,
  // which is why this line prints both counts.
  log(`${source} snapshot applied — ${seen.size} member(s)${guild.lazy ? " lazy" : ""}, ` +
    `${presences.length} presence(s), ${tracked.size} tracked, ${offlineCount} set offline`);
}

/**
 * Ask the gateway for the whole member list, presences included. This is the only
 * way to learn a linked user's state before their next status change, because
 * Discord sends no presence REST endpoint and no event for an uncached member.
 */
function requestGuildMembers(source) {
  if (!WANTS_MEMBERS_INTENT) {
    log(`${source}: member list is incomplete and GUILD_MEMBERS is off. ` +
      `Enable "Server Members Intent" in the Portal and set ` +
      `DISCORD_PRESENCE_MEMBERS_INTENT=1 to seed presence at startup; until then the ` +
      `card relies on Lanyard and on status changes.`);
    return;
  }
  if (membersRequested) return;
  membersRequested = true;
  // `query: ""` with `limit: 0` means every member; `presences: true` needs the
  // GUILD_PRESENCES intent we already hold.
  send({
    op: OP_REQUEST_MEMBERS,
    d: { guild_id: guildId, query: "", limit: 0, presences: true },
  });
  log(`${source}: requested the full member list with presences (op 8)`);
}

/**
 * Ask for the presence of exactly the members we are missing.
 *
 * `user_ids` is the cheap door: Discord returns at most 100 of them, the "all
 * members" 1-per-30s bucket is not spent, and the payload stays far under the 4096
 * byte send limit. The full-list request in requestGuildMembers() stays reserved for
 * connection start, where there is nothing more specific to ask for.
 *
 * No `limit`: the document only requires it alongside `query`, and the return is
 * capped at 100 either way.
 *
 * Answers whether anything went out, so a caller cannot claim it seeded while the
 * socket was still down.
 */
function requestUserPresences(ids, reason) {
  if (!WANTS_MEMBERS_INTENT) return false; // op 8 needs GUILD_MEMBERS; see requestGuildMembers
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  const batches = [];
  for (let i = 0; i < ids.length; i += SEED_BATCH) batches.push(ids.slice(i, i + SEED_BATCH));
  const nonce = `s${Date.now().toString(36)}`.slice(0, 32); // nonce is capped at 32 bytes
  for (const batch of batches) {
    for (const id of batch) seededAt.set(id, Date.now());
    send({
      op: OP_REQUEST_MEMBERS,
      d: { guild_id: guildId, user_ids: batch, presences: true, nonce },
    });
  }
  log(`seed (${reason}) — ${ids.length} member(s) asked in ${batches.length} batch(es)`);
  return true;
}

/**
 * The answer to op 8. Discord has shipped the requested presence data both ways —
 * nested in each member object and as a parallel `presences` array on the chunk —
 * so either shape is accepted. Even when neither arrives, the request has done its
 * main job: the members are now in the gateway's cache, and PRESENCE_UPDATE is only
 * ever delivered for cached members.
 */
function applyMemberChunk(chunk) {
  const members = Array.isArray(chunk.members) ? chunk.members : [];
  const standalone = new Map();
  for (const p of Array.isArray(chunk.presences) ? chunk.presences : []) {
    if (p?.user?.id) standalone.set(p.user.id, p);
  }
  let trackedHits = 0;
  let withPresence = 0;
  for (const member of members) {
    const id = member?.user?.id;
    if (!id || !tracked.has(id)) continue;
    trackedHits += 1;
    if (member.pending === true) continue; // screening: Discord publishes no presence
    const presence = member.presence ?? standalone.get(id);
    if (!presence) continue;
    withPresence += 1;
    record(id, presence.status, presence.activities?.[0]);
  }
  // Discord answers ids it could not find with `not_found`; without recording that,
  // reconcile would ask for the same linked users who are simply not in our guild
  // once per minute, forever.
  for (const id of Array.isArray(chunk.not_found) ? chunk.not_found : []) {
    notInGuild.add(id);
    lastKnown.delete(id);
  }
  // Every member that made it back is an answered question, presence or not: one with
  // no presence object is genuinely offline/invisible, which the reader already renders
  // as "nothing to show". Asking again would produce the same nothing.
  for (const member of members) {
    if (member?.user?.id) seedResolved.add(member.user.id);
  }
  log(`member chunk ${chunk.chunk_index ?? 0} — ${members.length} member(s), ` +
    `${trackedHits} tracked, ${withPresence} with presence` +
    (withPresence || !trackedHits ? "" : " (cached now; status changes will stream)"));
}

/**
 * Queue a state change. `lastKnown` makes an unchanged event free, which matters
 * because Discord re-sends whole presence objects for reasons that change nothing.
 */
function record(snowflake, status, activity) {
  const row = { status: cleanStatus(status), activity: cleanActivity(activity) };
  if (sameRow(lastKnown.get(snowflake), row)) return;
  lastKnown.set(snowflake, row);
  dirty.set(snowflake, row);
}

/**
 * Both fields come from `cleanStatus`/`cleanActivity`, so they are either identical
 * strings or the same `null` — a plain field compare is enough and no key has to be
 * rebuilt from them.
 */
function sameRow(a, b) {
  if (!a) return false;
  return a.status === b.status && a.activity === b.activity;
}

function cleanStatus(status) {
  if (status === "online" || status === "idle" || status === "dnd" || status === "offline") {
    return status;
  }
  // "invisible" and anything unexpected read as offline to a visitor, exactly as
  // the Lanyard path does.
  return "offline";
}

/** Whitelist projection of a gateway activity object, as stored JSON text. */
function cleanActivity(activity) {
  if (!activity || typeof activity.name !== "string" || !activity.name) return null;
  const assets = activity.assets && typeof activity.assets === "object" ? activity.assets : {};
  const appId = String(activity.application_id ?? "");
  return JSON.stringify({
    name: activity.name.slice(0, 60),
    details: text(activity.details),
    state: text(activity.state),
    type: Number.isFinite(activity.type) ? Math.trunc(activity.type) : 0,
    appId: /^[0-9]{15,20}$/.test(appId) ? appId : null,
    assetName: firstAsset(assets),
    // Additive: readers that predate these keys ignore them, and older stored
    // rows simply lack them (the read side null-coalesces each one).
    start: epochMs(activity.timestamps && activity.timestamps.start),
    largeAsset: assetField(assets.large_image),
    smallAsset: assetField(assets.small_image),
    // The server an activity is happening in, when Discord reports one. Additive:
    // older rows lack it, and the card only uses it as a hint for which server to
    // show — it never renders a raw id.
    guildId: /^[0-9]{15,20}$/.test(String(activity.guild_id ?? ""))
      ? String(activity.guild_id)
      : null,
  });
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 72) : null;
}

/** Epoch-ms guard for `timestamps.start`; anything odd becomes null. */
function epochMs(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 4e12
    ? Math.trunc(value)
    : null;
}

function assetField(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_:./-]{1,200}$/.test(value) ? value : null;
}

function firstAsset(assets) {
  for (const key of ["large_image", "small_image"]) {
    const value = assetField(assets[key]);
    if (value) return value;
  }
  return null;
}

function flushDirty() {
  if (dirty.size === 0) return Promise.resolve();
  const batch = new Map(dirty);
  return (async () => {
    let deferred = 0;
    let failed = 0;
    for (const [snowflake, row] of batch) {
      const last = wroteAt.get(snowflake) ?? 0;
      if (Date.now() - last < MIN_ROW_GAP_MS) {
        deferred += 1;
        continue; // stays in `dirty`, so the next tick writes the newest state
      }
      try {
        await prisma.discordPresence.upsert({
          where: { snowflake },
          create: { snowflake, status: row.status, activity: row.activity },
          update: { status: row.status, activity: row.activity },
        });
        wroteAt.set(snowflake, Date.now());
        // Identity check: a newer event may already have replaced this row while
        // the write was in flight (the flush interval is never awaited), and an
        // unconditional delete would lose that state for good — `lastKnown` would
        // keep deduping it away.
        if (dirty.get(snowflake) === row) dirty.delete(snowflake);
      } catch (err) {
        failed += 1;
        log(`presence write failed: ${err?.code ?? err}`);
      }
    }
    if (failed) log(`${failed} presence write(s) will be retried`);
    if (deferred) log(`${deferred} write(s) rate-limited, queued for the next flush`);
  })();
}

// ----------------------------------------------------------------- housekeeping

/**
 * What the database already claims, loaded once at start-up.
 *
 * Without it `lastKnown` begins empty, so the very first snapshot would write an
 * `offline` row for every tracked user who is not in our guild — a burst of writes
 * and rows about people the bot can never know anything about. With it, an event
 * that repeats the stored state is free even straight after a restart.
 */
async function seedLastKnown() {
  const rows = await prisma.discordPresence
    .findMany({ select: { snowflake: true, status: true, activity: true } })
    .catch(() => []);
  for (const row of rows) {
    lastKnown.set(row.snowflake, { status: row.status, activity: row.activity });
  }
  log(`${rows.length} stored presence row(s) loaded`);
}

async function refreshTracked() {
  try {
    const rows = await prisma.profile.findMany({
      where: { discordSnowflake: { not: null } },
      select: { discordSnowflake: true },
    });
    // Replace instead of clear-then-fill: a chunk or PRESENCE_UPDATE landing during
    // the await would see an empty `tracked`, fail the `tracked.has(id)` gate and be
    // lost for good — not deduped, simply gone, and reconcile would read the database
    // as "already correct".
    const next = new Set();
    for (const row of rows) if (row.discordSnowflake) next.add(row.discordSnowflake);
    // Somebody who linked a Discord account while we were running is the whole reason
    // this exists: the gateway sent their presence at connection start, not theirs.
    const fresh = [...next].filter((id) => !tracked.has(id));
    tracked = next;
    // Forget people who disconnected, so their id cannot be re-queued.
    for (const id of [...lastKnown.keys()]) {
      if (tracked.has(id)) continue;
      lastKnown.delete(id);
      wroteAt.delete(id);
      dirty.delete(id);
    }
    // A re-link is a new question, so the answers from the previous one are dropped.
    for (const id of fresh) {
      notInGuild.delete(id);
      seedResolved.delete(id);
    }
    if (fresh.length) {
      if (!requestUserPresences(fresh, "new")) {
        // Start-up reaches this before connect(): nothing was asked, and saying
        // otherwise would hide the fact that the first reconcile has to do it.
        log(`${fresh.length} newly linked profile(s) — no gateway yet, reconcile will seed them`);
      }
    }
  } catch {
    log("could not refresh the tracked list — keeping the previous one");
  }
}

/**
 * Make memory and database agree, then make Discord fill the gaps.
 *
 * Three outcomes per tracked user, and the direction of trust matters: a row that
 * exists wins over our memory (another worker or a hand-edit may have corrected it,
 * and re-writing our guess would only fight them), a row that is *missing* is a hole
 * we repair from what we last saw, and a user we never saw at all has to be asked
 * about — the gateway sends presence only on change, so waiting for an event that
 * may never come is exactly how a card got stuck on "offline" after a disconnect
 * deleted its row.
 */
async function reconcile() {
  if (tracked.size === 0) return;
  const ids = [...tracked];
  const rows = [];
  // Sliced to keep one `IN` list small enough to stay a primary-key range scan even
  // when the feature is used by thousands of profiles.
  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500);
    const found = await prisma.discordPresence
      .findMany({
        where: { snowflake: { in: slice } },
        select: { snowflake: true, status: true, activity: true },
      })
      .catch(() => null);
    if (!found) return; // database trouble: keep every assumption and try next beat
    rows.push(...found);
  }
  const present = new Set(rows.map((row) => row.snowflake));
  let adopted = 0;
  let repaired = 0;
  const asking = [];

  for (const row of rows) {
    if (dirty.has(row.snowflake)) continue; // our own queued write wins
    const fresh = { status: row.status, activity: row.activity };
    if (sameRow(lastKnown.get(row.snowflake), fresh)) continue;
    lastKnown.set(row.snowflake, fresh);
    adopted += 1;
  }
  for (const id of ids) {
    if (present.has(id) || dirty.has(id)) continue;
    const known = lastKnown.get(id);
    if (known) {
      // The row we believed in is gone. Forget the write timestamp so the repair is
      // not deferred by MIN_ROW_GAP_MS, and re-queue the state we last saw.
      lastKnown.delete(id);
      wroteAt.delete(id);
      dirty.set(id, known);
      repaired += 1;
      continue;
    }
    if (notInGuild.has(id) || seedResolved.has(id)) continue;
    if (Date.now() - (seededAt.get(id) ?? 0) < SEED_COOLDOWN_MS) continue;
    asking.push(id);
  }
  log(`reconcile — ${ids.length} tracked, ${rows.length} row(s), ` +
    `${repaired} repaired, ${adopted} adopted, ${asking.length} to seed`);
  if (repaired) void flushDirty(); // do not wait two seconds for a row we already know
  if (asking.length) requestUserPresences(asking, "reconcile");
}

/**
 * The reader only trusts presence while this row is recent. Presence events
 * arrive on CHANGE, so a quiet guild updates no rows for hours and `updatedAt`
 * would read as "stale" for perfectly good data — the beat is the freshness proof.
 */
async function beat() {
  await prisma.discordWorkerBeat
    .upsert({ where: { id: "gateway" }, create: { id: "gateway" }, update: { beatAt: new Date() } })
    .catch(() => log("could not write the heartbeat row"));
}

/**
 * Somebody can leave our guild without this process noticing (GUILD_MEMBERS is off
 * by default), so anything untouched for a full day is dropped to offline.
 */
async function sweepStaleRows() {
  const cutoff = new Date(Date.now() - SWEEP_OLDER_THAN_MS);
  const stale = await prisma.discordPresence
    .findMany({
      where: { updatedAt: { lt: cutoff }, status: { not: "offline" } },
      select: { snowflake: true },
    })
    .catch(() => []);
  if (!stale.length) return;
  await prisma.discordPresence
    .updateMany({
      where: { snowflake: { in: stale.map((r) => r.snowflake) } },
      data: { status: "offline", activity: null },
    })
    .catch(() => {});
  // Without this the dedupe in `record()` would swallow every later event for
  // these users: `lastKnown` still holds the pre-sweep key, and the `status not
  // offline` condition above means the row is never picked up again — so a member
  // whose status never changes would stay offline forever.
  for (const row of stale) {
    lastKnown.delete(row.snowflake);
    wroteAt.delete(row.snowflake);
  }
  log(`${stale.length} stale presence row(s) dropped to offline`);
}

function acquireProcessLock() {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (err) => {
      resolve({ ok: false, err });
    });
    server.listen(LOCK_PORT, LOCK_HOST, () => {
      lockServer = server;
      log(`single-instance lock taken on ${LOCK_HOST}:${LOCK_PORT}`);
      resolve({ ok: true });
    });
  })
    .then((result) => {
      if (result.ok) return true;
      if (result.err?.code === "EADDRINUSE") return false;
      log(`could not take the lock (${result.err?.code ?? result.err}); continuing anyway`);
      return true; // a broken guard must not disable presence
    })
    .catch(() => true);
}

async function releaseProcessLock() {
  if (!lockServer) return;
  await new Promise((resolve) => lockServer.close(resolve));
  lockServer = null;
}

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log(`${signal} received — closing down`);
  clearReconnect();
  stopHeartbeat();
  closeSocket();
  void (async () => {
    await flushDirty().catch(() => {});
    await releaseProcessLock();
    await prisma.$disconnect();
    process.exit(typeof process.exitCode === "number" ? process.exitCode : 0);
  })();
}

function log(message) {
  console.log(`[discord-presence] ${message}`);
}
