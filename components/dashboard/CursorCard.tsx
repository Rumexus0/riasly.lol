"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  applyCursorFromFile,
  clearCursor,
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
  useFeedback,
  useQuotaMessage,
} from "@/components/dashboard/form-kit";

/**
 * The custom-cursor slot: a PNG that ProfileStage paints as the profile's CSS
 * cursor. Same two-step upload as the avatar (bytes to /api/upload, then this
 * action applies the file to the cursorUrl slot), kept in its own card so
 * choosing a cursor can never disturb the avatar or the background.
 */
export default function CursorCard({
  cursor,
  assets,
  maxMb,
  onMedia,
}: {
  /** Currently stored cursor PNG URL ("" when none). */
  cursor: string;
  /** The account's PNG uploads — the only files a cursor can be. */
  assets: CustomBackgroundAsset[];
  /** Size ceiling, mirrored from the server's avatar cap. */
  maxMb: number;
  /** Receives the full stored set so the page keeps one source of truth. */
  onMedia: (data: ActionResult["data"]) => void;
}) {
  const t = useTranslations("dashboard.customizePage.cursor");
  const quotaMsg = useQuotaMessage();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { fb, report } = useFeedback();

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
      // Declares the slot so /api/upload can refuse a non-PNG before it writes any
      // bytes — the same predicate applyCursorFromFile enforces.
      fd.set("kind", "cursor");
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
      handle(await applyCursorFromFile(id));
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
    handle(await applyCursorFromFile(id));
    setBusyId(null);
    router.refresh();
  }

  async function onRemove() {
    setRemoving(true);
    setError(null);
    handle(await clearCursor());
    setRemoving(false);
    router.refresh();
  }

  return (
    <GlassCard className="p-6">
      <CardTitle>{t("title")}</CardTitle>
      <p className="-mt-2 mb-4 text-sm text-mutedtext/70">{t("subtitle")}</p>

      <div className="mb-4 flex items-center gap-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-card border border-white/10 bg-white/[0.02]">
          {cursor ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cursor} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-mutedtext/50">{t("previewFallback")}</span>
          )}
        </span>
        <p className="text-xs text-mutedtext/60">{t("hint", { mb: maxMb })}</p>
      </div>

      <form
        onSubmit={onUpload}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept="image/png"
          className={fileInputCls}
        />
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? t("uploading") : t("upload")}
        </button>
        {cursor && (
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
          <ul className="grid grid-cols-4 gap-3 sm:grid-cols-6">
            {assets.map((a) => {
              const inUse = cursor === a.url;
              return (
                <li key={a.id} className="flex flex-col items-center gap-2">
                  <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-micro border border-white/10 bg-nearblack p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt="" className="max-h-full max-w-full object-contain" />
                  </span>
                  <button
                    type="button"
                    disabled={busyId === a.id || inUse}
                    onClick={() => onUse(a.id)}
                    className={`${btnGhost} w-full !px-2 !text-[11px]`}
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
