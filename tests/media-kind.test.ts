// riasly — media classification: the vocabulary that decides how a stored byte is
// rendered and what may be rendered inline at all.
//
// Why: /api/media serves a file inline when its stored mime passes
// isAllowedInlineMediaMime, and the *path itself* is what tells ProfileStage whether
// to build a <video> or a background-image. Both decisions are pure and both are
// load-bearing for the upload hardening in Phase 2, so they are pinned here rather
// than re-derived by reading a regex.
import { describe, expect, it } from "vitest";

import {
  AVATAR_ALLOWED_MIMES,
  BG_ALLOWED_MIMES,
  INLINE_MEDIA_MIMES,
  OWN_MEDIA_RE,
  SOUND_ALLOWED_MIMES,
  TEMPLATE_ASSET_RE,
  extForMime,
  firstFrameSrc,
  isAllowedCursorMime,
  isAllowedInlineMediaMime,
  isOwnMediaPath,
  isVideoSrc,
  mediaPathFor,
  storageKeyFromPath,
} from "@/lib/media-kind";

const UUID = "9f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b";

describe("OWN_MEDIA_RE / isOwnMediaPath", () => {
  it("accepts a uuid with a lowercase extension", () => {
    for (const ext of ["mp4", "gif", "png", "webp", "mp3", "m4a", "weba", "mov"]) {
      const path = `/api/media/${UUID}.${ext}`;
      expect(isOwnMediaPath(path), path).toBe(true);
      expect(storageKeyFromPath(path)).toBe(`${UUID}.${ext}`);
    }
  });

  it("rejects everything that is not exactly one own asset", () => {
    for (const path of [
      `/api/media/${UUID}`, // no extension: ProfileStage cannot choose a renderer
      `/api/media/../${UUID}.png`, // traversal: the route basename()s this anyway
      `/api/media/not-a-uuid.png`,
      `/api/media/${UUID.toUpperCase()}.png`, // uppercase uuid is not what we generate
      `/api/media/${UUID}.png?x=1`, // a query string is not part of the key
      `/uploads/${UUID}.png`, // the old web-root location must never validate again
      `/api/files/${UUID}.png`, // the download route is not an inline media path
      `https://evil.test/api/media/${UUID}.png`, // absolute: a foreign origin
    ]) {
      expect(isOwnMediaPath(path), path).toBe(false);
      expect(storageKeyFromPath(path)).toBe("");
    }
  });

  it("survives its own round trip", () => {
    expect(isOwnMediaPath(mediaPathFor(`${UUID}.mp4`))).toBe(true);
  });

  // The path pattern is a SHAPE test, not a security boundary, and this is the case
  // that proves it: ".html" fits [a-z0-9]{2,5} and therefore matches. What keeps an
  // HTML document from ever rendering inline is (1) safeExtFor rewriting the stored
  // key to .bin on upload (pinned in tests/storage.test.ts, which owns that module)
  // and (2) /api/media refusing any mime off INLINE_MEDIA_MIMES — the mime comes from
  // the upload, never from the key.
  it("documents that the pattern is shape-only, not a type gate", () => {
    expect(OWN_MEDIA_RE.test(`/api/media/${UUID}.html`)).toBe(true);
    expect(isAllowedInlineMediaMime("text/html")).toBe(false);
  });
});

describe("TEMPLATE_ASSET_RE", () => {
  it("recognises curated gallery assets and nothing else", () => {
    expect(TEMPLATE_ASSET_RE.test("/templates/neon-city.mp4")).toBe(true);
    expect(TEMPLATE_ASSET_RE.test("/templates/neon-city.jpg")).toBe(true);
    // A catalog asset must never be deletable by a profile action, so it has to stay
    // out of the own-media namespace.
    expect(isOwnMediaPath("/templates/neon-city.mp4")).toBe(false);
    expect(TEMPLATE_ASSET_RE.test("/templates/../secret.png")).toBe(false);
  });
});

describe("isAllowedInlineMediaMime", () => {
  it("refuses the types a browser would execute on our origin", () => {
    for (const mime of [
      "text/html",
      "image/svg+xml", // svg is script-bearing when inlined
      "application/xhtml+xml",
      "text/plain",
      "application/octet-stream",
      "video/x-msvideo",
      "",
    ]) {
      expect(isAllowedInlineMediaMime(mime), mime).toBe(false);
    }
  });

  it("accepts exactly the declared inline set", () => {
    for (const mime of INLINE_MEDIA_MIMES) {
      expect(isAllowedInlineMediaMime(mime), mime).toBe(true);
    }
    // The cursor slot is deliberately NOT inline-servable as a media path: it must be
    // a PNG, which the image set already covers — and nothing wider.
    expect(isAllowedCursorMime("image/png")).toBe(true);
    expect(isAllowedCursorMime("image/gif")).toBe(false);
  });

  it("keeps the slot sets nested the way the UI assumes", () => {
    // The avatar set is the background set plus the two photo types, so an avatar can
    // never be something a background could not be.
    for (const mime of BG_ALLOWED_MIMES) {
      expect(AVATAR_ALLOWED_MIMES).toContain(mime);
    }
    expect(AVATAR_ALLOWED_MIMES).toContain("image/png");
    expect(SOUND_ALLOWED_MIMES).toContain("audio/mpeg");
  });
});

describe("extForMime", () => {
  // The stored key's extension is what OWN_MEDIA_RE matches, so an inline-allowed
  // mime without a short-enough extension would produce an asset whose URL fails its
  // own path test — a silent 404 on a profile the owner just configured.
  it("gives every inline-allowed mime an extension OWN_MEDIA_RE accepts", () => {
    for (const mime of INLINE_MEDIA_MIMES) {
      const ext = extForMime(mime);
      expect(ext, mime).toMatch(/^\.[a-z0-9]{2,5}$/);
      expect(isOwnMediaPath(`/api/media/${UUID}${ext}`), mime).toBe(true);
    }
  });

  it("returns nothing for a type we never store", () => {
    expect(extForMime("text/html")).toBe("");
  });
});

describe("isVideoSrc / firstFrameSrc", () => {
  it("treats only the looping video extensions as video", () => {
    expect(isVideoSrc(`/api/media/${UUID}.mp4`)).toBe(true);
    expect(isVideoSrc(`/api/media/${UUID}.webm`)).toBe(true);
    expect(isVideoSrc(`/api/media/${UUID}.mov`)).toBe(true);
    expect(isVideoSrc(`/api/media/${UUID}.gif`)).toBe(false);
    expect(isVideoSrc("")).toBe(false);
  });

  it("adds a media fragment to videos only", () => {
    expect(firstFrameSrc(`/api/media/${UUID}.mp4`)).toBe(
      `/api/media/${UUID}.mp4#t=0.5`
    );
    expect(firstFrameSrc(`/api/media/${UUID}.gif`)).toBe(
      `/api/media/${UUID}.gif`
    );
    // The fragment must stay compatible with the detector, or a thumbnail src would
    // stop being recognised as video somewhere else in the tree.
    expect(isVideoSrc(firstFrameSrc(`/api/media/${UUID}.mp4`))).toBe(true);
    // 0.5s, not 0.1s: clips that fade in from black still read as a black box.
    expect(firstFrameSrc(`/api/media/${UUID}.webm`)).toContain("#t=0.5");
  });
});
