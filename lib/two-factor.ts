// riasly — two-factor auth (TOTP) primitives. SERVER ONLY.
//
// Nothing here may reach a browser: it produces the shared secret and the
// otpauth:// URI an authenticator app scans, verifies a rolling code, and mints /
// matches single-use backup codes. The secret itself is only ever shown once, on
// the setup screen; backup codes are stored as bcrypt hashes so a leaked row is
// worthless.
//
// The crypto comes from `otplib` (v13, promise API) and `bcryptjs` (already the
// password hasher in this app), so there is no bespoke HMAC/TOTP implementation
// to get subtly wrong.

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { generateSecret, generateURI, verify } from "otplib";

const ISSUER = "riasly";

/** A fresh base32 shared secret, shown to the user exactly once at setup. */
export function newTotpSecret(): string {
  return generateSecret();
}

/** The `otpauth://` URI an authenticator app turns into a QR code. */
export async function buildOtpauthUri(secret: string, label: string): Promise<string> {
  return generateURI({ issuer: ISSUER, label, secret });
}

/**
 * Verify a rolling 6-digit code against the secret. A ±30s tolerance (one TOTP
 * step) absorbs small clock drift between the server and the phone. Never throws
 * — a malformed code simply reads as invalid.
 */
export async function verifyTotp(secret: string | null, token: string): Promise<boolean> {
  if (!secret || !token) return false;
  const clean = token.replace(/\s+/g, "").slice(0, 10);
  if (!/^[0-9]{6}$/.test(clean)) return false;
  try {
    const res = await verify({ token: clean, secret, epochTolerance: 30 });
    return res.valid === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Backup codes — single-use fallbacks for when the authenticator is unavailable.
// Generated once at setup and stored as bcrypt hashes; a plain code is shown to
// the user a single time. They are 10 uppercase hex characters (no separators)
// so a user-typed value only needs whitespace stripped to compare.
// ---------------------------------------------------------------------------

const BACKUP_COUNT = 10;

function makeBackupCode(): string {
  return randomBytes(5).toString("hex").toUpperCase();
}

/** Canonical form for comparing a user-typed backup code. */
export function normalizeBackupCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 10);
}

export type BackupCodeBundle = { plain: string[]; hashed: string[] };

/** Mint a fresh set; `plain` is shown once, `hashed` is what gets stored. */
export async function generateBackupCodes(): Promise<BackupCodeBundle> {
  const plain = Array.from({ length: BACKUP_COUNT }, makeBackupCode);
  const hashed = await Promise.all(plain.map((c) => bcrypt.hash(c, 8)));
  return { plain, hashed };
}

/**
 * Does `code` match one of the stored (hashed) backup codes? Returns the matched
 * hash so the caller can consume it (a backup code works exactly once), or null.
 */
export async function matchBackupCode(
  hashedJson: string | null,
  code: string
): Promise<string | null> {
  if (!hashedJson || !code) return null;
  const target = normalizeBackupCode(code);
  if (!target) return null;
  for (const hash of parseHashes(hashedJson)) {
    try {
      if (await bcrypt.compare(target, hash)) return hash;
    } catch {
      /* a corrupt hash entry is simply not a match */
    }
  }
  return null;
}

/** The stored-JSON form with `matched` removed (consume a used backup code). */
export function consumeBackupCode(hashedJson: string | null, matched: string): string {
  const next = parseHashes(hashedJson).filter((h) => h !== matched);
  return JSON.stringify(next);
}

function parseHashes(hashedJson: string | null): string[] {
  if (!hashedJson) return [];
  try {
    const parsed: unknown = JSON.parse(hashedJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}
