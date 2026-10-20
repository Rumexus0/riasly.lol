<!--
  riasly — PR template. The checklist below is the same gate list CI enforces, so a
  PR that passes locally should pass here. Keep it short: describe WHY, not just WHAT.
-->

## What & why

<!-- One or two paragraphs: the problem, the approach, and anything a reviewer cannot
     infer from the diff (a deliberate trade-off, a data decision, a security nuance). -->

## Checklist

Every gate below must be green before this is mergeable — CI runs the same list.

- [ ] `npm run check:i18n` — any new user-facing string exists in **both** `dictionaries/en.json` and `dictionaries/tr.json`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run typecheck`
- [ ] `npm run templates:verify`
- [ ] `npm run build`

## Domain notes (delete the ones that don't apply)

- [ ] Touched `lib/*`? Client-safe modules (`media-kind`, `format`, `profile-style`, `backgrounds`, `widgets`, `platforms`) must not import server-only code — `tests/architecture.test.ts` will fail otherwise.
- [ ] Added a top-level route under `app/`? Add its slug to `RESERVED_HANDLES` in `lib/handle.ts` — the route-drift guard in `tests/handles.test.ts` fails if you don't.
- [ ] Changed uploads/storage/`UPLOAD_DIR`? Confirm bytes still stay out of `public/` and reads still go through `/api/files` or `/api/media`.
- [ ] No secrets, real `.env` values, or `storage/uploads` / `public/templates` artifacts committed.

## Screenshots

<!-- For UI changes, before/after. -->
