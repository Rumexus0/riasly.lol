// Shared, dependency-free media classification helpers.
//
// Kept separate from lib/media.ts (a server-only resolver) so client components
// can import these without pulling the resolver into the browser bundle, and so
// the "is this a video?" rule lives in exactly one place — it is what decides
// whether ProfileStage renders a looping <video> or a CSS background-image, for
// the full-page background *and* for the avatar circle.

// Same-origin background asset served by app/api/media/[key]. The storage key is
// a random UUID *with its file extension in the path*, which is what lets the
// video detector below (and the media resolver) treat it as a direct media URL.
export const OWN_MEDIA_RE =
  /^\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/;

// A curated gallery asset: the 4K loop (or its poster) that npm run
// templates:build rendered into public/templates. Deliberately its own pattern,
// NOT folded into isOwnMediaPath: that predicate is what lets releaseUnusedMedia
// and deleteFile unlink a file, and it is what decides the ownbackground badge.
// A catalog asset must never be deletable by a profile action, so it stays
// "someone else's media" here forever.
export const TEMPLATE_ASSET_RE =
  /^\/templates\/[a-z0-9][a-z0-9.-]*\.(mp4|jpg)$/i;

// Looping video extensions we render as a muted <video> background.
export const VIDEO_EXT_RE = /\.(mp4|webm|mov)(\?|#|$)/i;

// File types we accept as a custom profile background.
export const BG_ALLOWED_MIMES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "image/gif",
  "image/webp",
] as const;

const EXT_BY_MIME: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  // Background music: every one carries a short extension OWN_MEDIA_RE accepts
  // ([a-z0-9]{2,5}), so the media route can serve it inline with Range support.
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/webm": ".weba",
};

/** True when the URL points at a looping video (vs a gif/still image). */
export function isVideoSrc(url: string | null | undefined): boolean {
  return !!url && VIDEO_EXT_RE.test(url);
}

/**
 * A src that forces the browser to decode and paint one frame of a video. A
 * non-playing <video preload="metadata"> reads only the moov atom and paints
 * nothing, so a thumbnail built that way shows as a solid black box. Appending a
 * `#t=` media fragment makes the engine seek to (and render) that one keyframe.
 * The offset is 0.5s rather than 0.1s because many clips fade in from black, and
 * a tenth of a second still lands inside that fade (still a black box). The
 * fragment is display-only: it is never sent to /api/media and VIDEO_EXT_RE
 * already tolerates a `#` suffix, so isVideoSrc stays correct.
 */
export function firstFrameSrc(url: string): string {
  return isVideoSrc(url) ? `${url}#t=0.5` : url;
}

/** True for our own uploaded-asset path (no resolver needed). */
export function isOwnMediaPath(url: string): boolean {
  return OWN_MEDIA_RE.test(url);
}

/** True for a curated template asset served straight out of public/templates. */
export function isTemplateAssetPath(url: string): boolean {
  return TEMPLATE_ASSET_RE.test(url);
}

/** Public, extension-carrying path for a stored file (stays well under 190 chars). */
export function mediaPathFor(storageKey: string): string {
  return `/api/media/${storageKey}`;
}

/** Extract the storage key from our own media path ("" when not ours). */
export function storageKeyFromPath(url: string): string {
  return isOwnMediaPath(url) ? url.slice("/api/media/".length) : "";
}

/** Extension to append to a generated storage key for this mime type. */
export function extForMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? "";
}

export function isAllowedBackgroundMime(mime: string): boolean {
  return (BG_ALLOWED_MIMES as readonly string[]).includes(mime);
}

// Background music a user may attach to their profile (played only on a
// visitor's click — see components/profile/SoundToggle.tsx). video/mp4 is
// allowed so a downloaded short/TikTok clip can be used for its audio track; the
// media route already serves mp4 inline with Range support.
export const SOUND_ALLOWED_MIMES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "video/mp4",
] as const;

export function isAllowedSoundMime(mime: string): boolean {
  return (SOUND_ALLOWED_MIMES as readonly string[]).includes(mime);
}

// A custom cursor must be a PNG (the only raster the CSS `cursor` property
// renders reliably across engines, and it supports transparency for the hotspot).
export const CURSOR_ALLOWED_MIMES = ["image/png"] as const;

export function isAllowedCursorMime(mime: string): boolean {
  return (CURSOR_ALLOWED_MIMES as readonly string[]).includes(mime);
}

// Avatars are small, still images first: the background set plus the two
// classic photo types. Kept separate so widening the avatar never quietly
// widens what can be applied as a full-page background.
export const AVATAR_ALLOWED_MIMES = [
  "image/png",
  "image/jpeg",
  ...BG_ALLOWED_MIMES,
] as const;

/** Anything /api/media may serve inline: a background, an avatar, or music. */
export const INLINE_MEDIA_MIMES = [
  ...AVATAR_ALLOWED_MIMES,
  ...SOUND_ALLOWED_MIMES,
] as const;

export function isAllowedAvatarMime(mime: string): boolean {
  return (AVATAR_ALLOWED_MIMES as readonly string[]).includes(mime);
}

export function isAllowedInlineMediaMime(mime: string): boolean {
  return (INLINE_MEDIA_MIMES as readonly string[]).includes(mime);
}
