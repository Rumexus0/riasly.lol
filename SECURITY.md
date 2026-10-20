# Security Policy

## Reporting a vulnerability

Please report security issues **privately**, not through a public issue. Use
**GitHub → Security → Report a vulnerability** to open a private security advisory, or
contact the maintainer directly if that is unavailable. Include:

- a description and impact of the issue,
- the affected commit/version and how to reproduce it,
- any proof-of-concept (redact anything that exposes other users).

We aim to acknowledge private reports within a few days and will coordinate a fix and
disclosure timeline with you. Do not open a public issue or PR for an unpatched
vulnerability.

## Scope

This app is a public, multi-user link-in-bio + file-hosting platform. In-scope surfaces
include the public profile pages (`/[handle]`), the authenticated file routes
(`/api/files`, `/api/media`), the upload pipeline (`/api/upload`), auth (email
verification, TOTP 2FA, OAuth, session/device cookies), server actions in
`app/actions/*`, and the widget-embed parser (`lib/widgets.ts`).

Out of scope: attacks requiring physical access to the host, social engineering, and
denial-of-service against infrastructure you do not own.

## Threat model notes

- **User bytes are never served statically.** Uploads are stored outside `public/` (see
  [`lib/storage.ts`](lib/storage.ts)) and are only reachable through the authenticated
  `/api/files` / `/api/media` read paths, which enforce `FileAsset.isPrivate` and set
  `X-Content-Type-Options: nosniff`. This closes an earlier class of bug where bytes placed
  in the web root were readable by URL with no auth.
- **Widget embeds are derived, not stored verbatim.** A user pastes a source link;
  `resolveEmbed` parses it against a fixed provider allowlist and stores a canonical URL.
  The renderer re-checks the origin before writing a `src`, so a tampered row can only point
  at an allowlisted host. No user input reaches the DOM as markup.
- **Security headers** are set globally in [`next.config.mjs`](next.config.mjs). The Content
  Security Policy is currently **report-only** (`Content-Security-Policy-Report-Only`) while the
  per-widget embed behaviour is validated; promotion to enforcement is tracked as a deliberate
  step, not an oversight.

## Known issues

`npm audit --omit=dev` still reports advisories at the time of writing. They are **transitive
and gated behind major upgrades the maintainers have deliberately deferred** (breaking majors
are a human decision, and Dependabot is configured for minor/patch only). Each has a concrete
resolution path:

| Package (path) | Severity | Why it is still open | Resolution |
| --- | --- | --- | --- |
| `postcss` (bundled **inside `next`**) | high (XSS / arbitrary file read via `sourceMappingURL`) | The top-level `postcss` dev dependency is patched (≥ 8.5.23), but `next@15` ships its own `postcss@8.4.31` that only a framework upgrade replaces. | Fixed by `next@16` (deferred major). |
| `nodemailer` (via `@auth/core` ← `next-auth@5` beta) | high (delivery / DoS advisories) | `next-auth@5` beta pins `nodemailer: "^7 \|\| ^8"`; bumping the app's copy to the patched v10 dedupes the whole tree onto a version next-auth rejects and breaks install. There is no patched 8.x. | Fixed when next-auth accepts nodemailer v10 / ships a patched pin (or a stable v5). The app's own mail surface uses `createTransport` + `sendMail`, unchanged across versions. |
| `tailwindcss` (3.x line) | — | The 3.x line tops out at **3.4.19**, which is itself the affected version; there is no patched 3.x. | Fixed by the Tailwind v4 major (deferred). |
| `next-auth` (`5.0.0-beta`) | moderate | beta release line by design. | Upgrade to a stable Auth.js v5 release when available. |
| `deepmerge-ts` (via `@prisma/config` ← Prisma 6) | high | Transitive of the Prisma toolchain. | Cleared by the upstream Prisma patch. |
| `tinypool` (via `vitest@3`, **dev-only**) | critical (prototype-pollution → RCE gadget) | Reachable only through the local test runner, not shipped to production. | Fixed by `vitest@5` (deferred major). |

Because the deferred fixes all sit behind majors, this repository's production dependency
(`--omit=dev`) audit will not reach zero until those majors are taken. That is a known, tracked
state — not a hidden one. If you believe any of the above is exploitable in **your** deployment
configuration, please report it privately as above.

## Deployment hardening checklist

- Generate a unique `AUTH_SECRET`; never reuse the `.env.example` value.
- Serve over TLS and forward `x-forwarded-proto: https` so HSTS is emitted.
- Configure `x-forwarded-for` / `x-real-ip` at the proxy, otherwise the signup/verify rate
  limiters share a single `"unknown"` bucket.
- Restrict `ADMIN_EMAILS` to the smallest set that needs the badge panel.
- Keep `UPLOAD_DIR` outside the web root (the default already is) and never point it at a
  statically served directory.
