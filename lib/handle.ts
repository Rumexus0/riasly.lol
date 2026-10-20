// riasly — handle (username) validation, shared by the availability API and the
// dashboard "change handle" action so the two can never disagree about what is a
// legal, free handle. Keeping the regex + reserved list here (rather than inline in
// the route) is what lets the server action reject the exact same set a visitor was
// told was taken, instead of racing the database to find out.

/** Lower-cased slugs no account may own — they collide with app routes/pages. */
export const RESERVED_HANDLES = new Set([
  // Every static top-level route in app/. tests/handles.test.ts walks the real
  // route tree and fails the build if one of these is missing, so adding a page
  // without reserving its slug cannot silently let someone claim it.
  "admin",
  "api",
  "login",
  "signup",
  "signin", // next-auth's own pages (/api/auth/signin) and the intended verb
  "verify", // /verify — the email-code step
  "dashboard",
  "pricing",
  "faq",
  "support",
  "status",
  "help",
  "terms",
  "privacy",
  "about",
  "blog",
  "recovery",
  "redeem",
  "leaderboard",
  "changelog",
  // Nested segments and reserved filenames: none of them is a top-level URL today,
  // but each is either a path a future page could take or one a crawler/user will
  // type, and a handle squatting it is impossible to reclaim once it is taken.
  "files",
  "media",
  "uploads",
  "templates",
  "widgets",
  "badges",
  "robots", // /robots.txt
  "sitemap", // /sitemap.xml
  // The classic link-in-bio prefix. It is the only single-character case worth
  // listing: a two-character handle is unreachable, so "me" and friends cannot be
  // claimed and are deliberately absent — tests/handles.test.ts enforces that.
  "u",
  // Anti-squat: squat-prone / brand-adjacent slugs that must stay off the market.
  // Kept in code (not the DB) so they are version-controlled and can never drift.
  "root",
  "test",
  "demo",
  "official",
  "riasly", // the brand itself — never a user handle
  "flex", // the previous brand: kept closed so the old address stays unclaimable
  "contact",
  "info",
  "www",
  "mail",
  "cdn",
  "static",
  "assets",
  "docs",
  "guide",
  "guides",
  "news",
  "press",
  "careers",
  "jobs",
  "brand",
  "brands",
  "media",
  "staff",
  "mod",
  "moderator",
  "moderators",
  "team",
  "beta",
  "dev",
  "staging",
]);

// One alphanumeric, then optionally up to 28 more characters in which a hyphen may
// only sit between alphanumerics. Net effect: length 1 or 3–30, lowercase, never a
// leading or trailing hyphen. A two-character slug is unreachable by construction,
// which tests/handles.test.ts pins — an earlier comment called this "3–30" and the
// single-character branch was invisible to anyone reading it (that branch is why
// "u" is in the reserved list above: a one-letter handle is accepted shape).
export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;

/** Shape check only (case-folded): reserved + regex, no database round-trip. */
export function isValidHandleFormat(handle: string): boolean {
  const h = handle.trim().toLowerCase();
  return HANDLE_RE.test(h) && !RESERVED_HANDLES.has(h);
}
