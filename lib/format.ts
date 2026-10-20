// Client-safe shared localStorage/sessionStorage keys live here, not in the modules
// that own the matching server code: a client component cannot import
// lib/verify-cookie.ts (it pulls next/headers and node:crypto into the bundle), and
// a key duplicated as a bare literal in two components drifts the moment one side
// is edited. This is the handoff value /verify writes after confirming an address
// and /login reads once to prefill it — see components/auth/VerifyEmailForm.tsx.
export const VERIFIED_EMAIL_KEY = "riasly.verifiedEmail";

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes < 0) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

// Locale-fixed integer grouping. A bare `n.toLocaleString()` renders 142000 as
// "142.000" in a tr-TR browser but "142,000" on the server, so every client
// component that shows a count must use this — otherwise React reports a
// hydration mismatch and re-renders the whole subtree.
const COUNT_FORMAT = new Intl.NumberFormat("en-US");

export function formatCount(n: number): string {
  return COUNT_FORMAT.format(n);
}

/**
 * Mask an address for display. The shape stays recognisable — first letter, the
 * domain's suffix — so an owner can tell "that's mine" at a glance while the full
 * address is not painted into every screenshot, hover card or shared render of the
 * page. Used by the Account page's email row and by the verification form.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "•••";
  const [user, domain] = [email.slice(0, at), email.slice(at + 1)];
  const dot = domain.lastIndexOf(".");
  const maskedUser = user[0] + "•".repeat(Math.max(user.length - 1, 3));
  const maskedDomain =
    dot <= 0
      ? "•".repeat(domain.length)
      : "•".repeat(Math.max(dot, 1)) + domain.slice(dot);
  return `${maskedUser}@${maskedDomain}`;
}

// "last seen X ago": pick the largest whole unit that still fits (minutes →
// hours → days → weeks → months) and let Intl.RelativeTimeFormat render it in the
// active locale ("1 hour ago" / "1 saat önce"). A future or zero-ish stamp reads
// "just now" so a clock skew never shows a negative "-5 minutes ago".
const RELATIVE_STEPS: Array<{ unit: Intl.RelativeTimeFormatUnit; secs: number }> = [
  { unit: "minute", secs: 60 },
  { unit: "hour", secs: 3_600 },
  { unit: "day", secs: 86_400 },
  { unit: "week", secs: 604_800 },
  { unit: "month", secs: 2_592_000 },
];

export function formatRelativeTime(
  epochMs: number,
  locale: string
): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const deltaSecs = (epochMs - Date.now()) / 1000;
  if (deltaSecs > -60) return rtf.format(Math.round(deltaSecs), "second");
  const abs = Math.abs(deltaSecs);
  let chosen = RELATIVE_STEPS[0];
  for (const step of RELATIVE_STEPS) {
    if (abs >= step.secs) chosen = step;
  }
  return rtf.format(Math.round(deltaSecs / chosen.secs), chosen.unit);
}
