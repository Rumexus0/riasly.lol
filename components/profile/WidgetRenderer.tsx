"use client";

import { useEffect, useState } from "react";

import {
  WIDGET_KIND,
  isAllowedCardHref,
  isAllowedEmbedSrc,
  type StoredWidget,
} from "@/lib/widgets";

// Renders one stored widget. It never receives raw user markup: the canonical
// src was fixed server-side, and the origin guard below re-checks it here as a
// second gate, so a hand-edited or legacy row still cannot point an iframe at
// an arbitrary host. Nothing below ever uses dangerouslySetInnerHTML.

// Per-provider iframe chrome: a fixed height band + the permission set each
// embed actually needs. Kept as data so adding a provider is one row.
const IFRAME_STYLE: Record<string, { height: string; allow: string }> = {
  youtube: { height: "aspect-video", allow: "accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen" },
  twitch: { height: "aspect-video", allow: "autoplay; fullscreen; picture-in-picture" },
  spotify: { height: "h-[352px]", allow: "encrypted-media; clipboard-write" },
  soundcloud: { height: "h-[400px]", allow: "autoplay; encrypted-media; fullscreen" },
};

// Small brand glyph per card type. Kept inline (not an <svg> import) so the
// bundle stays tiny; the visual is a decorative initial, not a brand asset.
const CARD_GLYPH: Record<string, string> = {
  discord: "💬",
  discord_server: "🏰",
  telegram: "✈",
  roblox: "🎮",
  github: "🐙",
  lastfm: "🎵",
  link: "🔗",
};

function aspectOrHeight(height: string): string {
  // aspect-video is a Tailwind ratio class; the others are fixed heights. Both
  // need a width, supplied by the wrapper.
  return height;
}

export default function WidgetRenderer({ widget }: { widget: StoredWidget }) {
  const kind = WIDGET_KIND[widget.type];

  // Presence is rendered by ProfileStage's own ProfileCard branch (it reads the
  // discordCard* columns); the row exists only as a "the owner turned this on"
  // marker, so we render nothing here and let the caller's card show.
  if (kind === "presence") return null;

  // Origin guard for iframe/image: an untrusted src falls back to an inert
  // label chip rather than a live element. Cards use the looser href guard
  // because they only ever open an external link, never embed content.
  if ((kind === "iframe" || kind === "image") && widget.sourceUrl && !isAllowedEmbedSrc(widget.sourceUrl)) {
    return <BrokenChip label={widget.label} />;
  }
  if (kind === "card" && widget.sourceUrl && !isAllowedCardHref(widget.sourceUrl)) {
    return <BrokenChip label={widget.label} />;
  }

  if (kind === "text") {
    return (
      <p className="rounded-card border border-white/10 bg-white/[0.04] px-5 py-4 text-left text-[15px] leading-relaxed text-softwhite backdrop-blur">
        {widget.extra ?? ""}
      </p>
    );
  }

  if (kind === "weather") {
    return <WeatherChip city={widget.extra ?? ""} />;
  }

  if (kind === "timezone") {
    return <TimezoneChip zone={widget.extra ?? "UTC"} label={widget.label} />;
  }

  if (kind === "image") {
    return <ImageWidget widget={widget} />;
  }

  if (kind === "card") {
    const glyph = CARD_GLYPH[widget.type] ?? "🔗";
    return (
      <a
        href={widget.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-14 items-center justify-between rounded-card border border-white/10 bg-white/[0.04] px-5 font-medium text-softwhite backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-plumborder hover:shadow-glow"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="shrink-0 text-lg leading-none">
            {glyph}
          </span>
          <span className="truncate">{widget.label}</span>
        </span>
        <span aria-hidden className="text-plumborder">
          ↗
        </span>
      </a>
    );
  }

  // iframe
  const style = IFRAME_STYLE[widget.type] ?? { height: "aspect-video", allow: "" };
  return (
    <div
      className={`w-full overflow-hidden rounded-card border border-white/10 bg-black/40 backdrop-blur ${aspectOrHeight(
        style.height
      )}`}
    >
      <iframe
        src={widget.sourceUrl}
        title={widget.label || widget.type}
        className="h-full w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer"
        allow={style.allow}
        // Sandboxed but functional: scripts + same-origin are what the players
        // require; no top-navigation or form submission is granted.
        sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
      />
    </div>
  );
}

function ImageWidget({ widget }: { widget: StoredWidget }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <BrokenChip label={widget.label} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={widget.sourceUrl}
      alt={widget.label}
      loading="lazy"
      onError={() => setFailed(true)}
      className="max-h-[420px] w-full rounded-card border border-white/10 object-contain"
    />
  );
}

function BrokenChip({ label }: { label: string }) {
  return (
    <p className="flex h-14 items-center rounded-card border border-white/10 bg-white/[0.02] px-5 text-sm text-mutedtext/70">
      {label || "Widget"}
    </p>
  );
}

// A static chip: the plan deliberately skips a live weather API. The city name
// arrives from widget.extra (already sanitized by resolveWeather), so React's
// default escaping is enough — no markup can reach the DOM here.
function WeatherChip({ city }: { city: string }) {
  if (!city) return <BrokenChip label="Weather" />;
  return (
    <p className="flex h-14 items-center gap-3 rounded-card border border-white/10 bg-white/[0.04] px-5 text-[15px] text-softwhite backdrop-blur">
      <span aria-hidden className="text-lg leading-none">☁</span>
      <span className="truncate">{city}</span>
    </p>
  );
}

// Live clock for the chosen IANA zone. Renders "loading" on the first paint
// (before the interval mounts) so SSR and the client's first tick agree on
// something visually neutral; the tick replaces it immediately after mount.
function TimezoneChip({ zone, label }: { zone: string; label: string }) {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const fmt = new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const tick = () => {
      if (cancelled) return;
      try {
        setNow(fmt.format(new Date()));
      } catch {
        setNow(null);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [zone]);
  return (
    <p className="flex h-14 items-center justify-between rounded-card border border-white/10 bg-white/[0.04] px-5 text-[15px] text-softwhite backdrop-blur">
      <span className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="text-lg leading-none">🕒</span>
        <span className="truncate">{label || zone}</span>
      </span>
      <span className="shrink-0 font-mono tabular-nums text-plumborder">
        {now ?? "—"}
      </span>
    </p>
  );
}
