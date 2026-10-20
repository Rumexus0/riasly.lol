"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  applyAvatarFromFile,
  clearAvatar,
  type ActionResult,
} from "@/app/actions/profile";
import type { CustomBackgroundAsset } from "@/components/dashboard/CustomTemplateCard";
import AvatarMedia from "@/components/ui/AvatarMedia";
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
 * The avatar slot: upload a picture/GIF/clip, or reuse something already on the
 * account. Separate from the background card on purpose — the two are different
 * things and picking one must never silently replace the other.
 *
 * No age gate and no resolution measuring here: an avatar is 112px, so the only
 * thing worth telling the user is when a file is too big or the wrong type.
 */
export default function AvatarCard({
  avatar,
  assets,
  maxMb,
  onMedia,
}: {
  /** Currently stored avatar URL ("" when the circle falls back to the initial). */
  avatar: string;
  assets: CustomBackgroundAsset[];
  /** Avatar-specific ceiling, much lower than the background one. */
  maxMb: number;
  /** Receives the full stored pair so the page keeps one source of truth. */
  onMedia: (data: ActionResult["data"]) => void;
}) {
  const t = useTranslations("dashboard.avatarCard");
  const quotaMsg = useQuotaMessage();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { fb, report } = useFeedback();

  // Map a server ActionResult code onto a localized message.
  function messageFor(res: ActionResult): string {
    switch (res.error) {
      case "unsupported":
        return t("errors.unsupported");
      case "missing":
        return t("errors.missing");
      case "unauthorized":
        return t("errors.unauthorized");
      case "badmedia":
      case "locked":
      case "forbidden":
      case "invalid":
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
    // Checked before a single byte leaves the browser: the server would answer
    // with a generic "invalid", and the file never needed uploading anyway.
    if (file.size > maxMb * 1024 * 1024) {
      setError(t("errors.tooLarge", { mb: maxMb }));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Same two-step as the background card: bytes go to /api/upload (API
      // routes have no body cap), the action validates and applies.
      const fd = new FormData();
      fd.set("file", file);
      // Declares the slot so /api/upload can refuse a wrong-type file before it
      // writes any bytes — the same predicate applyAvatarFromFile enforces.
      fd.set("kind", "avatar");
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

      handle(await applyAvatarFromFile(id));
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
    handle(await applyAvatarFromFile(id));
    setBusyId(null);
    router.refresh();
  }

  async function onRemove() {
    setRemoving(true);
    setError(null);
    handle(await clearAvatar());
    setRemoving(false);
    router.refresh();
  }

  return (
    <GlassCard className="p-6">
      <CardTitle>{t("title")}</CardTitle>
      <p className="-mt-2 mb-4 text-sm text-mutedtext/70">{t("subtitle")}</p>

      <div className="mb-4 flex items-center gap-4">
        <span className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-white/10 bg-white/5 ring-1 ring-white/10">
          <AvatarMedia
            src={avatar}
            fallback={
              <span className="flex h-full w-full items-center justify-center text-plumborder">
                {t("previewFallback")}
              </span>
            }
          />
        </span>
        <p className="text-xs text-mutedtext/60">{t("hint", { mb: maxMb })}</p>
      </div>

      <form onSubmit={onUpload} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
          className={fileInputCls}
        />
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? t("uploading") : t("upload")}
        </button>
        {avatar && (
          <button type="button" onClick={onRemove} disabled={removing} className={btnGhost}>
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
          {/* 3 columns on a phone: the fixed-size circles need the room and still
              leave the strip scannable, without touching the desktop layout. */}
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {assets.map((a) => {
              const inUse = avatar === a.url;
              return (
                <li key={a.id} className="flex flex-col items-center gap-2">
                  <span className="relative h-16 w-16 overflow-hidden rounded-full border border-white/10 bg-nearblack">
                    <AvatarMedia src={a.url} fallback={null} />
                    {inUse && (
                      <span className="absolute inset-x-0 bottom-0 rounded-pill bg-brandgrad px-1 py-0.5 text-center text-[10px] font-semibold text-white">
                        {t("inUse")}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={busyId === a.id || inUse}
                    onClick={() => onUse(a.id)}
                    className={`${btnGhost} w-full !px-2 !text-[11px]`}
                  >
                    {busyId === a.id
                      ? t("applying")
                      : inUse
                        ? t("inUse")
                        : t("useAsAvatar")}
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
