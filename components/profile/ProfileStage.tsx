"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import {
  m,
  useMotionValue,
  useMotionTemplate,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";

import { formatCount } from "@/lib/format";
import { useKeepPlaying } from "@/lib/keep-playing";
import { isVideoSrc } from "@/lib/media-kind";
import { MOTION_CLASS, type FxKey, type MotionKey } from "@/lib/template-recipes";
import SocialIcon, { platformBrand } from "@/components/icons/SocialIcon";
import Reveal from "@/components/motion/Reveal";
import MotionPrefSwitch from "@/components/motion/MotionPrefSwitch";
import EffectLayers from "@/components/profile/EffectLayers";
import ProfileTabs from "@/components/profile/ProfileTabs";
import WidgetRenderer from "@/components/profile/WidgetRenderer";
import SoundToggle from "@/components/profile/SoundToggle";
import AvatarMedia from "@/components/ui/AvatarMedia";
import ProfileCard from "@/components/profile/ProfileCard";
import ProfileBadgeRow from "@/components/profile/ProfileBadgeRow";
import { useDiscordCard } from "@/components/profile/useDiscordCard";
import { DEFAULT_PANEL, DEFAULT_STYLE, ALIGN_CLASSES, type ProfileStyle } from "@/lib/profile-style";
import type { StoredWidget } from "@/lib/widgets";

type Platform =
  | "Instagram"
  | "YouTube"
  | "TikTok"
  | "X"
  | "Twitch"
  | "Discord"
  | "GitHub"
  | "Telegram"
  | "Other";

type Social = { id: string; platform: string; url: string };
type Link = { id: string; label: string; url: string };

export type ProfileStageProps = {
  handle: string;
  name: string | null;
  bio: string | null;
  plan: string;
  accent: string;
  bgUrl: string | null;
  avatarUrl: string | null;
  viewCount: number;
  showViewCount: boolean;
  socials: Social[];
  links: Link[];
  /** Earned badge keys (lib/badges.ts catalog), already ordered by grant date. */
  badges: string[];
  /** Owner tints for the badge pill: { badgeKey: "#rrggbb" }. Missing = catalog tone. */
  badgeColors: Record<string, string>;
  /**
   * The template's motion recipe, resolved server-side from the catalog
   * (lib/template-recipes.ts) — the client never needs the catalog itself.
   * `null` means "the media already moves" or "not a curated template".
   */
  motion: MotionKey | null;
  /** Overlay layers of the same recipe, already capped at MAX_FX_LAYERS. */
  fx: FxKey[];
  /**
   * Widgets for THIS surface (home or the active tab), already filtered
   * server-side and type-guarded. Empty/omitted renders nothing, so a
   * pre-widget profile stays byte-for-byte identical.
   */
  widgets?: StoredWidget[];
  /** Extra tabs the user owns; the tab bar renders only when this is non-empty. */
  tabs?: { slug: string; title: string }[];
  /** Slug of the active tab (null = home). Highlights the matching tab chip. */
  activeSlug?: string | null;
  /**
   * The full style system (colors, opacity/blur, effects, toggles, cursor,
   * sound, discord). Defaults to DEFAULT_STYLE when omitted, so a pre-style
   * profile renders exactly as before.
   */
  style?: ProfileStyle;
};

export default function ProfileStage(props: ProfileStageProps) {
  const {
    handle,
    name,
    bio,
    plan,
    accent,
    bgUrl,
    avatarUrl,
    viewCount,
    showViewCount,
    socials,
    links,
    badges,
    badgeColors,
    motion,
    fx,
    widgets = [],
    tabs = [],
    activeSlug = null,
    style = DEFAULT_STYLE,
  } = props;
  const t = useTranslations("profile");

  // ---- Style-derived values, computed once (all plain, so render stays simple) ----
  // The effect accent falls back to the profile accent; it also rides on the root
  // as --fx-accent so the name-* CSS classes can read it.
  const fxAccent = style.effectColor ?? accent;
  // Horizontal placement of the whole content column (default center). Reads the
  // literal class map so a profile that never chose one still centres like the
  // reference; the owner can move it left/right from the customize panel.
  const a = ALIGN_CLASSES[style.profileAlign] ?? ALIGN_CLASSES.center;
  // Fallback glyph for the big avatar when no image resolves.
  const initial = (name ?? handle ?? "F").charAt(0).toUpperCase();
  // One Discord read per profile view: the owner's identity comes from our own
  // API (which spends their OAuth token server-side) and their live activity from
  // our bot (only members of our server). Gated on the stored id, so a profile
  // that never connected makes no request at all.
  const discord = useDiscordCard(handle, !!style.discordSnowflake);
  // The hero avatar is ALWAYS the owner's own uploaded site avatar. A linked
  // Discord never replaces it: the presence card below still paints the Discord
  // avatar, but the focal hero stays the site's own choice.
  const avatarSrc = avatarUrl;

  const nameEffect = style.usernameEffect;
  const useGradientName =
    nameEffect === "gradient" ||
    nameEffect === "shimmer" ||
    nameEffect === "rainbow";
  // "Animated title" is deliberately NOT in this list: it rides on the Reveal
  // wrapper instead. Two classes setting the `animation` shorthand on the same
  // element let whichever comes last in the stylesheet win outright, so turning
  // the float on used to silently erase the chosen effect's own animation.
  const nameCls = [
    nameEffect === "glow" && "name-glow",
    nameEffect === "neon" && "name-neon",
    nameEffect === "gradient" && "name-gradient",
    nameEffect === "shimmer" && "name-shimmer",
    nameEffect === "rainbow" && "name-rainbow",
    nameEffect === "typewriter" && "name-typewriter",
    nameEffect === "glitch" && "name-glitch",
    nameEffect === "flicker" && "name-flicker",
    nameEffect === "glowpulse" && "name-glowpulse",
    style.glitterName && "glitter",
  ]
    .filter(Boolean)
    .join(" ");

  const rootStyle = {
    cursor: style.cursorUrl ? `url("${style.cursorUrl}") 4 4, auto` : undefined,
    backgroundColor: style.bgColor ?? undefined,
    ["--fx-accent" as string]: fxAccent,
    // Secondary/tertiary palette stops. Left unset when the owner picked fewer
    // than 2/3 colours so the .name-* CSS falls back to its own literal.
    ["--fx-accent2" as string]: style.effectColors[1] ?? undefined,
    ["--fx-accent3" as string]: style.effectColors[2] ?? undefined,
  } as CSSProperties;

  // The panel box: a rounded surface the owner tunes with the opacity/blur
  // sliders. Both fall back to DEFAULT_PANEL when untouched (null), so a profile
  // that never opened the dashboard still gets the reference's flat translucent
  // box rather than nothing at all.
  const panelOpacity = style.profileOpacity ?? DEFAULT_PANEL.opacity; // 0..100
  const panelBlur = style.profileBlur ?? DEFAULT_PANEL.blur; // 0..40
  const panelOn = panelOpacity > 0 || panelBlur > 0;
  const panelStyle: CSSProperties = {
    background: panelOn
      ? `rgba(10,10,14,${(panelOpacity / 100).toFixed(2)})`
      : "transparent",
    // SHORT-CIRCUIT: even blur(0px) makes Chromium/Safari create a backdrop root
    // and re-blur it every frame over the playing video, so omit the property
    // entirely when the owner asked for no blur.
    ...(panelBlur >= 1
      ? {
          backdropFilter: `blur(${panelBlur}px)`,
          WebkitBackdropFilter: `blur(${panelBlur}px)`,
        }
      : {}),
    // The card reads its own surface from this so the opacity slider darkens or
    // clears it with the rest of the panel. No floor: at opacity 0 the panel is
    // off and the card goes fully transparent (frameless), which is what the owner
    // asked for. Server-computed → no hydration risk.
    ["--panel-card" as string]: panelOn
      ? `rgba(8,8,14,${(panelOpacity / 100).toFixed(2)})`
      : "transparent",
  };

  // Social icon colour: brand per platform normally, one flat colour under
  // "monochrome icons", or the owner's explicit iconColor which wins over both
  // (falling back to the accent).
  const monoColor = style.iconColor ?? accent;

  const reduce = useReducedMotion();
  const [fine, setFine] = useState(false);
  useEffect(() => {
    try {
      setFine(window.matchMedia("(pointer: fine)").matches);
    } catch {
      setFine(false);
    }
  }, []);
  const enabled = fine && !reduce;

  // The recipe's drift, as a plain class that is always in the DOM. It is
  // app/globals.css that decides whether it runs: the clamp freezes it on a
  // reduced-motion machine unless the visitor chose "always", and freezes it for
  // everyone when they chose "calm". Gating the *class* on a hook value instead
  // would desync hydration, and a `motion-safe:` variant would be a media query
  // the visitor's explicit choice could not overrule.
  const motionCls = motion ? MOTION_CLASS[motion] : "";

  // Background media type: video loops via <video>; gif/img render as CSS bg.
  const isVideo = isVideoSrc(bgUrl);
  // Owner-chosen clip of the background video, in seconds (null = open-ended).
  // Mirrors the sound trim: start-only loops from there to the end, end-only loops
  // the head, both bounds loop that window. With neither set the clip plays whole.
  const clipStart = style.bgClipStartMs != null ? style.bgClipStartMs / 1000 : null;
  const clipEnd = style.bgClipEndMs != null ? style.bgClipEndMs / 1000 : null;
  const clipActive = clipStart != null || clipEnd != null;
  // Nudge a looping background video to begin on a decoded frame: t=0 is frequently
  // a blank keyframe, and on a loop the tail frame lingers for a beat — the pink/
  // green flash people see when the clip wraps. Seeking to the clip start (or 0.1s)
  // lands both the first paint and every restart on a real frame.
  const videoSrc = bgUrl
    ? `${bgUrl.split("#")[0]}#t=${clipStart != null ? clipStart.toFixed(3) : "0.1"}`
    : undefined;
  const [bgFailed, setBgFailed] = useState(false);

  // Click-to-enter gate. Always starts closed on every profile load (the owner's
  // choice is "on for everyone", so there is no persisted bypass) — the blurred
  // veil lifts on the first click/keypress and never returns for this view.
  const [entered, setEntered] = useState(false);

  // Reset the error fallback whenever the source changes.
  useEffect(() => setBgFailed(false), [bgUrl]);

  // <video> reports a dead source through onError, but a CSS background-image
  // never fires anything — a broken hotlink would just paint nothing over the
  // black layer. Probe the same URL so the gradient fallback takes over with
  // the same contract the video branch already has.
  useEffect(() => {
    if (!bgUrl || isVideo) return;
    const probe = new Image();
    probe.onerror = () => setBgFailed(true);
    probe.src = bgUrl;
    return () => {
      probe.onerror = null;
    };
  }, [bgUrl, isVideo]);

  // The background loop and the avatar media are author-chosen content, not
  // decorative motion, so they play forever even on machines with
  // prefers-reduced-motion. The OS setting still turns off the *effects*
  // (parallax, spotlight, avatar tilt) via `enabled`, and this layer stays
  // aria-hidden.
  const { keepPlaying, keepPlayingProps } = useKeepPlaying<HTMLVideoElement>();

  // Browsers pause hidden tabs / suspended apps; resume when we come back.
  useEffect(() => {
    if (!isVideo) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") keepPlaying();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isVideo, keepPlaying, bgUrl]);

  // Normalized pointer position (0..1), spring-smoothed.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 50, damping: 20 });
  const sy = useSpring(py, { stiffness: 50, damping: 20 });

  const bgX = useTransform(sx, [0, 1], ["2%", "-2%"]);
  const bgY = useTransform(sy, [0, 1], ["2%", "-2%"]);
  const rotateX = useTransform(sy, [0, 1], [8, -8]);
  const rotateY = useTransform(sx, [0, 1], [-8, 8]);
  const spotX = useTransform(sx, (v) => `${v * 100}%`);
  const spotY = useTransform(sy, (v) => `${v * 100}%`);
  const spotlight = useMotionTemplate`radial-gradient(360px circle at ${spotX} ${spotY}, rgba(139,92,246,0.28), transparent 65%)`;

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!enabled) return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  }

  return (
    <div
      onPointerMove={onPointerMove}
      style={rootStyle}
      className="relative isolate min-h-[100dvh] w-full overflow-hidden"
    >
      {/* Click-to-enter veil. Covers the whole profile until the visitor clicks;
          the page beneath stays mounted (so the muted loop keeps playing and the
          content is still crawlable). Removed from the tree once entered. */}
      {!entered && (
        <button
          type="button"
          onClick={() => setEntered(true)}
          className="intro-gate"
        >
          {t("clickToEnter")}
        </button>
      )}

      {/* Views + location meta, pinned top-right like the reference (image 3).
          Pointer-events are off so it never intercepts a click meant for the gate
          or a link. */}
      {((showViewCount && viewCount > 0) || style.location) && (
        <div className="pointer-events-none absolute right-4 top-4 z-20 flex items-center gap-2 text-xs text-mutedtext/80">
          {showViewCount && viewCount > 0 && (
            <span className="view-pill inline-flex items-center gap-1.5 rounded-pill bg-white/5 px-2.5 py-1 ring-1 ring-white/10">
              <EyeIcon className="h-3.5 w-3.5" />
              <span>{formatCount(viewCount)}</span>
              <span className="sr-only">{t("views")}</span>
            </span>
          )}
          {style.location && (
            <span className="inline-flex items-center gap-1">
              <PinIcon className="h-3.5 w-3.5" />
              <span>{style.location}</span>
            </span>
          )}
        </div>
      )}

      {/* ===== Background (parallax overscan only while effects are live) ===== */}
      {bgUrl && !bgFailed ? (
        <m.div
          aria-hidden
          style={{ x: bgX, y: bgY }}
          className={`absolute z-0 bg-nearblack ${enabled ? "inset-[-3%]" : "inset-0"}`}
        >
          {isVideo ? (
            <video
              className="h-full w-full bg-nearblack object-cover"
              autoPlay
              muted
              playsInline
              preload="auto"
              onError={() => setBgFailed(true)}
              {...keepPlayingProps}
              // With a custom clip we drive the wrap ourselves (a native loop
              // would reset to 0, not to the clip start), so `loop` is only left
              // on for the untouched whole-clip case.
              loop={!clipActive}
              onLoadedMetadata={(e) => {
                if (clipStart == null) return;
                try {
                  e.currentTarget.currentTime = clipStart;
                } catch {
                  // Not seekable yet — the media fragment / first timeupdate fixes it.
                }
              }}
              onTimeUpdate={(e) => {
                const el = e.currentTarget;
                if (clipEnd != null && el.currentTime >= clipEnd) {
                  el.currentTime = clipStart ?? 0;
                } else if (
                  clipEnd == null &&
                  clipStart != null &&
                  Number.isFinite(el.duration) &&
                  el.duration > 0 &&
                  el.currentTime >= el.duration - 0.25
                ) {
                  el.currentTime = clipStart;
                }
              }}
              onEnded={(e) => {
                // Start-only clip: rewind to the clip start before the keep-playing
                // restart, so the loop never flashes back through the head.
                if (clipStart != null) {
                  try {
                    e.currentTarget.currentTime = clipStart;
                  } catch {
                    // ignore; play() below still resumes.
                  }
                }
                keepPlaying();
              }}
            >
              <source src={videoSrc} />
            </video>
          ) : (
            <div
              // A still has no motion of its own, unlike a video/gif the author
              // picked, so this drift is OUR decoration — which is why it obeys the
              // visitor's motion choice instead of running forever like the loop
              // layer above.
              className={`h-full w-full bg-cover bg-center ${motionCls}`}
              style={{ backgroundImage: `url(${bgUrl})` }}
            />
          )}
        </m.div>
      ) : (
        <>
          <div aria-hidden className="absolute inset-0 z-0 bg-nearblack" />
          <div
            aria-hidden
            className="profile-effects-immutable absolute inset-0 z-0 bg-brandgrad opacity-40 [background-size:300%_300%] animate-gradient-pan"
          />
          <span
            aria-hidden
            className="profile-effects-immutable absolute left-[15%] top-[18%] z-0 h-40 w-40 rounded-full bg-plumborder/30 blur-3xl animate-particle"
          />
          <span
            aria-hidden
            className="profile-effects-immutable absolute right-[12%] top-[46%] z-0 h-52 w-52 rounded-full bg-accent/25 blur-3xl animate-particle [animation-delay:2.5s]"
          />
          <span
            aria-hidden
            className="profile-effects-immutable absolute bottom-[12%] left-[32%] z-0 h-44 w-44 rounded-full bg-accent2/20 blur-3xl animate-particle [animation-delay:4.5s]"
          />
        </>
      )}

      {/* The recipe's effect layers, under the scrim. Where the artwork itself
          is missing (a dead hotlink) the gradient bloom below already plays the
          particle role, so its copy is dropped rather than doubled. */}
      <EffectLayers
        fx={bgFailed || !bgUrl ? fx.filter((k) => k !== "particles") : fx}
        accent={fxAccent}
      />

      {/* Optional brand-gradient wash behind the content, only when the owner
          turned the profile gradient on. */}
      {style.profileGradient && (
        <div
          aria-hidden
          className="profile-effects-immutable absolute inset-0 z-0 bg-brandgrad opacity-30 [background-size:300%_300%] animate-gradient-pan"
        />
      )}

      {/* scrim for legibility (frameless) */}
      <div
        aria-hidden
        className="absolute inset-0 z-0 bg-gradient-to-b from-nearblack/25 via-nearblack/35 to-nearblack/60"
      />
      {/* cursor spotlight */}
      {enabled && (
        <m.div
          aria-hidden
          style={{ background: spotlight }}
          className="pointer-events-none absolute inset-0 z-0 mix-blend-screen"
        />
      )}

      {/* ===== Frameless content (owner-placed: center default, or left/right) ===== */}
      <div className={`relative z-10 mx-auto flex min-h-[100dvh] w-full flex-col ${a.items} justify-center px-4 py-14 ${a.text}`}>
        {/* The panel box: a rounded, owner-tunable surface holding the hero, card,
            bio, tabs and socials. panelStyle publishes --panel-card for the card;
            the frame only paints when opacity/blur is actually on, so an untouched
            profile still reads as the flat reference layout. */}
        <div
          style={panelStyle}
          className={`w-full max-w-lg px-5 py-9 sm:px-8 ${panelOn ? "rounded-[26px] border border-white/10 shadow-[0_30px_90px_-45px_rgba(0,0,0,0.95)]" : ""}`}
        >
          {/* The big focal avatar: centered above the name, carrying the pointer
              tilt and the optional accent decoration ring. It replaced the small
              avatar that used to sit inside the card, matching the reference's size
              and position. */}
          <Reveal className={`flex ${a.justify}`}>
            <m.span
              style={{
                rotateX,
                rotateY,
                transformStyle: "preserve-3d",
                boxShadow: style.discordAvatarDecoration
                  ? `0 0 0 3px ${accent}, 0 0 34px -2px ${accent}`
                  : `0 0 30px -8px ${accent}`,
              }}
              className="relative block h-28 w-28 shrink-0 overflow-hidden rounded-full border-2 border-white/10 sm:h-32 sm:w-32"
            >
              <AvatarMedia
                src={avatarSrc}
                fallback={
                  <span
                    className="flex h-full w-full items-center justify-center text-3xl font-black text-softwhite"
                    style={{ background: accent }}
                  >
                    {initial}
                  </span>
                }
              />
            </m.span>
          </Reveal>

          {/* The reference puts the name first and largest: it is the headline of
              the page and every chosen effect is painted on this line. The old
              dark drop-shadow is gone — it muddied a glowing name and put the LCP
              element through a per-frame filter buffer, while the scrim above
              already carries the legibility. With no effect chosen, `name-hero` is
              the plain white bloom. */}
          <Reveal
            delay={0.05}
            className={style.animatedTitle ? "name-animated" : undefined}
          >
            <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${a.justify}`}>
              <h1
                className={`text-4xl font-black tracking-tight sm:text-5xl ${nameCls || "text-softwhite name-hero"}`}
                style={
                  !useGradientName && style.textColor
                    ? { color: style.textColor }
                    : undefined
                }
              >
                {name ?? handle}
              </h1>
              {/* Earned riasly marks beside the headline name. The Discord marks
                  live inside the presence card below, not here. */}
              <ProfileBadgeRow
                badges={badges}
                badgeColors={badgeColors}
                glitterBadges={style.glitterBadges}
              />
            </div>
            <p
              className="mt-1 text-mutedtext/80"
              style={style.textColor ? { color: style.textColor } : undefined}
            >
              @{handle}
            </p>
          </Reveal>

          {/* The compact Discord card, below the name — only when the owner linked
              Discord AND has not switched the widget off. It carries the small
              avatar + status, the display name with the Discord marks, and the live
              activity; the owner's widget toggles decide what actually paints. */}
          {!!style.discordSnowflake && style.discordCardEnabled && style.widgetsEnabled && (
            <ProfileCard
              name={name}
              handle={handle}
              discord={discord}
              accent={accent}
              framed={panelOn}
              align={style.profileAlign}
              config={{
                showBadges: style.discordCardShowBadges,
                idleText: style.discordCardIdleText,
              }}
            />
          )}

          {plan === "PREMIUM" && (
            <span
              className="badge-chip mt-3 gap-1.5 px-3 py-1 text-xs font-semibold text-softwhite"
              style={{
                borderColor: accent,
                background: `${accent}33`,
                boxShadow: `0 0 22px -8px ${accent}`,
              }}
            >
              {t("premiumBadge")}
            </span>
          )}

          {bio && (
            <p
              className={`mt-4 max-w-md text-[16px] leading-relaxed text-mutedtext drop-shadow-[0_1px_8px_rgba(0,0,0,0.7)] ${a.blockMargin}`}
              style={style.textColor ? { color: style.textColor } : undefined}
            >
              {bio}
            </p>
          )}

          {tabs.length > 0 && (
            <ProfileTabs
              handle={handle}
              tabs={tabs}
              activeSlug={activeSlug}
              homeLabel={t("tabs.home")}
            />
          )}

          {/* socials */}
          {socials.length > 0 && (
            <div
              className={`mt-6 flex flex-wrap items-center ${a.justify} gap-3${style.glitterSocials ? " glitter" : ""}`}
            >
              {socials.map((s, i) => (
                <Reveal key={s.id} delay={i * 0.06}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.platform}
                    style={{
                      ["--brand" as string]:
                        style.iconColor ??
                        (style.monochromeIcons
                          ? monoColor
                          : platformBrand[s.platform as Platform] ?? platformBrand.Other),
                      // The reference row blooms plain white; an owner who picked an
                      // icon colour (or monochrome) blooms in that colour instead.
                      ["--bloom" as string]:
                        style.iconColor ?? (style.monochromeIcons ? monoColor : "#ffffff"),
                    }}
                    className={`social-glow inline-flex h-11 w-11 items-center justify-center transition-all duration-300 hover:-translate-y-1 hover:scale-110 hover:text-[color:var(--brand)] hover:[filter:drop-shadow(0_0_10px_var(--brand))] ${style.monochromeIcons || style.iconColor ? "text-[color:var(--brand)]" : "text-softwhite"}`}
                  >
                    <SocialIcon platform={s.platform as Platform} className="h-8 w-8" />
                  </a>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* widgets + links sit below, still frameless (the files list is gone from
          the public profile by owner request — uploads stay managed in the
          dashboard). */}
      {(widgets.length > 0 || links.length > 0) && (
        <div className="relative z-10 mx-auto w-full max-w-lg px-6 pb-16">
          {widgets.length > 0 && (
            <div className="space-y-4">
              {widgets.map((widget, i) => (
                <Reveal key={widget.id} delay={i * 0.06}>
                  <WidgetRenderer widget={widget} />
                </Reveal>
              ))}
            </div>
          )}

          {links.length > 0 && (
            <div className={`${widgets.length > 0 ? "mt-6 " : ""}space-y-3`}>
              {links.map((link, i) => (
                <Reveal key={link.id} delay={i * 0.06}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={
                      style.boxColors
                        ? { background: `${accent}22`, borderColor: `${accent}55` }
                        : undefined
                    }
                    className="flex h-14 items-center justify-between rounded-card border border-white/10 bg-white/[0.04] px-5 font-medium text-softwhite backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-plumborder hover:shadow-glow"
                  >
                    <span className="truncate">{link.label}</span>
                    <span aria-hidden style={{ color: accent }}>
                      →
                    </span>
                  </a>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="relative z-10 pb-8 text-center text-sm text-mutedtext/50">
        riasly/{handle}
      </p>

      {/* Background music, when the owner both uploaded a track and enabled it.
          The pill mounts only once the visitor has entered, so no audio bytes are
          spent on the intro gate; that same enter-click is the gesture that lets
          SoundToggle start playing right away — afterwards the speaker button only
          mutes/unmutes. It can't be clicked through the gate because it isn't there
          until they're in. */}
      {entered && style.soundEnabled && style.soundUrl && (
        <SoundToggle
          src={style.soundUrl}
          startMs={style.soundStartMs}
          endMs={style.soundEndMs}
        />
      )}

      {/* On a machine that asks for reduced motion, this is the only way a visitor
          can see what a template actually does. Stored on their device. Measured at
          375x812: a fixed control there floats over the handle line and the file
          rows, so on a phone it joins the flow under the footer and only the wider
          layout keeps it pinned to the corner. */}
      <MotionPrefSwitch className="fixed bottom-4 left-4 z-20 hidden opacity-70 transition-opacity hover:opacity-100 focus-within:opacity-100 sm:inline-flex" />
      <div className="relative z-10 flex justify-center pb-10 sm:hidden">
        <MotionPrefSwitch />
      </div>
    </div>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path d="M12 21s-7-6.5-7-11a7 7 0 1 1 14 0c0 4.5-7 11-7 11z" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
