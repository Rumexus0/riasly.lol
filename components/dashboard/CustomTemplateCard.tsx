"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  applyBackgroundFromFile,
  clearCustomBackground,
  updateBackgroundClip,
  type ActionResult,
} from "@/app/actions/profile";
import { isVideoSrc, firstFrameSrc } from "@/lib/media-kind";
import { useKeepPlaying } from "@/lib/keep-playing";
import { formatBytes } from "@/lib/format";
import GlassCard from "@/components/ui/GlassCard";
import {
  btnGhost,
  fileInputCls,
  inputCls,
  useQuotaMessage,
} from "@/components/dashboard/form-kit";

export type CustomBackgroundAsset = {
  id: string;
  name: string;
  size: number;
  mime: string;
  /** Ready-to-use /api/media/<uuid>.<ext> path (extension guaranteed). */
  url: string;
};

export type CustomTemplateEligibility = { allowed: boolean; daysLeft: number };

/** UHD height in landscape; a vertical clip needs 3840 px on its short edge. */
const UHD_HEIGHT = 2160;

type Dims = { w: number; h: number };

/** Measure any src (object URL or /api/media path) without decoding it on page. */
function measureSrc(url: string, video: boolean): Promise<Dims | null> {
  return new Promise((resolve) => {
    if (video) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => resolve({ w: v.videoWidth, h: v.videoHeight });
      v.onerror = () => resolve(null);
      v.src = url;
      return;
    }
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Read the intrinsic size of a picked file locally, before any bytes are pushed:
 * a 300 MB upload on a slow line, or a 480 px GIF promised as "4K", should be
 * visible first. Informational only — it never blocks the upload.
 */
async function measureFile(file: File): Promise<Dims | null> {
  const url = URL.createObjectURL(file);
  try {
    return await measureSrc(url, file.type.startsWith("video/"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Same measurement for an already uploaded asset, on demand. */
function measureAsset(url: string): Promise<Dims | null> {
  return measureSrc(url, isVideoSrc(url));
}

const btnPrimary =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-pill bg-brandgrad px-5 text-sm font-medium text-white shadow-glow transition-all hover:shadow-glowLg hover:-translate-y-0.5 active:translate-y-0 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60";

export type CustomTemplateCardProps = {
  eligibility: CustomTemplateEligibility;
  currentBannerUrl: string | null;
  assets: CustomBackgroundAsset[];
  maxMb: number;
  /**
   * Stored background-video clip bounds in ms (null = open-ended). Seed the trim
   * inputs so reopening the page shows the truth, exactly like the sound trim.
   */
  initialClipStartMs?: number | null;
  initialClipEndMs?: number | null;
  /**
   * Reports the stored pair after every successful apply/remove, so the page can
   * keep one source of truth for both media slots. Without it the appearance
   * form keeps the URL it mounted with and a later "Save" writes that stale
   * value straight back over the background chosen here.
   */
  onApplied?: (data: ActionResult["data"]) => void;
};

/**
 * One tile in the "your uploads" grid. Branches on the MEDIA KIND, never on a
 * failure flag, so a video whose frame fails to decode can never fall through to
 * an <img src="…/*.mp4"> (which paints a broken-image glyph — worse than black).
 * A video only attaches its src once it scrolls near the viewport: a full grid of
 * ~24 clips would otherwise each fetch+decode a keyframe on open (and a
 * non-faststart mp4 forces a read of the file tail to find the moov atom).
 */
function MediaTile({
  url,
  alt,
  failed,
  onFail,
  noPreviewLabel,
}: {
  url: string;
  alt: string;
  failed: boolean;
  onFail: () => void;
  noPreviewLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const video = isVideoSrc(url);

  useEffect(() => {
    if (!video || inView) return;
    const node = wrapRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setInView(true); // no observer support — load eagerly rather than stay blank
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px 0px", threshold: 0 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [video, inView]);

  if (!video) {
    return (
      <div ref={wrapRef} className="h-full w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      </div>
    );
  }

  if (failed) {
    return (
      <div
        ref={wrapRef}
        className="flex h-full w-full items-center justify-center bg-nearblack"
      >
        <span className="rounded-pill bg-white/5 px-2 py-0.5 text-[11px] text-mutedtext/60 ring-1 ring-white/10">
          {noPreviewLabel}
        </span>
      </div>
    );
  }

  if (!inView) {
    // Off-screen: reserve the box, touch no bytes until it nears the viewport.
    return <div ref={wrapRef} className="h-full w-full bg-nearblack" />;
  }

  return (
    <div ref={wrapRef} className="h-full w-full">
      <video
        className="h-full w-full object-cover"
        src={firstFrameSrc(url)}
        muted
        playsInline
        preload="metadata"
        onError={onFail}
      />
    </div>
  );
}

export default function CustomTemplateCard({
  eligibility,
  currentBannerUrl,
  assets,
  maxMb,
  initialClipStartMs,
  initialClipEndMs,
  onApplied,
}: CustomTemplateCardProps) {
  const t = useTranslations("templates");
  const quotaMsg = useQuotaMessage();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Real pixels of the applied background, measured in the browser (the app
  // never re-encodes, so these are exactly what visitors see).
  const [dims, setDims] = useState<Dims | null>(null);
  // Same, for the file picked in the input but not uploaded yet.
  const [pending, setPending] = useState<Dims | null>(null);
  // Per-asset sizes, measured lazily (hover/focus) instead of 12 parallel loads.
  const [tileDims, setTileDims] = useState<Record<string, Dims>>({});
  const [measuringId, setMeasuringId] = useState<string | null>(null);
  // Tiles whose <video> failed to decode a frame; they fall back to an <img> so a
  // broken clip degrades visibly instead of as a black box.
  const [tileFailed, setTileFailed] = useState<Record<string, boolean>>({});

  const { ref: previewRef, keepPlayingProps } = useKeepPlaying<HTMLVideoElement>();

  // Background-video clip trim, in local seconds (the UI unit); ms only crosses to
  // the server. Mirrors SoundCard's trim exactly: each bound can stand alone, and
  // an empty box means "open-ended". Seeded from the stored range so reopening the
  // page shows the truth, and reseeded whenever the applied background changes.
  const S = 1000;
  const seed = (v: number | null | undefined) =>
    v != null ? (v / S).toFixed(1) : "";
  const [clipStartSec, setClipStartSec] = useState<string>(seed(initialClipStartMs));
  const [clipEndSec, setClipEndSec] = useState<string>(seed(initialClipEndMs));
  const [clipDuration, setClipDuration] = useState<number | null>(null);
  const [savingClip, setSavingClip] = useState(false);
  const isClipVideo = !!currentBannerUrl && isVideoSrc(currentBannerUrl);

  useEffect(() => {
    setClipStartSec(seed(initialClipStartMs));
    setClipEndSec(seed(initialClipEndMs));
    setClipDuration(null);
  }, [currentBannerUrl, initialClipStartMs, initialClipEndMs]);

  function toClipMs(v: string): number | null {
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * S) : null;
  }

  async function onApplyClip() {
    setSavingClip(true);
    setError(null);
    try {
      const startMs = toClipMs(clipStartSec);
      let endMs = toClipMs(clipEndSec);
      // Never persist an end past the length the browser actually measured.
      if (
        endMs != null &&
        clipDuration != null &&
        endMs > Math.round(clipDuration * S)
      ) {
        endMs = Math.round(clipDuration * S);
      }
      const res = await updateBackgroundClip(startMs, endMs);
      if (!res.ok) setError(messageFor(res));
      else {
        onApplied?.(res.data);
        router.refresh();
      }
    } finally {
      setSavingClip(false);
    }
  }

  async function onResetClip() {
    setSavingClip(true);
    setError(null);
    try {
      const res = await updateBackgroundClip(null, null);
      if (!res.ok) setError(messageFor(res));
      else {
        setClipStartSec("");
        setClipEndSec("");
        onApplied?.(res.data);
        router.refresh();
      }
    } finally {
      setSavingClip(false);
    }
  }

  // Real pixels of the applied background. The preview is server-rendered, so
  // loadedmetadata can fire before React attaches its handler: read whatever the
  // element already knows and let onLoadedMetadata cover the late case. Images
  // and GIFs are painted as CSS backgrounds, so they need a separate decode.
  useEffect(() => {
    setDims(null);
    if (!currentBannerUrl) return;
    if (isVideoSrc(currentBannerUrl)) {
      const v = previewRef.current;
      if (v && v.readyState >= 1) setDims({ w: v.videoWidth, h: v.videoHeight });
      return;
    }
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = currentBannerUrl;
    return () => {
      img.onload = null;
    };
  }, [currentBannerUrl, previewRef]);

  const allowed = eligibility.allowed;
  const isCustomActive = !!currentBannerUrl && currentBannerUrl.startsWith("/api/media/");

  function onTileInspect(id: string, url: string) {
    if (tileDims[id] || measuringId === id) return;
    setMeasuringId(id);
    void measureAsset(url).then((d) => {
      setMeasuringId((cur) => (cur === id ? null : cur));
      if (d) setTileDims((prev) => ({ ...prev, [id]: d }));
    });
  }

  // Map a server ActionResult code onto a localized message.
  function messageFor(res: ActionResult): string {
    switch (res.error) {
      case "locked":
        return t("custom.errors.locked");
      case "unsupported":
        return t("custom.errors.unsupported");
      case "missing":
        return t("custom.errors.missing");
      case "unauthorized":
        return t("custom.errors.unauthorized");
      case "badmedia":
      case "invalid":
      default:
        return t("custom.errors.invalid");
    }
  }

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError(t("custom.noFile"));
      return;
    }

    setBusy(true);
    setError(null);
    setPending(null);
    try {
      // The file itself goes through the API route (no server-action body cap),
      // then the lightweight action validates age/ownership/mime and applies it.
      const fd = new FormData();
      fd.set("file", file);
      // Declares the slot so /api/upload can refuse a file that could never be a
      // background before it writes any bytes — the same predicate
      // applyBackgroundFromFile enforces.
      fd.set("kind", "background");
      const uploaded = await fetch("/api/upload", { method: "POST", body: fd });
      if (!uploaded.ok) {
        setError(
          uploaded.status === 413
            ? t("custom.errors.tooLarge", { mb: maxMb })
            : uploaded.status === 415
              ? t("custom.errors.unsupported")
              : uploaded.status === 507
                ? quotaMsg
                : t("custom.errors.upload")
        );
        return;
      }

      const { id } = (await uploaded.json()) as { id?: string };
      if (!id) {
        setError(t("custom.errors.upload"));
        return;
      }

      const res = await applyBackgroundFromFile(id);
      if (!res.ok) {
        setError(messageFor(res));
        return;
      }
      onApplied?.(res.data);
      form.reset();
      router.refresh();
    } catch {
      setError(t("custom.errors.upload"));
    } finally {
      setBusy(false);
    }
  }

  async function onUse(id: string) {
    setBusyId(id);
    setError(null);
    const res = await applyBackgroundFromFile(id);
    setBusyId(null);
    if (!res.ok) setError(messageFor(res));
    else {
      onApplied?.(res.data);
      router.refresh();
    }
  }

  async function onRemove() {
    setRemoving(true);
    setError(null);
    const res = await clearCustomBackground();
    setRemoving(false);
    if (!res.ok) setError(messageFor(res));
    else {
      onApplied?.(res.data);
      router.refresh();
    }
  }

  return (
    <GlassCard className="mb-8 p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-softwhite">{t("custom.title")}</h2>
        <p className="text-sm text-mutedtext/70">{t("custom.subtitle")}</p>
      </div>

      {/* Live preview of the currently applied background */}
      <div className="relative mb-4 h-40 w-full overflow-hidden rounded-card border border-white/10 bg-nearblack">
        {currentBannerUrl && isVideoSrc(currentBannerUrl) ? (
          <video
            className="h-full w-full object-cover"
            src={currentBannerUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            {...keepPlayingProps}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              setDims({ w: v.videoWidth, h: v.videoHeight });
              if (Number.isFinite(v.duration) && v.duration > 0) {
                setClipDuration(v.duration);
              }
              const s = parseFloat(clipStartSec);
              if (Number.isFinite(s) && s > 0) {
                try {
                  v.currentTime = s;
                } catch {
                  // Not seekable yet; playback still begins near the top.
                }
              }
            }}
            onTimeUpdate={(e) => {
              // Audition the loop so Apply is WYSIWYG: wrap at the clip end.
              const v = e.currentTarget;
              const en = parseFloat(clipEndSec);
              if (Number.isFinite(en) && en > 0 && v.currentTime >= en) {
                const s = parseFloat(clipStartSec);
                v.currentTime = Number.isFinite(s) && s > 0 ? s : 0;
              }
            }}
          />
        ) : currentBannerUrl ? (
          <div
            className="h-full w-full bg-cover bg-center"
            style={{ backgroundImage: `url(${currentBannerUrl})` }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-brandgrad [background-size:300%_300%] animate-gradient-pan">
            <span className="rounded-pill bg-nearblack/50 px-3 py-1 text-xs text-softwhite backdrop-blur">
              {t("custom.presetActive")}
            </span>
          </div>
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-nearblack/20 to-nearblack/50"
        />
        {/* The true pixels of the applied file: what you upload is what visitors see. */}
        {currentBannerUrl && (
          <span
            className={`absolute right-2 top-2 rounded-pill px-2 py-0.5 text-[11px] font-semibold backdrop-blur ${
              dims && dims.h >= UHD_HEIGHT
                ? "bg-brandgrad text-white shadow-glow"
                : "bg-nearblack/60 text-softwhite"
            }`}
          >
            {dims
              ? `${dims.w}×${dims.h}${dims.h >= UHD_HEIGHT ? ` · ${t("custom.badge4k")}` : ""}`
              : t("custom.measuring")}
          </span>
        )}
      </div>

      {dims && dims.h < UHD_HEIGHT && (
        <div className="-mt-2 mb-4 text-xs text-amber-200/80">
          {t("custom.belowUhd", { h: dims.h })}
        </div>
      )}

      {/* Clip trim: pick which seconds of the applied background video loop. Only
          shows for a video (a GIF/still loops on its own). The preview above plays
          exactly this window, so Apply is what-you-see-is-what-you-get. */}
      {isClipVideo && (
        <div className="mb-4 rounded-card border border-white/10 bg-white/[0.02] p-3">
          <p className="text-sm font-medium text-softwhite">{t("custom.clip.title")}</p>
          <p className="mt-0.5 text-xs text-mutedtext/60">
            {t("custom.clip.hint")}
            {clipDuration ? ` · ${clipDuration.toFixed(1)}s` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="flex w-28 flex-col gap-1 text-xs text-mutedtext">
              {t("custom.clip.start")}
              <input
                type="number"
                min={0}
                max={86400}
                step={0.1}
                value={clipStartSec}
                onChange={(e) => setClipStartSec(e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </label>
            <label className="flex w-28 flex-col gap-1 text-xs text-mutedtext">
              {t("custom.clip.end")}
              <input
                type="number"
                min={0}
                max={86400}
                step={0.1}
                value={clipEndSec}
                onChange={(e) => setClipEndSec(e.target.value)}
                placeholder={clipDuration ? clipDuration.toFixed(1) : ""}
                className={inputCls}
              />
            </label>
            <button
              type="button"
              onClick={onApplyClip}
              disabled={savingClip}
              className={btnPrimary}
            >
              {savingClip ? t("custom.clip.applying") : t("custom.clip.apply")}
            </button>
            <button
              type="button"
              onClick={onResetClip}
              disabled={savingClip}
              className={btnGhost}
            >
              {t("custom.clip.reset")}
            </button>
          </div>
        </div>
      )}

      {allowed ? (
        <form onSubmit={onUpload} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            ref={inputRef}
            type="file"
            name="file"
            accept="video/mp4,video/webm,video/quicktime,image/gif,image/webp"
            className={`${fileInputCls} min-w-0 flex-1`}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              setPending(null);
              if (!file) return;
              // Measured locally, before the bytes go anywhere; a failure here
              // must never stop the upload itself.
              void measureFile(file).then((d) => {
                if (d) setPending(d);
              });
            }}
          />
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? t("custom.uploading") : t("custom.upload")}
          </button>
          {isCustomActive && (
            <button type="button" onClick={onRemove} disabled={removing} className={btnGhost}>
              {removing ? t("custom.removing") : t("custom.remove")}
            </button>
          )}
        </form>
      ) : (
        <div className="flex items-start gap-3 rounded-card border border-white/10 bg-white/[0.02] px-4 py-3">
          <LockIcon />
          <p className="text-sm text-mutedtext">
            {t("custom.locked")}{" "}
            <span className="text-softwhite">
              {t("custom.daysLeft", { days: eligibility.daysLeft })}
            </span>
          </p>
        </div>
      )}

      {allowed && pending && (
        <div className="mt-2 text-xs text-softwhite">
          {t("custom.selectHint", { w: pending.w, h: pending.h })}
          {pending.h < UHD_HEIGHT && (
            <div className="mt-1 text-amber-200/80">
              {t("custom.belowUhd", { h: pending.h })}
            </div>
          )}
        </div>
      )}

      <p className="mt-2 text-xs text-mutedtext/60">
        {t("custom.hint", { mb: maxMb })}
      </p>
      <p className="mt-1 text-xs text-mutedtext/60">{t("custom.noReencode")}</p>

      {error && (
        <p role="status" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* Previously uploaded media, one click to reuse as a background */}
      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-mutedtext/70">
          {t("custom.myFiles")}
        </h3>
        {assets.length === 0 ? (
          <p className="text-sm text-mutedtext/70">{t("custom.empty")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {assets.map((a) => {
              const inUse = currentBannerUrl === a.url;
              return (
                <li
                  key={a.id}
                  onMouseEnter={() => onTileInspect(a.id, a.url)}
                  onFocus={() => onTileInspect(a.id, a.url)}
                  className="min-w-0 overflow-hidden rounded-card border border-white/10 bg-white/[0.02] transition-colors hover:border-plumborder"
                >
                  <div className="relative aspect-[4/3] w-full bg-nearblack">
                    <MediaTile
                      url={a.url}
                      alt={a.name}
                      failed={!!tileFailed[a.id]}
                      onFail={() => setTileFailed((m) => ({ ...m, [a.id]: true }))}
                      noPreviewLabel={t("custom.noPreview")}
                    />
                    {inUse && (
                      <span className="absolute left-2 top-2 rounded-pill bg-brandgrad px-2 py-0.5 text-[11px] font-semibold text-white shadow-glow">
                        {t("custom.inUse")}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 p-3">
                    <p className="truncate text-sm text-softwhite" title={a.name}>{a.name}</p>
                    <p className="block truncate text-xs text-mutedtext/60">
                      {formatBytes(a.size)}
                      {tileDims[a.id] ? (
                        <>
                          {" · "}
                          {`${tileDims[a.id].w}×${tileDims[a.id].h}`}
                          {tileDims[a.id].h >= UHD_HEIGHT
                            ? ` ${t("custom.badge4k")}`
                            : ""}
                        </>
                      ) : null}
                      {!tileDims[a.id] && measuringId === a.id
                        ? ` · ${t("custom.measuring")}`
                        : null}
                    </p>
                    <button
                      type="button"
                      disabled={busyId === a.id || inUse}
                      onClick={() => onUse(a.id)}
                      className={`${btnGhost} mt-2 w-full min-w-0 justify-center px-2 text-xs whitespace-nowrap`}
                    >
                      {inUse
                        ? t("custom.inUse")
                        : busyId === a.id
                          ? t("custom.applying")
                          : t("custom.useAsBackground")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </GlassCard>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mt-0.5 h-4 w-4 shrink-0 text-plumborder"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
