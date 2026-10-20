// riasly — handle rules: the shape, the reserved set, and the drift guard.
//
// Why this file exists: a handle is a public URL (`/<handle>`) handed out by
// signup, the availability API, the dashboard change-handle action, the claim form
// and the Discord route — all of them reading the same lib/handle.ts. A reserved
// slug that is missing from the list is not a cosmetic bug: the account would own
// the URL a page needs, and it can only be reclaimed by deleting a user.
import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  HANDLE_RE,
  RESERVED_HANDLES,
  isValidHandleFormat,
} from "@/lib/handle";

describe("HANDLE_RE", () => {
  it("accepts the ordinary cases", () => {
    // "a--b" is legal on purpose: the grammar only forbids a hyphen at the ends,
    // so an interior run of them costs nothing and rejects nothing.
    for (const h of ["a", "abc", "rumexus", "a-1", "my-studio", "a--b", "ab1"]) {
      expect(HANDLE_RE.test(h), h).toBe(true);
    }
  });

  it("rejects what a URL must never contain", () => {
    for (const h of [
      "",
      "AB", // uppercase: handles are folded to lowercase before this runs
      "-abc", // leading hyphen
      "abc-", // trailing hyphen
      "nope!",
      "with space",
      "ünalanı", // non-ASCII
      "a/b", // a path separator would produce a nested URL
      "dot.txt",
      "-".repeat(5),
    ]) {
      expect(HANDLE_RE.test(h), h).toBe(false);
    }
  });

  it("caps the length at 30 and refuses 31", () => {
    expect(HANDLE_RE.test("a".repeat(30))).toBe(true);
    expect(HANDLE_RE.test("a".repeat(31))).toBe(false);
  });

  // Pinned because the previous comment on this regex said "3-30" and the real
  // grammar is "1 or 3-30": two characters cannot be built, one can. Someone
  // "fixing" the comment by loosening the regex would silently open a one-letter
  // namespace, so the edge is a test now instead of a footnote.
  it("has an unreachable two-character length and a reachable one", () => {
    expect(HANDLE_RE.test("ab")).toBe(false);
    expect(HANDLE_RE.test("a")).toBe(true);
  });
});

describe("RESERVED_HANDLES", () => {
  it("is stored lowercase, because the lookup is case-folded", () => {
    const offenders = [...RESERVED_HANDLES].filter((h) => h !== h.toLowerCase());
    expect(offenders).toEqual([]);
  });

  it("holds only entries that could actually be claimed", () => {
    // A reserved slug the grammar rejects anyway is dead weight that hides the real
    // guard (and invites someone to widen the regex to "make the test pass").
    // "u" is the one deliberate exception: a single character IS a reachable shape,
    // which is exactly why the classic link-in-bio prefix is closed.
    const unreachable = [...RESERVED_HANDLES].filter(
      (h) => h !== "u" && !HANDLE_RE.test(h)
    );
    expect(unreachable).toEqual([]);
  });

  it("protects the brand and the old brand", () => {
    expect(RESERVED_HANDLES.has("riasly")).toBe(true);
    expect(RESERVED_HANDLES.has("flex")).toBe(true);
  });

  it("closes the routes that exist today", () => {
    for (const slug of ["api", "login", "signup", "verify", "dashboard", "status"]) {
      expect(RESERVED_HANDLES.has(slug), slug).toBe(true);
    }
  });
});

describe("isValidHandleFormat", () => {
  it("trims and case-folds before checking", () => {
    expect(isValidHandleFormat("  RumeXUS ")).toBe(true);
    expect(isValidHandleFormat("  API ")).toBe(false);
  });

  it("refuses a reserved slug even when the shape is fine", () => {
    expect(isValidHandleFormat("redeem")).toBe(false);
    expect(isValidHandleFormat("u")).toBe(false);
  });
});

// ---- Drift guard ------------------------------------------------------------
//
// Reads the real route tree instead of a hand-maintained list: adding a page under
// app/ without reserving its slug turns CI red. Deliberately does NOT go through
// Next's router internals — those are private API and their shape changes between
// majors, which would make this test the thing that breaks on an upgrade.
const NON_ROUTE_DIRS = new Set([
  // Server-action modules: reachable by RPC, never by URL.
  "actions",
]);

const NON_ROUTE_STEMS = new Set([
  // React/globals files and the metadata image routes. A handle can never collide
  // with /icon.svg because the served path carries the extension.
  "layout",
  "page",
  "template",
  "default",
  "error",
  "global-error",
  "loading",
  "not-found",
  "route",
  "globals",
  "icon",
  "apple-icon",
  "opengraph-image",
  "twitter-image",
]);

function topLevelSegments(): string[] {
  const appDir = path.resolve(process.cwd(), "app");
  const segments: string[] = [];
  for (const entry of readdirSync(appDir, { withFileTypes: true })) {
    // [handle], [...rest] and (group) never reserve a literal slug.
    if (entry.name.startsWith("[") || entry.name.startsWith("(")) continue;
    if (entry.isDirectory()) {
      if (!NON_ROUTE_DIRS.has(entry.name)) segments.push(entry.name);
      continue;
    }
    const stem = entry.name.replace(/\.(tsx?|jsx?|svg|png|jpe?g|ico|txt|css)$/i, "");
    if (!NON_ROUTE_STEMS.has(stem)) segments.push(stem);
  }
  return [...new Set(segments)].sort();
}

describe("route tree vs RESERVED_HANDLES", () => {
  it("finds the segments it expects to (a silently empty scan proves nothing)", () => {
    const segments = topLevelSegments();
    expect(segments).toContain("api");
    expect(segments).toContain("dashboard");
    expect(segments).toContain("login");
    expect(segments).toContain("verify");
    // The dynamic profile route is [username], so it must not leak in here.
    expect(segments).not.toContain("[username]");
  });

  it("reserves every static top-level route", () => {
    const unreserved = topLevelSegments().filter(
      (segment) => !RESERVED_HANDLES.has(segment.toLowerCase())
    );
    expect(unreserved).toEqual([]);
  });
});
