"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Background music for a profile, as a top-left pill: a speaker button plus a
 * volume slider (the visitor can mute). The visitor's click on the intro gate is
 * the user gesture that unlocks audio, so once the pill mounts (only after they
 * enter) playback starts on its own at normal volume — no second tap required.
 * play() is reached from two gesture-authorized points: the mount that follows the
 * enter-click (via the armed onLoadedMetadata below), and any later speaker tap.
 * If a browser still refuses, the pill stays and the speaker button plays on tap.
 *
 * When the owner set a seconds range, only that segment loops. The audio src
 * stays the pristine stored URL (a #t= fragment would break the media-slot
 * equality checks in releaseUnusedMedia/inUse), so the bounds are enforced in
 * JS: seek to the start once metadata is ready, start playing from there (never a
 * 0→start burst), and wrap back on every timeupdate past a KNOWN end. When the end
 * is open (start-only, or an end past the real duration) timeupdate has nothing to
 * wrap on, so the `ended` event is the safety net: it returns to the trim start
 * instead of letting native loop restart at 0. timeupdate fires ~4×/s, so the wrap
 * can overshoot by up to ~250ms — imperceptible for a music loop and far cheaper
 * than a rAF clock.
 *
 * Mounted only when the owner both uploaded a sound AND enabled it, so a profile
 * without music renders nothing at all.
 */
export default function SoundToggle({
  src,
  startMs,
  endMs,
}: {
  src: string;
  startMs?: number | null;
  endMs?: number | null;
}) {
  const t = useTranslations("profile");
  const ref = useRef<HTMLAudioElement>(null);
  // The enter-click that mounts this pill authorizes one automatic start; it is
  // consumed in onLoadedMetadata so a later metadata reload (a track swap) can't
  // autoplay without a fresh gesture.
  const armed = useRef(true);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [vol, setVol] = useState(0.6);

  const startS = (startMs ?? 0) / 1000;
  const endS = endMs != null ? endMs / 1000 : null;
  // A range means we drive the loop ourselves, so native loop must be off (the
  // two would fight at the boundary) and metadata must load before we can seek.
  const hasRange = (startMs ?? null) != null || endS != null;

  // Begin playback at the visitor's chosen volume. Reached by the enter-click
  // mount (armed onLoadedMetadata) and by a later speaker tap — both gestures, so
  // play() is allowed. Kept out of toggle() so mount starts audio without ever
  // touching the mute branch.
  async function start() {
    const el = ref.current;
    if (!el) return;
    try {
      el.volume = vol;
      el.muted = false;
      setMuted(false);
      await el.play();
      setPlaying(true);
    } catch {
      // Autoplay still blocked or the file failed — stay silent, no crash; the
      // speaker button stays as a manual retry.
      setPlaying(false);
    }
  }

  async function toggle() {
    const el = ref.current;
    if (!el) return;
    if (!playing) {
      await start();
      return;
    }
    // Already playing: the button is now the mute toggle (never zero the volume,
    // so unmuting restores the visitor's chosen level and the bar stays put).
    const next = !muted;
    el.muted = next;
    setMuted(next);
  }

  function changeVolume(v: number) {
    setVol(v);
    const el = ref.current;
    if (!el) return;
    el.volume = v;
    if (v > 0 && el.muted) {
      el.muted = false;
      setMuted(false);
    }
  }

  function onLoadedMetadata() {
    const el = ref.current;
    if (el && startS > 0) {
      try {
        el.currentTime = startS;
      } catch {
        // Not seekable yet — the first play still starts from the top.
      }
    }
    // Seeked first, then start: so a trimmed track begins at its start point, not
    // at 0. One-shot (armed consumed here) — a track swap reloads metadata but
    // must not autoplay without a new gesture.
    if (armed.current) {
      armed.current = false;
      void start();
    }
  }

  function onTimeUpdate() {
    const el = ref.current;
    if (!el || endS == null) return;
    // Wrap at the end, and recover if the engine restarted at 0 (past the start).
    if (el.currentTime >= endS || el.currentTime < startS - 0.25) {
      el.currentTime = startS;
    }
  }

  function onEnded() {
    const el = ref.current;
    // No range: native loop already rewinds at 0, nothing to do. With a range the
    // loop is ours, and an open end (start-only, or an end beyond the real length)
    // never trips onTimeUpdate — so the `ended` event is what keeps it looping. A
    // user-gesture-unlocked <audio> may play() again from here (sticky activation);
    // if the browser still refuses we just go silent instead of crashing.
    if (!el || !hasRange) return;
    el.currentTime = startS;
    void el.play().catch(() => setPlaying(false));
  }

  const label = !playing
    ? t("sound.play")
    : muted
      ? t("sound.unmute")
      : t("sound.mute");

  return (
    <div className="fixed left-4 top-4 z-[60] inline-flex items-center gap-2 rounded-pill bg-white/5 px-2.5 py-1.5 text-softwhite ring-1 ring-white/10 backdrop-blur">
      <audio
        ref={ref}
        src={src}
        loop={!hasRange}
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
      />
      <button
        type="button"
        onClick={toggle}
        aria-pressed={muted}
        aria-label={label}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition hover:scale-105"
      >
        {muted ? <SpeakerMutedIcon /> : <SpeakerIcon />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : vol}
        onChange={(e) => changeVolume(Number(e.target.value))}
        aria-label={t("sound.volume")}
        className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-white/25 accent-white"
      />
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" strokeLinecap="round" />
    </svg>
  );
}

function SpeakerMutedIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
      <path d="M17 9l4 6M21 9l-4 6" strokeLinecap="round" />
    </svg>
  );
}
