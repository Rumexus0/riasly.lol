"use client";

import { useLocale, useTranslations } from "next-intl";

import SocialIcon from "@/components/icons/SocialIcon";
import AvatarMedia from "@/components/ui/AvatarMedia";
import DiscordBadgeGlyph, {
  discordBadges,
  type DiscordBadgeKey,
} from "@/components/icons/DiscordBadgeGlyph";
import {
  ALIGN_CLASSES,
  type ProfileAlignment,
} from "@/lib/profile-style";
import ElapsedTimer from "@/components/profile/ElapsedTimer";
import { formatRelativeTime } from "@/lib/format";
import type {
  DiscordActivityType,
  DiscordCardData,
} from "@/components/profile/useDiscordCard";

// The dot colours Discord itself uses for each presence state.
const STATUS_COLOR: Record<string, string> = {
  online: "#23a55a",
  idle: "#f0b232",
  dnd: "#f23f43",
  offline: "#80848e",
};

/**
 * The compact Discord card — who this is on Discord and what they are doing right
 * now. It sits BELOW the headline name in the hero (which carries the big avatar
 * and the riasly badges) and only mounts when the owner connected Discord, so
 * a profile without a link never shows a hollow card.
 *
 * The layout is ONE unified horizontal card, matching how Discord itself renders a
 * presence: avatar (with its status dot) on the left, the display name + the
 * authentic Discord marks and the "<Verb> <App>" / detail lines in the middle, and
 * the activity art tile on the right.
 *
 * Deliberate choices:
 *  - The Discord marks come from the bot's `users/{id}` (public_flags) plus the
 *    OAuth-only `premium_type`; the fake email-`verified` check was removed and is
 *    no longer read. They live beside the display name, where the reference shows
 *    them. The riasly earned badges are the hero's job (ProfileBadgeRow), so
 *    they are not repeated here.
 *  - The small avatar here is plain (a status dot, no 3D tilt, no decoration ring):
 *    the tilting, glowing focal avatar moved up into the hero.
 *  - The card is a single translucent plate (rounded-2xl, thin border) that always
 *    paints regardless of the panel. `framed` only picks the fill tone (panel-on
 *    reads `--panel-card`, otherwise a fixed dark plate). No `backdrop-blur` — a
 *    frosted card would re-blur the video.
 *  - With no activity the identity row still renders (avatar + name + marks + a
 *    status line), so the card is never an empty shell.
 *  - The guild chip and the elapsed timer are deliberately NOT shown: the presence
 *    reference is a compact single card. Their data still arrives on `discord`, it
 *    is simply not painted here.
 */
export default function ProfileCard({
  name,
  handle,
  discord,
  accent,
  framed,
  align,
  config,
}: {
  name: string | null;
  handle: string;
  discord: DiscordCardData;
  accent: string;
  /** panelOn: pick the pill's fill tone (--panel-card vs a fixed dark plate). */
  framed: boolean;
  /** Owner-chosen horizontal placement, shared with the hero via ALIGN_CLASSES. */
  align: ProfileAlignment;
  /** "Profil Widget'ı" toggles, threaded straight from the style kernel. The
   *  server chip is gone for good: the clan chip already names the owner's
   *  identity server, so showing a second guild chip was duplication. */
  config: { showBadges: boolean; idleText: string | null };
}) {
  const tp = useTranslations("profile.discord");
  const locale = useLocale();

  // Same literal class map the hero uses, so the card's rows line up with the
  // name/badges above it (center by default, or left/right on the owner's call).
  const a = ALIGN_CLASSES[align] ?? ALIGN_CLASSES.center;

  // Every activity verb is asked for by a literal key: the dictionary audit can
  // then prove all five exist in both locales, and TypeScript catches a new
  // Discord activity kind instead of a raw key reaching a visitor.
  const activityLabels: Record<DiscordActivityType, string> = {
    playing: tp("activityTypes.playing"),
    streaming: tp("activityTypes.streaming"),
    listening: tp("activityTypes.listening"),
    watching: tp("activityTypes.watching"),
    competing: tp("activityTypes.competing"),
  };

  // The Discord identity marks, painted beside the card's display name. Every
  // label is a literal key (same `profile.discord.badges.*` the hero used to read)
  // so the dictionary audit proves all fourteen exist in both locales.
  const marks = discordBadges(discord.premiumType, discord.publicFlags);
  const markLabels: Record<DiscordBadgeKey, string> = {
    staff: tp("badges.staff"),
    partner: tp("badges.partner"),
    moderator: tp("badges.moderator"),
    developer: tp("badges.developer"),
    activeDeveloper: tp("badges.activeDeveloper"),
    verifiedBot: tp("badges.verifiedBot"),
    bugHunter: tp("badges.bugHunter"),
    early: tp("badges.early"),
    nitro: tp("badges.nitro"),
    nitroClassic: tp("badges.nitroClassic"),
    hypesquadEvents: tp("badges.hypesquadEvents"),
    bravery: tp("badges.bravery"),
    brilliance: tp("badges.brilliance"),
    balance: tp("badges.balance"),
  };

  const dot = STATUS_COLOR[discord.status ?? "offline"] ?? STATUS_COLOR.offline;
  const statusLabel =
    discord.status === "online"
      ? tp("online")
      : discord.status === "idle"
        ? tp("idle")
        : discord.status === "dnd"
          ? tp("dnd")
          : tp("offline");

  // The activity's own detail line (the "Editing main.py" under a VS Code rich
  // presence); the verb and the app name get their own lines in the block below.
  const activityDetail = discord.activity
    ? discord.activity.details ?? discord.activity.state
    : null;

  // Spotify / music reads the way Discord phrases it — "Listening to <track>" on
  // the primary line with the artist beneath — rather than the generic "Playing
  // Spotify". A listening *type* or a music app name both route here, so the bot
  // (which reports type 2 with a Spotify app name) and Lanyard look identical.
  const isMusic =
    discord.activity?.type === "listening" ||
    (!!discord.activity && /spotify|music|song|itunes/i.test(discord.activity.name));
  // Secondary line differs: an artist for music, the rich-presence detail otherwise.
  const secondaryLine = discord.activity
    ? isMusic
      ? discord.activity.state
      : activityDetail
    : null;

  const initial = (discord.displayName ?? name ?? handle ?? "F").charAt(0).toUpperCase();

  // Offline but the bot has a last-seen stamp: Discord's "was here" state, where
  // the avatar dims and the presence line reads "last seen X ago" instead of the
  // owner's idle text. Only fires for a genuine offline status with a real stamp.
  const showLastSeen =
    discord.status === "offline" && discord.lastSeen != null && discord.ready;

  // The activity tile and its corner badge, Discord's own pairing: the big square
  // art with the app logo overlapping its corner. Without large art the small one
  // promotes to the tile and the corner stays a glyph.
  const tileUrl = discord.activity
    ? discord.activity.largeUrl ?? discord.activity.smallUrl
    : null;
  const cornerUrl = discord.activity?.largeUrl ? discord.activity.smallUrl : null;

  return (
    <div
      role="status"
      style={{ background: framed ? "var(--panel-card)" : "rgba(10,10,14,0.45)" }}
      className={`mt-5 flex w-fit max-w-sm items-center gap-3 rounded-2xl border border-white/10 py-2.5 pl-2.5 pr-3 shadow-card ${a.blockMargin}`}
    >
      {/* Left: the small avatar with its presence dot. The tilting, glowing focal
          avatar lives in the hero; this one stays plain. */}
      <span className="relative shrink-0">
        <span
          className={`block h-12 w-12 overflow-hidden rounded-full border border-white/10 ${
            showLastSeen ? "opacity-60 grayscale" : ""
          }`}
        >
          <AvatarMedia
            src={discord.avatarUrl}
            fallback={
              <span
                className="flex h-full w-full items-center justify-center text-base font-black text-softwhite"
                style={{ background: accent }}
              >
                {initial}
              </span>
            }
          />
        </span>
        {discord.status && (
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-nearblack"
            style={{ background: dot }}
          />
        )}
      </span>

      {/* Middle: the display name with the authentic Discord marks, then the live
          activity as Discord phrases it — "<Verb> <App>" on one line and the
          detail (e.g. "Editing main.py") beneath it. With no activity, the presence
          line carries the status instead so the card is never an empty shell. */}
      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-[15px] font-bold text-softwhite">
            {discord.displayName ?? name ?? handle}
          </span>
          {config.showBadges &&
            marks.map((key) => (
              <span key={key} title={markLabels[key]} className="badge-chip shrink-0">
                <DiscordBadgeGlyph badgeKey={key} className="h-4 w-4" />
                <span className="sr-only">{markLabels[key]}</span>
              </span>
            ))}
          {/* The clan is not in public_flags — it rides on the identity read
              (OAuth `users/@me` in practice) — so it appears as its own chip
              beside the flag marks, using Discord's own emblem art. A clan tag
              is short; a missing emblem hides the image but the tag still reads. */}
          {config.showBadges && discord.clan && (
            <span
              title={tp("badges.clan")}
              className="badge-chip shrink-0 max-w-[10rem] gap-1"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={discord.clan.emblemUrl}
                alt=""
                width={16}
                height={16}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-3.5 w-3.5 shrink-0 rounded"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <span className="truncate text-[11px]">{discord.clan.tag}</span>
            </span>
          )}
        </span>
        {discord.ready && discord.activity ? (
          <>
            <span className="mt-0.5 block truncate text-[13px] text-softwhite/90">
              {isMusic ? (
                tp("listeningTo", {
                  track: discord.activity.details ?? discord.activity.name,
                })
              ) : (
                <>
                  <span className="font-semibold">{activityLabels[discord.activity.type]}</span>{" "}
                  {discord.activity.name}
                </>
              )}
            </span>
            {secondaryLine && (
              <span className="block truncate text-xs text-mutedtext/70">{secondaryLine}</span>
            )}
            {discord.activity.start && (
              <ElapsedTimer startMs={discord.activity.start} />
            )}
          </>
        ) : showLastSeen ? (
          <span className="mt-0.5 block truncate text-xs italic text-mutedtext/70">
            {tp("lastSeen", {
              time: formatRelativeTime(discord.lastSeen as number, locale),
            })}
          </span>
        ) : (
          <span className="mt-0.5 block truncate text-xs italic text-mutedtext/70">
            {config.idleText || statusLabel}
          </span>
        )}
        {/* The representative-server chip now sits beside the display name (see
            the name row above), matching how Discord shows it in a profile. */}
      </span>

      {/* Right: the activity art tile — the big square art (or the app logo, or a
          Discord glyph fallback), exactly where the reference puts it. */}
      {discord.ready && discord.activity && (
        <span className="relative h-16 w-16 shrink-0">
          {/* An OUTER FRAME, not a filled square: a thin bordered plate with inner
              padding, and the art sits inside it (object-contain) rather than being
              cropped to fill the box. */}
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.04] p-1.5">
            {isMusic && !tileUrl ? (
              // Official Spotify logo when a track is playing but no album art
              // resolved — Discord sometimes omits the external asset URL.
              <span
                aria-hidden
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1DB954]"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="#0b0b0f">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.3-1.26-.78-2.82-1.02-4.68-.54-.36.12-.72-.12-.84-.48s.12-.72.48-.84c2.1-.6 3.9-.3 5.34.6.36.18.54.6.36.96zm1.44-3.3c-.3.48-.9.66-1.32.42-1.56-.96-3.96-1.2-5.82-.66-.6.18-1.2-.18-1.32-.72-.18-.6.18-1.2.72-1.32 2.28-.66 5.1-.36 7.02.84.48.3.66.96.42 1.44zm.12-3.36C17.04 9.42 13.8 9.3 11.7 9.84c-.78.24-1.62-.24-1.8-1.02-.24-.78.24-1.62 1.02-1.8 2.52-.66 6.3-.48 8.76 1.02.72.42.9 1.38.42 2.04-.36.6-1.32.78-1.98.3z" />
                </svg>
              </span>
            ) : (
              <SocialIcon platform="Discord" className="h-7 w-7 text-[#5865F2]" />
            )}
            {tileUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tileUrl}
                alt=""
                width={64}
                height={64}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="relative h-full w-full rounded-xl object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
          </span>
          {cornerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cornerUrl}
              alt=""
              width={24}
              height={24}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full object-cover ring-2 ring-[color:var(--panel-card)]"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
        </span>
      )}
    </div>
  );
}
