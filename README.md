# riasly

> Everything you want, right here.

**riasly** is an open-source, self-hostable **link-in-bio + file-hosting** platform for
creators and gamers. One account gets a public profile at `riasly.lol/<handle>` with
customisable widgets, plus a private, quota-managed drive for the files it serves back
through authenticated URLs.

This repository is the full application — web app, presence worker, build scripts,
database schema and tests — prepared for public contribution.

---

## What it does

- **Public profile pages** (`/[handle]`) — link-in-bio with customisable styling: gradients,
  effects, cursor, background video/image/audio with an author-chosen autoplay loop, and a
  widget hub.
- **Widget hub** — YouTube, Spotify, SoundCloud and Twitch embeds (plus Discord, GitHub,
  Telegram, Roblox, Steam/CS, last.fm, weather, timezone cards). Users paste a source link;
  the server parses it against a fixed provider set and stores a *canonical* embed URL — never
  raw user HTML. See [`lib/widgets.ts`](lib/widgets.ts).
- **File hosting** — upload avatars, backgrounds, cursors, sounds and general files. Free plan
  is capped (default 5 GB, the number the pricing copy promises); premium is unlimited. Bytes
  live **outside** the web root and are only readable through the authenticated `/api/files`
  and `/api/media` routes. See [`lib/storage.ts`](lib/storage.ts).
- **Discord integration** — presence card (live "Playing…" via an optional bot, with a Lanyard
  fallback), server/badge cards, and a public `@handle → Discord` resolver.
- **Account security** — email verification for new signups, TOTP two-factor auth with hashed
  backup codes, per-IP signup throttling, handle-change cooldown (anti-squat), device sessions.
- **Internationalised** — every string ships in **English and Turkish**, with a CI parity gate.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router, React Server Components + Server Actions) |
| Auth | Auth.js v5 (`next-auth@5` beta) + Prisma adapter |
| Database | MySQL 8 via Prisma 6 |
| i18n | next-intl 4 |
| Styling | Tailwind CSS 3 |
| Media | ffmpeg-static / ffprobe-static (server-side render + probe) |
| Email | Nodemailer (SMTP) |
| Tests | Vitest (pure-logic unit + architecture rules) |

## Requirements

- **Node.js ≥ 22.9** (`.nvmrc` pins 24; `nvm use`). The floor is real: the `discord:worker`
  and `templates:*` scripts rely on `--env-file-if-exists` and `--experimental-strip-types`,
  which do not exist on older Node and fail silently there.
- **MySQL 8** reachable via `DATABASE_URL`.
- `ffmpeg` is provided by `ffmpeg-static`, so you do not need a system install.

## Quick start

```bash
nvm use
cp .env.example .env        # then fill in real values
npm ci
npm run db:push             # create the schema (see "Schema discipline" below)
npm run templates:build     # generate the template gallery renders
npm run dev                 # web server + Discord presence worker
```

**Why `templates:build` is required.** The template facts table
([`lib/template-facts.ts`](lib/template-facts.ts)) is committed, but the large rendered
image/video files it describes are **not** (they are `.gitignore`d). `templates:build` renders
them locally so the gallery shows artwork instead of dead links; `templates:verify` checks that
every committed fact still matches a local render (CI runs this).

**Two processes, one command.** `npm run dev` starts the web server and the Discord presence
worker together ([`scripts/dev.mjs`](scripts/dev.mjs)). The worker is safe to co-launch: it takes
a TCP single-instance lock on `127.0.0.1:8757` and **exits 0** when another instance already holds
the lock *or* when `DISCORD_BOT_TOKEN`/`DISCORD_GUILD_ID` are unset — a `bot` exit of `0` means
"nothing for me to do", not "shut everything down", so the web server keeps running. To run the
worker on its own: `npm run discord:worker`.

## Configuration

Every key is documented inline in [`.env.example`](.env.example). Summary:

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | MySQL connection string (Prisma) | — (required) |
| `AUTH_SECRET` | Auth.js session secret (`openssl rand -base64 32`) | — (required) |
| `AUTH_URL` / `NEXT_PUBLIC_APP_URL` | Where the app is served | `http://localhost:3000` |
| `NEXT_PUBLIC_SITE_URL` | Canonical public origin (only if it differs from the app URL) | falls back to app URL |
| `AUTH_*_ID` / `AUTH_*_SECRET` | Optional Google/GitHub/Discord OAuth; buttons appear only when set | unset |
| `DISCORD_BOT_TOKEN` / `DISCORD_GUILD_ID` | Optional live presence + authoritative badges for the worker | unset (Lanyard fallback) |
| `UPLOAD_DIR` | Where user bytes live on disk | `./storage/uploads` |
| `MAX_UPLOAD_MB` / `AVATAR_MAX_MB` | Per-upload ceilings | `100` / `8` |
| `FILE_QUOTA_GB` | Free-plan total storage, in GB (`0` disables the check) | `5` |
| `SMTP_*` | Nodemailer transport for verification / 2FA / email-change codes | unset (flows fail closed) |
| `REQUIRE_EMAIL_VERIFICATION` | Gate new signups on email verification | `true` |
| `ADMIN_EMAILS` | Comma-separated allow-list for the badge admin | unset (panel hidden) |
| `HANDLE_CHANGE_COOLDOWN_DAYS` / `SIGNUP_IP_HOURLY_LIMIT` / `VERIFY_IP_HOURLY_LIMIT` | Anti-abuse knobs | `30` / `3` / `5` |

**Email verification self-disables.** `REQUIRE_EMAIL_VERIFICATION` is honoured only when the
SMTP block is configured. With no transport nothing can deliver a code, so forcing it would
reject every signup and `git clone && npm run dev` would not work — the gate turns itself off
instead. Accounts created before the feature are never affected.

## Architecture map

- **`app/actions/*` is the only mutation surface.** Every write is a typed Server Action; reads
  and rendering live in `app/**/page.tsx` and route handlers.
- **`lib/*` has a strict client-safe ↔ server-only split.** Some modules
  (`media-kind`, `format`, `profile-style`, `backgrounds`, `widgets`, `platforms`) must stay
  importable from client components and import nothing Node/server-only; others
  (`storage`, `db`, `auth-session`, `verify-cookie`) are server-only. [`tests/architecture.test.ts`](tests/architecture.test.ts)
  enforces both directions.
- **Middleware runs on the Edge runtime and cannot touch Prisma.** It only checks that a session
  *token is present*; whether that account still exists in the database is decided page-side in
  `lib/auth-session.ts`. That split is what stops a stale cookie from ping-ponging `/login` ⇄
  `/dashboard`. See [`middleware.ts`](middleware.ts).
- **Public handles and routes can't collide.** `RESERVED_HANDLES` in [`lib/handle.ts`](lib/handle.ts)
  reserves every static top-level route; a test walks the real `app/` tree and fails if a new
  route is added without reserving it.

## Internationalisation

Strings live in [`dictionaries/en.json`](dictionaries/en.json) and
[`dictionaries/tr.json`](dictionaries/tr.json). `npm run check:i18n`
([`scripts/i18n-audit.mjs`](scripts/i18n-audit.mjs)) fails when a leaf key exists in one locale
but not the other, and it is wired as the `prebuild` hook — so a partial translation cannot
survive a build. **Any new user-facing string must land in both files in the same change.**

## Schema discipline

This repo does **not** carry `prisma/migrations`. The schema is applied with `npm run db:push`
and CI runs `prisma db push` against a throwaway MySQL so schema drift is caught on every PR.
Keep this discipline if you fork: treat `schema.prisma` as the single source of truth.

## Deployment notes

- Build with `npm run build` and serve with `npm start` (or a standalone output). Set `AUTH_URL`
  to the real public origin and provide `AUTH_SECRET`.
- **Put a TLS-terminating proxy in front and forward `x-forwarded-proto: https`** — HSTS is only
  emitted for requests that arrive over TLS (see `next.config.mjs`).
- The signup/verify rate limiters key on `x-forwarded-for` (first hop) or `x-real-ip`. **If your
  proxy does not set one, all traffic collapses to a shared `"unknown"` bucket** and the limit is
  applied globally rather than per client — configure the forwarding headers.

## Known limitations

These are intentional, tracked trade-offs — not bugs:

- **`next-auth` is a v5 beta** and **`next` is held at 15**. Upgrading `next@15 → 16` and moving
  off the beta are deliberate human decisions (Dependabot is configured for minor/patch only).
  A handful of advisories only clear on those majors; they are listed in
  [`SECURITY.md`](SECURITY.md#known-issues).
- **`postcss` inside `next`'s bundle** still has a published advisory; it is not the top-level
  dev dependency (which is patched) and is only removable via `next@16`.
- **No end-to-end test suite.** Coverage is six gates (i18n parity, lint, unit, typecheck,
  template verify, build) plus pure-logic unit tests. Playwright e2e is a planned follow-up.
- **Single-machine, disk-backed storage.** `UPLOAD_DIR` is a local path; object storage (S3/R2)
  is out of scope for this repo.

## Third-party assets

The MIT license covers **source code only**. This project references and hotlinks assets it does
not own:

- **Discord badges** in [`public/discord-badges/`](public/discord-badges/) are trademarks of
  Discord Inc., reproduced here nominatively for the profile badge card.
- **Background artwork** in [`lib/backgrounds.ts`](lib/backgrounds.ts) is hotlinked from
  **Mixkit** (free stock loops) and **Wallhaven** (4K stills) under their respective terms; it is
  not vendored here.
- **Fonts**: Satoshi via Fontshare, under the **SIL Open Font License**.
- **ffmpeg-static** is distributed under the **LGPL**.
- The `riasly` name, logo and gem mark are **not** licensed for reuse.

`public/templates/` (build output) and `storage/uploads/` (user bytes) are `.gitignore`d and must
never be committed.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md). In short: run the gate list before pushing —
`check:i18n`, `lint`, `test`, `typecheck`, `templates:verify`, `build` — all of which CI enforces.

## License

[MIT](LICENSE) — code only. See [Third-party assets](#third-party-assets) for what that does not
cover.
