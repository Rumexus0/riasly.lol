"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  applySoundFromFile,
  clearSound,
  updateSoundRange,
  type ActionResult,
} from "@/app/actions/profile";
import type { CustomBackgroundAsset } from "@/components/dashboard/CustomTemplateCard";
import GlassCard from "@/components/ui/GlassCard";
import {
  CardTitle,
  FeedbackLine,
  btnGhost,
  btnPrimary,
  fileInputCls,
  inputCls,
  useFeedback,
  useQuotaMessage,
} from "@/components/dashboard/form-kit";

/**
 * The background-music slot. The owner uploads an audio file (or reuses one
 * already on the account); once the visitor enters the profile it starts playing
 * on its own — the enter-click is the gesture that unlocks audio (see SoundToggle)
 * — and the speaker button only mutes/unmutes afterwards. Storing a sound does not
 * by itself turn it on — the "sound control" toggle in the style form is a separate
 * opt-in, so an upload and an accidental public autoplay can never coincide.
 */
export default function SoundCard({
  sound,
  assets,
  maxMb,
  initialStartMs,
  initialEndMs,
  onMedia,
}: {
  /** Currently stored sound URL ("" when none). */
  sound: string;
  /** The account's audio uploads — the only files a track can be. */
  assets: CustomBackgroundAsset[];
  /** Size ceiling, mirrored from the server's sound cap. */
  maxMb: number;
  /** Stored trim bounds in ms (null = open-ended), used to seed the inputs. */
  initialStartMs: number | null;
  initialEndMs: number | null;
  /** Receives the full stored set so the page keeps one source of truth. */
  onMedia: (data: ActionResult["data"]) => void;
}) {
  const t = useTranslations("dashboard.customizePage.sound");
  const quotaMsg = useQuotaMessage();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { fb, report } = useFeedback();

  // Trim bounds live as local seconds (the UI unit); ms only crosses to the
  // server. Seeded from the stored range so reopening the page shows the truth.
  const S = 1000;
  const [startSec, setStartSec] = useState<string>(
    initialStartMs != null ? (initialStartMs / S).toFixed(1) : ""
  );
  const [endSec, setEndSec] = useState<string>(
    initialEndMs != null ? (initialEndMs / S).toFixed(1) : ""
  );
  const [duration, setDuration] = useState<number | null>(null);
  const [savingRange, setSavingRange] = useState(false);

  // "" / invalid → null (open-ended); otherwise whole milliseconds.
  function toMs(v: string): number | null {
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * S) : null;
  }

  function messageFor(res: ActionResult): string {
    switch (res.error) {
      case "unsupported":
        return t("errors.unsupported");
      case "missing":
        return t("errors.missing");
      case "unauthorized":
        return t("errors.unauthorized");
      default:
        return t("errors.invalid");
    }
  }

  function handle(res: ActionResult) {
    if (!res.ok) {
      setError(messageFor(res));
      return;
    }
    setError(null);
    report(res);
    onMedia(res.data);
  }

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError(t("noFile"));
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      setError(t("errors.tooLarge", { mb: maxMb }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      // Declares the slot so /api/upload can refuse a non-audio file before it writes
      // any bytes — the same predicate applySoundFromFile enforces.
      fd.set("kind", "sound");
      const uploaded = await fetch("/api/upload", { method: "POST", body: fd });
      if (!uploaded.ok) {
        setError(
          uploaded.status === 413
            ? t("errors.tooLarge", { mb: maxMb })
            : uploaded.status === 415
              ? t("errors.unsupported")
              : uploaded.status === 507
                ? quotaMsg
                : t("errors.upload")
        );
        return;
      }
      const { id } = (await uploaded.json()) as { id?: string };
      if (!id) {
        setError(t("errors.upload"));
        return;
      }
      handle(await applySoundFromFile(id));
      // The trim belonged to the previous track; the server reset it, so mirror
      // that here instead of leaving stale seconds in the inputs.
      setStartSec("");
      setEndSec("");
      setDuration(null);
      form.reset();
      router.refresh();
    } catch {
      setError(t("errors.upload"));
    } finally {
      setBusy(false);
    }
  }

  async function onUse(id: string) {
    setBusyId(id);
    setError(null);
    handle(await applySoundFromFile(id));
    setStartSec("");
    setEndSec("");
    setDuration(null);
    setBusyId(null);
    router.refresh();
  }

  async function onRemove() {
    setRemoving(true);
    setError(null);
    handle(await clearSound());
    setRemoving(false);
    router.refresh();
  }

  async function onApplyRange() {
    setSavingRange(true);
    setError(null);
    try {
      const startMs = toMs(startSec);
      let endMs = toMs(endSec);
      // Never persist an end past the length the browser actually measured.
      if (endMs != null && duration != null && endMs > Math.round(duration * S)) {
        endMs = Math.round(duration * S);
      }
      handle(await updateSoundRange(startMs, endMs));
    } finally {
      // Guarantees the buttons never stay stuck on "Applying…" if the action
      // throws (a rejected server action surfaces as a thrown await here).
      setSavingRange(false);
    }
    router.refresh();
  }

  async function onResetRange() {
    setSavingRange(true);
    setError(null);
    try {
      handle(await updateSoundRange(null, null));
      setStartSec("");
      setEndSec("");
    } finally {
      setSavingRange(false);
    }
    router.refresh();
  }

  return (
    <GlassCard className="p-6">
      <CardTitle>{t("title")}</CardTitle>
      <p className="-mt-2 mb-4 text-sm text-mutedtext/70">{t("subtitle")}</p>

      <div className="mb-4">
        {sound ? (
          <audio
            controls
            preload="none"
            src={sound}
            className="w-full"
            onLoadedMetadata={(e) => {
              const el = e.currentTarget;
              const d = el.duration;
              if (Number.isFinite(d) && d > 0) setDuration(d);
              // Audition from the trim start so Apply is WYSIWYG.
              const s = parseFloat(startSec);
              if (Number.isFinite(s) && s > 0) {
                try {
                  el.currentTime = s;
                } catch {
                  // Not seekable yet — playback still begins near the top.
                }
              }
            }}
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              const s = parseFloat(startSec);
              const en = parseFloat(endSec);
              if (Number.isFinite(en) && en > 0 && el.currentTime >= en) {
                el.pause();
                el.currentTime = Number.isFinite(s) && s > 0 ? s : 0;
              }
            }}
          />
        ) : (
          <p className="rounded-card border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-mutedtext/60">
            {t("previewFallback")}
          </p>
        )}
        <p className="mt-2 text-xs text-mutedtext/60">{t("hint", { mb: maxMb })}</p>
      </div>

      {sound && (
        <div className="mb-4 rounded-card border border-white/10 bg-white/[0.02] p-3">
          <p className="text-sm font-medium text-softwhite">{t("rangeTitle")}</p>
          <p className="mt-0.5 text-xs text-mutedtext/60">
            {t("rangeHint")}
            {duration ? ` · ${duration.toFixed(1)}s` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="flex w-28 flex-col gap-1 text-xs text-mutedtext">
              {t("rangeStart")}
              <input
                type="number"
                min={0}
                max={86400}
                step={0.1}
                value={startSec}
                onChange={(e) => setStartSec(e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </label>
            <label className="flex w-28 flex-col gap-1 text-xs text-mutedtext">
              {t("rangeEnd")}
              <input
                type="number"
                min={0}
                max={86400}
                step={0.1}
                value={endSec}
                onChange={(e) => setEndSec(e.target.value)}
                placeholder={duration ? duration.toFixed(1) : ""}
                className={inputCls}
              />
            </label>
            <button
              type="button"
              onClick={onApplyRange}
              disabled={savingRange}
              className={btnPrimary}
            >
              {savingRange ? t("applying") : t("rangeApply")}
            </button>
            <button
              type="button"
              onClick={onResetRange}
              disabled={savingRange}
              className={btnGhost}
            >
              {t("rangeReset")}
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={onUpload}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept="audio/*,video/mp4"
          className={fileInputCls}
        />
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? t("uploading") : t("upload")}
        </button>
        {sound && (
          <button
            type="button"
            onClick={onRemove}
            disabled={removing}
            className={btnGhost}
          >
            {removing ? t("removing") : t("remove")}
          </button>
        )}
      </form>

      <div className="mt-4 flex items-center gap-3">
        <FeedbackLine fb={fb} />
        {error && (
          <p role="status" className="text-sm text-red-300">
            {error}
          </p>
        )}
      </div>

      {assets.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-mutedtext/70">
            {t("myFiles")}
          </h3>
          <ul className="space-y-2">
            {assets.map((a) => {
              const inUse = sound === a.url;
              return (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-card border border-white/10 bg-white/[0.02] px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm text-softwhite">
                    {a.name}
                  </span>
                  <button
                    type="button"
                    disabled={busyId === a.id || inUse}
                    onClick={() => onUse(a.id)}
                    className={btnGhost}
                  >
                    {busyId === a.id ? t("applying") : inUse ? t("inUse") : t("use")}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}
