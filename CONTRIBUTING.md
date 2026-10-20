# Contributing to riasly

Thanks for helping. This is a real, running application — not a demo — so the bar below is what
keeps it reviewable by someone who did not write the code.

## Setup

Follow the **Quick start** in [README.md](README.md#quick-start). You need Node ≥ 22.9
(`nvm use`) and a MySQL 8 database pointed at by `DATABASE_URL`. After cloning:

```bash
cp .env.example .env    # fill in DATABASE_URL + AUTH_SECRET at minimum
npm ci
npm run db:push
npm run templates:build
npm run dev
```

## The gate list (run before you push)

CI runs exactly these, in this order. A green local run should be a green CI run.

```bash
npm run check:i18n       # EN/TR leaf-key parity
npm run lint             # eslint .
npm run test             # vitest run
npm run typecheck        # tsc --noEmit
npm run templates:verify # committed template facts match local renders (no DB)
npm run build            # next build
```

You can run the whole local gate with the individual commands above; `prebuild` already wires
`check:i18n` into `build`, but run it explicitly so a failure points at the right step.

## Code conventions this repo enforces

Most "rules" here are not style preferences — they are invariants a test checks, so breaking one
fails the build rather than causing a subtle runtime bug.

1. **Every source file opens with a "why this exists" comment block**, not straight into an
   import. The header explains *why the file is separate*, which is what makes the codebase
   navigable for a newcomer. `tests/architecture.test.ts` enforces this for every `lib/*.ts`.

2. **`lib/*` has a client-safe ↔ server-only contract.** A module is either safe to import from a
   client component (no `node:*`, no `@prisma/client`, no `next/headers`/`server-only`) or it is
   explicitly server-only. Do not let a client-safe module (e.g. `lib/widgets.ts`,
   `lib/format.ts`, `lib/media-kind.ts`) grow a server-only import. `tests/architecture.test.ts`
   checks this in both directions.

3. **`lib/backgrounds.ts` must stay database-free.** `scripts/build-templates.mjs` imports it in a
   plain Node process with **no Prisma client and no `DATABASE_URL`**. Adding a Prisma/DB import
   there does not error loudly — it silently breaks `npm run templates:verify` (the 65-template
   check). A test pins its import list to keep it honest.

4. **One function per fact.** Where the same rule is needed in several places (the handle regex,
   the upload directory, the widget origin set), it lives in exactly one exported helper. If you
   find yourself copy-pasting a literal or regex, extract it. Recent examples: `HANDLE_RE` in
   `lib/handle.ts`, `uploadDir()` in `lib/storage.ts`.

5. **Reserved handles vs. routes.** `RESERVED_HANDLES` in `lib/handle.ts` must contain every
   static top-level route under `app/`. `tests/handles.test.ts` walks the real route tree and
   fails if a new page/route segment is added without reserving it — this is what prevents a user
   claiming a handle that shadows a feature.

## Internationalisation (EN + TR together)

Every user-facing string lives in **both** `dictionaries/en.json` and `dictionaries/tr.json`.
A new key in one file with no counterpart fails `npm run check:i18n` (and therefore the build).
Add the two translations in the same commit. Changing a value is fine; changing a *key* means
updating every call site.

## Pull requests

- Use the PR template's checklist — it is the same gate list CI runs.
- Keep history reviewable: one logical change per commit, conventional-commit messages
  (`fix(upload): …`, `feat(http): …`, `chore(deps): …`).
- Never commit secrets, real `.env` values, `storage/uploads/`, or `public/templates/` — they are
  `.gitignore`d for a reason (user bytes and build artifacts).
- If your change touches uploads/storage, auth, handles, or the widget embed parser, read the
  relevant section of [SECURITY.md](SECURITY.md) first — these are the security-sensitive paths
  listed in [CODEOWNERS](.github/CODEOWNERS).

## Reporting security issues

Do **not** open a public issue or PR for a vulnerability. Follow
[SECURITY.md](SECURITY.md#reporting-a-vulnerability).
