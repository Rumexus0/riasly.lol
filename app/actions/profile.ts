"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { queueBadgeSync } from "@/lib/badge-sync";
import { prisma } from "@/lib/db";
import { PLATFORMS } from "@/lib/platforms";
import { revalidateDashboard, revalidateProfilePages } from "@/lib/revalidate";
import { resolveMediaUrl } from "@/lib/media";
import {
  extForMime,
  isAllowedAvatarMime,
  isAllowedBackgroundMime,
  isAllowedCursorMime,
  isAllowedSoundMime,
  isOwnMediaPath,
  mediaPathFor,
  storageKeyFromPath,
  OWN_MEDIA_RE,
  TEMPLATE_ASSET_RE,
} from "@/lib/media-kind";
import { getCustomBackgroundEligibility } from "@/lib/profile";
import { uploadDir } from "@/lib/storage";
import {
  normalizeStyleFields,
  normalizeDiscordWidgetFields,
  type StyleRaw,
  type DiscordWidgetRaw,
} from "@/lib/profile-style";

export type ActionResult = {
  ok: boolean;
  error?:
    | "invalid"
    | "unauthorized"
    | "badmedia"
    | "locked" // account younger than MIN_ACCOUNT_AGE_DAYS
    | "unsupported" // file type cannot be used as a background
    | "missing" // asset not owned by / not present for this user
    | "forbidden" // admin-only action called by a non-admin
    | "lastauth" // would delete the account's only sign-in credential
    | "quota", // account storage ceiling reached (/api/upload 507, lib/storage.ts)
  data?: {
    avatarUrl: string | null;
    bannerUrl: string | null;
    cursorUrl: string | null;
    soundUrl: string | null;
  };
};

// FormData.get() returns null for missing fields, but zod's .optional() only
// covers undefined. Normalize every value through this helper so an absent
// input never breaks validation (root cause of the silent social-save bug).
const str = (v: FormDataEntryValue | null): string =>
  typeof v === "string" ? v : "";

// Every value a profile media slot may hold. One union, built from the two
// relative patterns lib/media-kind.ts owns, so the schema and the resolver can
// never disagree about what counts as ours:
//  - an absolute direct-media URL (a resolved share link, or a curated template
//    while the gallery is still handing over external hotlinks),
//  - /api/media/<uuid>.<ext> — a self-uploaded asset,
//  - /templates/<id>.mp4 | .jpg — a rendered gallery asset.
// Without the third branch new URL() throws in the resolver and every card click
// answers "badmedia", because a gallery path is relative by design. Every branch
// carries the same length cap: VARCHAR(191) is the real ceiling, and a regex that
// matches a 500-character path would only find out at the database.
function storedMediaUrl(maxLen: number) {
  return z.union([
    z.string().trim().url().max(maxLen),
    z.string().regex(OWN_MEDIA_RE).max(maxLen),
    z.string().regex(TEMPLATE_ASSET_RE).max(maxLen),
  ]);
}

// Existence-checked on purpose: a session cookie left over from a deleted
// account must yield "unauthorized", not a Prisma foreign-key error.
async function requireUserId(): Promise<string | null> {
  return getVerifiedSessionUserId();
}

// Every profile-media action answers with the FULL stored pair, so the client
// can keep one source of truth for both slots instead of guessing what the
// other one holds (a stale guess is how an upload used to get written back).
async function mediaSnapshot(userId: string): Promise<ActionResult["data"]> {
  const p = await prisma.profile
    .findUnique({
      where: { userId },
      select: { avatarUrl: true, bannerUrl: true, cursorUrl: true, soundUrl: true },
    })
    .catch(() => null);
  return {
    avatarUrl: p?.avatarUrl ?? null,
    bannerUrl: p?.bannerUrl ?? null,
    cursorUrl: p?.cursorUrl ?? null,
    soundUrl: p?.soundUrl ?? null,
  };
}

// Optional media URL: an empty string is allowed (means "unset"), stored as null.
// A profile's stored background is relative — /api/media for a self upload,
// /templates for a gallery render — and both must survive a later "Save" of this
// same form, which is exactly how a background used to get wiped by a stale write.
const urlOrEmpty = z
  .union([storedMediaUrl(600), z.literal("")])
  .default("");

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const parsed = z
    .object({
      bio: z.string().max(280).optional().default(""),
      accentColor: z
        .string()
        .regex(/^#([0-9a-fA-F]{6})$/)
        .optional()
        .default("#8B5CF6"),
      avatarUrl: urlOrEmpty,
      bannerUrl: urlOrEmpty,
    })
    .safeParse({
      bio: str(formData.get("bio")),
      accentColor: str(formData.get("accentColor")) || undefined,
      avatarUrl: str(formData.get("avatarUrl")).trim(),
      bannerUrl: str(formData.get("bannerUrl")).trim(),
    });
  if (!parsed.success) return { ok: false, error: "invalid" };

  // Resolve pasted links (Tenor/Giphy share pages) into direct media URLs so
  // the animated background / avatar actually render. Empty stays empty (preset).
  let avatarUrl = "";
  let bannerUrl = "";
  if (parsed.data.avatarUrl) {
    const resolved = await resolveMediaUrl(parsed.data.avatarUrl);
    if (!resolved) return { ok: false, error: "badmedia" };
    avatarUrl = resolved;
  }
  if (parsed.data.bannerUrl) {
    const resolved = await resolveMediaUrl(parsed.data.bannerUrl);
    if (!resolved) return { ok: false, error: "badmedia" };
    bannerUrl = resolved;
  }

  const { accentColor, bio } = parsed.data;
  await prisma.profile.upsert({
    where: { userId },
    create: {
      userId,
      accentColor,
      bio,
      avatarUrl: avatarUrl || null,
      bannerUrl: bannerUrl || null,
    },
    update: {
      accentColor,
      bio,
      avatarUrl: avatarUrl || null,
      bannerUrl: bannerUrl || null,
    },
  });

  await revalidateDashboard();
  // Rules read the snapshot we just changed, so a save can immediately earn a
  // badge. Fire-and-forget: badge work never fails the user's own edit.
  queueBadgeSync(userId);
  return { ok: true, data: await mediaSnapshot(userId) };
}

// The customize page's single "save all" form for everything that is NOT a media
// slot: bio, accent + the four extra colours, opacity/blur, effect picks, the
// username effect, location and every boolean toggle.
// It deliberately never touches avatarUrl/bannerUrl/cursorUrl/soundUrl — those
// belong to their own immediate-upload actions, so a stale form can never write
// back an old media URL over a fresh upload (the exact bug updateProfile guards
// against by answering with the full stored pair). For the same reason it no
// longer carries discordSnowflake: that id is a credential, written only by the
// OAuth connect/disconnect actions.
export async function updateProfileStyle(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const raw: StyleRaw = {
    bio: str(formData.get("bio")).slice(0, 280),
    accentColor: str(formData.get("accentColor")),
    textColor: str(formData.get("textColor")),
    bgColor: str(formData.get("bgColor")),
    iconColor: str(formData.get("iconColor")),
    effectColor: str(formData.get("effectColor")),
    effectColor2: str(formData.get("effectColor2")),
    effectColor3: str(formData.get("effectColor3")),
    profileOpacity: str(formData.get("profileOpacity")),
    profileBlur: str(formData.get("profileBlur")),
    bgEffect: str(formData.get("bgEffect")),
    usernameEffect: str(formData.get("usernameEffect")),
    profileAlign: str(formData.get("profileAlign")),
    location: str(formData.get("location")),
    profileGradient: str(formData.get("profileGradient")),
    monochromeIcons: str(formData.get("monochromeIcons")),
    animatedTitle: str(formData.get("animatedTitle")),
    boxColors: str(formData.get("boxColors")),
    soundEnabled: str(formData.get("soundEnabled")),
    discordAvatarDecoration: str(formData.get("discordAvatarDecoration")),
    glitterName: str(formData.get("glitterName")),
    glitterSocials: str(formData.get("glitterSocials")),
    glitterBadges: str(formData.get("glitterBadges")),
  };

  // One normalizer owns every rule (hex, clamp, enum whitelist, bool coercion)
  // so the DB can never receive an unvalidated style value.
  const style = normalizeStyleFields(raw);
  const bio = raw.bio ?? "";

  await prisma.profile.upsert({
    where: { userId },
    create: { userId, bio, ...style },
    update: { bio, ...style },
  });

  await revalidateProfile(userId);
  queueBadgeSync(userId);
  return { ok: true, data: await mediaSnapshot(userId) };
}

// Focused action for the "Profil Widget'ı" (Discord presence-card config). It
// writes ONLY the four discordCard* columns, so it is disjoint from
// updateProfileStyle's full style set: saving the widget never nulls a style
// field and saving the style form (which does not carry these columns) never
// nulls the widget. The kernel normalizer owns every rule (bool coercion,
// idle-text clamp), so the DB never sees an unvalidated widget value.
export async function updateDiscordWidget(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const raw: DiscordWidgetRaw = {
    discordCardEnabled: str(formData.get("discordCardEnabled")),
    discordCardShowBadges: str(formData.get("discordCardShowBadges")),
    discordCardIdleText: str(formData.get("discordCardIdleText")),
  };

  const widget = normalizeDiscordWidgetFields(raw);

  await prisma.profile.upsert({
    where: { userId },
    create: { userId, ...widget },
    update: { ...widget },
  });

  await revalidateProfile(userId);
  return { ok: true };
}

// Focused action for the template gallery: set only the profile background
// (optionally its accent). Runs the same media resolution as updateProfile.
export async function setBackgroundUrl(
  url: string,
  accent?: string
): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const checked = storedMediaUrl(190).safeParse(url);
  if (!checked.success) return { ok: false, error: "invalid" };

  const resolved = await resolveMediaUrl(checked.data);
  if (!resolved) return { ok: false, error: "badmedia" };

  const safeAccent =
    accent && /^#([0-9a-fA-F]{6})$/.test(accent) ? accent : undefined;

  await prisma.profile.upsert({
    where: { userId },
    create: {
      userId,
      bannerUrl: resolved,
      bgClipStartMs: null,
      bgClipEndMs: null,
      ...(safeAccent ? { accentColor: safeAccent } : {}),
    },
    update: {
      bannerUrl: resolved,
      bgClipStartMs: null,
      bgClipEndMs: null,
      ...(safeAccent ? { accentColor: safeAccent } : {}),
    },
  });

  const user = await prisma.user
    .findUnique({ where: { id: userId }, select: { handle: true } })
    .catch(() => null);
  await revalidateProfilePages(user?.handle);
  queueBadgeSync(userId);

  return { ok: true, data: await mediaSnapshot(userId) };
}

// --- Custom template backgrounds (self-uploaded video / GIF) ---
// The on-disk root comes from lib/storage.ts: it is the single place that knows
// where user bytes live, and this file writes to and unlinks from that directory.

/**
 * The public media path must carry a real extension: that is what lets
 * ProfileStage choose <video> over background-image and what the resolver
 * recognises as direct media. Upload keys derive their extension from the
 * client filename, which may be missing or oddly cased, so re-derive it from
 * the stored mime and rename the file on disk to keep both in sync.
 * Returns null when the bytes are no longer on disk.
 */
async function ensureMediaKey(file: {
  id: string;
  storageKey: string;
  mime: string;
}): Promise<string | null> {
  const ext = extForMime(file.mime);
  if (!ext) return null;

  const current = path.basename(file.storageKey);
  const stem = current.replace(/\.[^.]*$/, "");
  const expected = `${stem}${ext}`;

  if (current === expected) {
    return isOwnMediaPath(mediaPathFor(expected)) ? expected : null;
  }

  const dir = uploadDir();
  try {
    await fs.rename(path.join(dir, current), path.join(dir, expected));
  } catch {
    return null; // bytes already gone -> caller reports "missing"
  }
  await prisma.fileAsset
    .update({ where: { id: file.id }, data: { storageKey: expected } })
    .catch(() => {});

  return isOwnMediaPath(mediaPathFor(expected)) ? expected : null;
}

// Best-effort reclaim of a profile asset the user is replacing, so repeated
// uploads cannot grow storage without bound. Anything else (external template
// URL, a file still linked from the hosting section, a file with downloads) is
// left untouched. `keepUrls` carries every slot that still points at media: the
// background and the avatar may legitimately share one stored file, and deleting
// it because the *other* slot moved would break the one that did not.
async function releaseUnusedMedia(
  userId: string,
  previousUrl: string,
  keepUrls: string[]
): Promise<void> {
  const previousKey = isOwnMediaPath(previousUrl)
    ? storageKeyFromPath(previousUrl)
    : "";
  if (!previousKey) return;

  const keep = new Set(
    keepUrls.map((u) => (isOwnMediaPath(u) ? storageKeyFromPath(u) : ""))
  );
  if (keep.has(previousKey)) return;

  const stale = await prisma.fileAsset
    .findUnique({
      where: { storageKey: previousKey },
      select: { id: true, ownerId: true, downloadCount: true },
    })
    .catch(() => null);
  if (!stale || stale.ownerId !== userId || stale.downloadCount > 0) return;

  await prisma.fileAsset.delete({ where: { id: stale.id } }).catch(() => {});
  await fs
    .unlink(path.join(uploadDir(), path.basename(previousKey)))
    .catch(() => {});
}

async function revalidateProfile(userId: string): Promise<void> {
  const user = await prisma.user
    .findUnique({ where: { id: userId }, select: { handle: true } })
    .catch(() => null);
  await revalidateProfilePages(user?.handle);
}

// Apply one of the user's own uploaded files as the profile background.
// The file itself arrives through the existing /api/upload route (API routes
// have no body-size cap, unlike server actions); this action owns every rule:
// account age, ownership, mime, size.
export async function applyBackgroundFromFile(fileId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  // Server-side gate; the UI only mirrors it.
  const eligibility = await getCustomBackgroundEligibility(userId);
  if (!eligibility.allowed) return { ok: false, error: "locked" };

  const checkedId = z.string().trim().min(1).max(64).safeParse(fileId);
  if (!checkedId.success) return { ok: false, error: "invalid" };

  const file = await prisma.fileAsset
    .findFirst({ where: { id: checkedId.data, ownerId: userId } })
    .catch(() => null);
  if (!file) return { ok: false, error: "missing" };

  if (!isAllowedBackgroundMime(file.mime)) return { ok: false, error: "unsupported" };

  const maxBytes = Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;
  if (file.size <= 0 || file.size > maxBytes) return { ok: false, error: "invalid" };

  const storageKey = await ensureMediaKey(file);
  if (!storageKey) return { ok: false, error: "missing" };

  const bannerUrl = mediaPathFor(storageKey);

  const previous = await prisma.profile
    .findUnique({ where: { userId }, select: { avatarUrl: true, bannerUrl: true } })
    .catch(() => null);

  // A new background is not the old one: a clip calibrated to the previous file
  // would silently trim the wrong seconds off this one, so drop it on swap (the
  // same rule applySoundFromFile uses for the audio trim). Re-applying the same
  // URL keeps the trim.
  const reset =
    (previous?.bannerUrl ?? "") !== bannerUrl
      ? { bgClipStartMs: null, bgClipEndMs: null }
      : {};

  await prisma.profile.upsert({
    where: { userId },
    create: { userId, bannerUrl, ...reset },
    update: { bannerUrl, ...reset },
  });

  await releaseUnusedMedia(userId, previous?.bannerUrl ?? "", [
    bannerUrl,
    previous?.avatarUrl ?? "",
  ]);
  await revalidateProfile(userId);
  queueBadgeSync(userId);

  return { ok: true, data: await mediaSnapshot(userId) };
}

// Drop the custom background and fall back to the built-in animated preset.
export async function clearCustomBackground(): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  await prisma.profile.upsert({
    where: { userId },
    create: { userId, bannerUrl: null, bgClipStartMs: null, bgClipEndMs: null },
    update: { bannerUrl: null, bgClipStartMs: null, bgClipEndMs: null },
  });

  await revalidateProfile(userId);
  queueBadgeSync(userId);
  return { ok: true, data: await mediaSnapshot(userId) };
}

// --- Avatar (self-uploaded image / GIF / looping clip) ---

// Avatars are tiny by nature and a 100 MB 4K wall clip would be an absurd
// profile picture, so the avatar slot gets its own (much lower) ceiling.
const avatarMaxMb = (): number => Number(process.env.AVATAR_MAX_MB ?? 8);

// Apply one of the user's own uploaded files as their avatar. Deliberately no
// account-age gate: /api/upload is already open to every account and the age
// rule exists only to stop fresh accounts claiming a full-page video wall.
export async function applyAvatarFromFile(fileId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const checkedId = z.string().trim().min(1).max(64).safeParse(fileId);
  if (!checkedId.success) return { ok: false, error: "invalid" };

  const file = await prisma.fileAsset
    .findFirst({ where: { id: checkedId.data, ownerId: userId } })
    .catch(() => null);
  if (!file) return { ok: false, error: "missing" };

  if (!isAllowedAvatarMime(file.mime)) return { ok: false, error: "unsupported" };

  if (file.size <= 0 || file.size > avatarMaxMb() * 1024 * 1024) {
    return { ok: false, error: "invalid" };
  }

  const storageKey = await ensureMediaKey(file);
  if (!storageKey) return { ok: false, error: "missing" };

  const avatarUrl = mediaPathFor(storageKey);

  const previous = await prisma.profile
    .findUnique({ where: { userId }, select: { avatarUrl: true, bannerUrl: true } })
    .catch(() => null);

  await prisma.profile.upsert({
    where: { userId },
    create: { userId, avatarUrl },
    update: { avatarUrl },
  });

  await releaseUnusedMedia(userId, previous?.avatarUrl ?? "", [
    avatarUrl,
    previous?.bannerUrl ?? "",
  ]);
  await revalidateProfile(userId);
  queueBadgeSync(userId);

  return { ok: true, data: await mediaSnapshot(userId) };
}

// Drop the avatar and fall back to the initial-letter circle. The uploaded file
// itself stays in "Your uploaded media" / Files, where the owner can delete it.
export async function clearAvatar(): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  await prisma.profile.upsert({
    where: { userId },
    create: { userId, avatarUrl: null },
    update: { avatarUrl: null },
  });

  await revalidateProfile(userId);
  queueBadgeSync(userId);
  return { ok: true, data: await mediaSnapshot(userId) };
}

// --- Custom cursor (a PNG applied as the profile's CSS cursor) ---
// --- Background music (an audio file a visitor may opt to play) ---

// Sound has its own ceiling: a song is bigger than an avatar but should never
// reuse the 25MB background budget. Env may lower it, never raise past 25MB.
const soundMaxMb = (): number => {
  const raw = Number(process.env.SOUND_MAX_MB ?? 10);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 25) : 10;
};

// Read the four media slots so releaseUnusedMedia can tell which files are still
// referenced after one of them changes (they may share a stored file).
async function allMediaSlots(userId: string) {
  return prisma.profile
    .findUnique({
      where: { userId },
      select: { avatarUrl: true, bannerUrl: true, cursorUrl: true, soundUrl: true },
    })
    .catch(() => null);
}

// Apply one of the user's own uploaded PNGs as the custom cursor. Mirrors
// applyAvatarFromFile: bytes already arrived via /api/upload; this owns the
// ownership + mime + size rules and the slot write.
export async function applyCursorFromFile(fileId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const checkedId = z.string().trim().min(1).max(64).safeParse(fileId);
  if (!checkedId.success) return { ok: false, error: "invalid" };

  const file = await prisma.fileAsset
    .findFirst({ where: { id: checkedId.data, ownerId: userId } })
    .catch(() => null);
  if (!file) return { ok: false, error: "missing" };

  if (!isAllowedCursorMime(file.mime)) return { ok: false, error: "unsupported" };

  if (file.size <= 0 || file.size > avatarMaxMb() * 1024 * 1024) {
    return { ok: false, error: "invalid" };
  }

  const storageKey = await ensureMediaKey(file);
  if (!storageKey) return { ok: false, error: "missing" };

  const cursorUrl = mediaPathFor(storageKey);
  const previous = await allMediaSlots(userId);

  await prisma.profile.upsert({
    where: { userId },
    create: { userId, cursorUrl },
    update: { cursorUrl },
  });

  await releaseUnusedMedia(userId, previous?.cursorUrl ?? "", [
    cursorUrl,
    previous?.avatarUrl ?? "",
    previous?.bannerUrl ?? "",
    previous?.soundUrl ?? "",
  ]);
  await revalidateProfile(userId);
  return { ok: true, data: await mediaSnapshot(userId) };
}

export async function clearCursor(): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const previous = await allMediaSlots(userId);
  await prisma.profile.upsert({
    where: { userId },
    create: { userId, cursorUrl: null },
    update: { cursorUrl: null },
  });

  await releaseUnusedMedia(userId, previous?.cursorUrl ?? "", [
    previous?.avatarUrl ?? "",
    previous?.bannerUrl ?? "",
    previous?.soundUrl ?? "",
  ]);
  await revalidateProfile(userId);
  return { ok: true, data: await mediaSnapshot(userId) };
}

// Apply one of the user's own uploaded audio files as the profile's background
// music. Same shape as the cursor path; the sound is only ever played after a
// visitor clicks (browsers block audible autoplay), see SoundToggle.tsx.
export async function applySoundFromFile(fileId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const checkedId = z.string().trim().min(1).max(64).safeParse(fileId);
  if (!checkedId.success) return { ok: false, error: "invalid" };

  const file = await prisma.fileAsset
    .findFirst({ where: { id: checkedId.data, ownerId: userId } })
    .catch(() => null);
  if (!file) return { ok: false, error: "missing" };

  if (!isAllowedSoundMime(file.mime)) return { ok: false, error: "unsupported" };

  if (file.size <= 0 || file.size > soundMaxMb() * 1024 * 1024) {
    return { ok: false, error: "invalid" };
  }

  const storageKey = await ensureMediaKey(file);
  if (!storageKey) return { ok: false, error: "missing" };

  const soundUrl = mediaPathFor(storageKey);
  const previous = await allMediaSlots(userId);
  // A new track is not the old one: a stored trim calibrated to the previous
  // file would silently mute (or wrongly clip) this one, so drop it on swap —
  // the same rule clearSound applies. Re-applying the same URL keeps the trim.
  const reset =
    (previous?.soundUrl ?? "") !== soundUrl
      ? { soundStartMs: null, soundEndMs: null }
      : {};

  await prisma.profile.upsert({
    where: { userId },
    create: { userId, soundUrl, ...reset },
    update: { soundUrl, ...reset },
  });

  await releaseUnusedMedia(userId, previous?.soundUrl ?? "", [
    soundUrl,
    previous?.avatarUrl ?? "",
    previous?.bannerUrl ?? "",
    previous?.cursorUrl ?? "",
  ]);
  await revalidateProfile(userId);
  return { ok: true, data: await mediaSnapshot(userId) };
}

export async function clearSound(): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const previous = await allMediaSlots(userId);
  await prisma.profile.upsert({
    where: { userId },
    create: { userId, soundUrl: null, soundStartMs: null, soundEndMs: null },
    update: { soundUrl: null, soundStartMs: null, soundEndMs: null },
  });

  await releaseUnusedMedia(userId, previous?.soundUrl ?? "", [
    previous?.avatarUrl ?? "",
    previous?.bannerUrl ?? "",
    previous?.cursorUrl ?? "",
  ]);
  await revalidateProfile(userId);
  return { ok: true, data: await mediaSnapshot(userId) };
}

// Set (or clear) the seconds range of the profile's background music that a
// visitor hears. Deliberately its OWN action, disjoint from updateProfileStyle:
// that one writes the FULL style column set, so folding these two into it would
// null the trim on every appearance save that happened not to render the inputs
// (the same reason the discordCard* columns have their own action). A null bound
// means "open-ended": null/null plays the whole track.
export async function updateSoundRange(
  startMs: number | null,
  endMs: number | null
): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const profile = await prisma.profile
    .findUnique({ where: { userId }, select: { soundUrl: true } })
    .catch(() => null);
  if (!profile?.soundUrl) return { ok: false, error: "missing" };

  // MySQL INT tops out at ~2.147e9 ms (~24.8 days); a stray huge value must not
  // overflow the column and throw. Clamp to a bound far beyond any uploadable
  // sound (the size cap caps duration too), and reject when a bound was given
  // but fell outside the range after cleaning — an out-of-range input, not "unset".
  const MAX_SOUND_MS = 24 * 60 * 60 * 1000;
  const clean = (v: number | null): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_SOUND_MS
      ? Math.floor(v)
      : null;
  const start = clean(startMs);
  const end = clean(endMs);

  if (
    (startMs !== null && start === null) ||
    (endMs !== null && end === null)
  ) {
    return { ok: false, error: "invalid" };
  }

  // A range must have positive length; anything else is treated as "whole track".
  if (start !== null && end !== null && end - start < 500) {
    return { ok: false, error: "invalid" };
  }

  await prisma.profile.upsert({
    where: { userId },
    create: { userId, soundStartMs: start, soundEndMs: end },
    update: { soundStartMs: start, soundEndMs: end },
  });

  await revalidateProfile(userId);
  return { ok: true, data: await mediaSnapshot(userId) };
}

// Set (or clear) the seconds range of the profile's background VIDEO that loops.
// Same contract as updateSoundRange and its own action on purpose: it writes only
// the bgClip* columns so it never collides with the full-set updateProfileStyle.
// A null bound means "open-ended": null/null plays the whole clip via the native
// loop. The media route streams the file as stored, so trimming is purely a client
// seek + wrap (see ProfileStage) — no re-encode, no server work.
export async function updateBackgroundClip(
  startMs: number | null,
  endMs: number | null
): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const profile = await prisma.profile
    .findUnique({ where: { userId }, select: { bannerUrl: true } })
    .catch(() => null);
  if (!profile?.bannerUrl) return { ok: false, error: "missing" };

  const MAX_CLIP_MS = 24 * 60 * 60 * 1000;
  const clean = (v: number | null): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_CLIP_MS
      ? Math.floor(v)
      : null;
  const start = clean(startMs);
  const end = clean(endMs);

  if ((startMs !== null && start === null) || (endMs !== null && end === null)) {
    return { ok: false, error: "invalid" };
  }

  // A clip must have positive length; anything else is treated as "whole clip".
  if (start !== null && end !== null && end - start < 500) {
    return { ok: false, error: "invalid" };
  }

  await prisma.profile.upsert({
    where: { userId },
    create: { userId, bgClipStartMs: start, bgClipEndMs: end },
    update: { bgClipStartMs: start, bgClipEndMs: end },
  });

  await revalidateProfile(userId);
  return { ok: true, data: await mediaSnapshot(userId) };
}

// Apply a curated template as the avatar. Mirrors setBackgroundUrl: an absolute
// direct-media URL, resolved (so a share link still works), stored in the
// avatar slot only — the background is never touched by this path.
// No AVATAR_MAX_MB check here: that ceiling guards an uploaded file's bytes,
// and this action only stores a URL — the gallery hands over a ~48 KB poster.
export async function setAvatarUrl(url: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const checked = storedMediaUrl(190).safeParse(url);
  if (!checked.success) return { ok: false, error: "invalid" };

  const resolved = await resolveMediaUrl(checked.data);
  if (!resolved) return { ok: false, error: "badmedia" };

  await prisma.profile.upsert({
    where: { userId },
    create: { userId, avatarUrl: resolved },
    update: { avatarUrl: resolved },
  });

  await revalidateProfile(userId);
  queueBadgeSync(userId); // hasAvatar badge

  return { ok: true, data: await mediaSnapshot(userId) };
}

export async function addBioLink(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const parsed = z
    .object({
      label: z.string().trim().min(1).max(60),
      url: z.string().trim().url().max(500),
    })
    .safeParse({
      label: str(formData.get("label")),
      url: str(formData.get("url")),
    });
  if (!parsed.success) return { ok: false, error: "invalid" };

  const position = await prisma.bioLink.count({ where: { userId } });
  await prisma.bioLink.create({ data: { userId, position, ...parsed.data } });
  await revalidateDashboard();
  queueBadgeSync(userId);
  return { ok: true };
}

export async function deleteBioLink(id: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };
  await prisma.bioLink.deleteMany({ where: { id, userId } });
  await revalidateDashboard();
  return { ok: true };
}

export async function addSocialLink(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const parsed = z
    .object({
      platform: z.enum(PLATFORMS),
      url: z.string().trim().url().max(500),
      username: z.string().trim().max(60).optional().default(""),
    })
    .safeParse({
      platform: str(formData.get("platform")),
      url: str(formData.get("url")),
      username: str(formData.get("username")),
    });
  if (!parsed.success) return { ok: false, error: "invalid" };

  // One row per platform: the links grid treats a tile as connected/not, so a
  // second Instagram row would render twice and fight over the same tile. Done
  // in the action rather than with a unique index, because existing accounts may
  // already hold duplicates and a push that enforces one would have to drop them.
  await prisma.$transaction([
    prisma.socialLink.deleteMany({
      where: { userId, platform: parsed.data.platform },
    }),
    prisma.socialLink.create({
      data: {
        userId,
        platform: parsed.data.platform,
        url: parsed.data.url,
        username: parsed.data.username || undefined,
      },
    }),
  ]);
  await revalidateDashboard();
  queueBadgeSync(userId);
  return { ok: true };
}

export async function deleteSocialLink(id: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };
  await prisma.socialLink.deleteMany({ where: { id, userId } });
  await revalidateDashboard();
  return { ok: true };
}

export async function deleteFile(id: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const file = await prisma.fileAsset.findFirst({
    where: { id, ownerId: userId },
  });
  if (!file) return { ok: false, error: "invalid" };

  // Which profile slots point at this exact asset right now? Read them before
  // the delete, otherwise the file can leave a background or avatar rendering a
  // dead /api/media path forever.
  const slots = await prisma.profile
    .findUnique({
      where: { userId },
      select: { avatarUrl: true, bannerUrl: true, cursorUrl: true, soundUrl: true },
    })
    .catch(() => null);

  await prisma.fileAsset.delete({ where: { id: file.id } });

  const dir = uploadDir();
  await fs.unlink(path.join(dir, file.storageKey)).catch(() => {});

  const url = mediaPathFor(file.storageKey);
  const cleared: {
    avatarUrl?: null;
    bannerUrl?: null;
    cursorUrl?: null;
    soundUrl?: null;
  } = {};
  if (slots?.avatarUrl === url) cleared.avatarUrl = null;
  if (slots?.bannerUrl === url) cleared.bannerUrl = null;
  if (slots?.cursorUrl === url) cleared.cursorUrl = null;
  if (slots?.soundUrl === url) cleared.soundUrl = null;
  if (Object.keys(cleared).length) {
    await prisma.profile
      .upsert({ where: { userId }, create: { userId, ...cleared }, update: cleared })
      .catch(() => {});
  }

  await revalidateDashboard();
  return { ok: true };
}
