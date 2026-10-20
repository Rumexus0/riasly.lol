"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { deleteFile } from "@/app/actions/profile";
import { formatBytes } from "@/lib/format";
import GlassCard from "@/components/ui/GlassCard";
import Reveal from "@/components/motion/Reveal";
import {
  CardTitle,
  FeedbackLine,
  PageHeading,
  btnDanger,
  btnPrimary,
  useFeedback,
} from "@/components/dashboard/form-kit";

type FileItem = {
  id: string;
  name: string;
  size: number;
  mime: string;
  isPrivate: boolean;
  downloadCount: number;
};

/**
 * File hosting on its own page. The upload markup is the form that used to sit
 * on the overview; only the location changed.
 */
export default function FilesClient({ files }: { files: FileItem[] }) {
  const t = useTranslations("dashboard");
  const tp = useTranslations("dashboard.filesPage");
  const router = useRouter();
  const refresh = () => router.refresh();

  const [busy, setBusy] = useState(false);
  const { fb, report } = useFeedback();

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: new FormData(form),
      });
      // 507 is the one failure the generic "check the fields" text would hide: the
      // file is fine, the account is full (see lib/storage.ts).
      report(
        res.ok
          ? { ok: true }
          : { ok: false, error: res.status === 507 ? "quota" : "invalid" }
      );
      if (res.ok) form.reset();
    } catch {
      report({ ok: false, error: "invalid" });
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function onDelete(id: string) {
    report(await deleteFile(id));
    refresh();
  }

  return (
    <main>
      <PageHeading title={tp("title")} subtitle={tp("subtitle")} />

      <Reveal>
        <GlassCard className="p-6">
          <CardTitle>{t("sections.files")}</CardTitle>
          <form
            onSubmit={onUpload}
            className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <input
              type="file"
              name="file"
              required
              className="block w-full text-sm text-mutedtext file:mr-3 file:rounded-pill file:border-0 file:bg-plum file:px-4 file:py-2 file:text-softwhite"
            />
            <label className="flex shrink-0 items-center gap-2 text-sm text-mutedtext">
              <input type="checkbox" name="isPrivate" className="accent-plumborder" />
              {t("fields.private")}
            </label>
            <button type="submit" disabled={busy} className={btnPrimary}>
              {busy ? t("actions.saving") : t("actions.upload")}
            </button>
          </form>
          <ul className="space-y-2">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between rounded-card border border-white/5 bg-white/[0.02] px-4 py-2.5"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-softwhite">{f.name}</span>
                  <span className="text-xs text-mutedtext/70">
                    {formatBytes(f.size)} ·{" "}
                    {f.isPrivate ? t("fields.private") : `${f.downloadCount} ↓`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <a
                    href={`/api/files/${f.id}`}
                    className="text-sm text-plumborder transition-colors hover:text-softwhite"
                  >
                    ↓
                  </a>
                  <button onClick={() => onDelete(f.id)} className={btnDanger}>
                    {t("actions.delete")}
                  </button>
                </span>
              </li>
            ))}
            {files.length === 0 && (
              <li className="text-sm text-mutedtext/70">{t("empty.files")}</li>
            )}
          </ul>
          <FeedbackLine fb={fb} />
        </GlassCard>
      </Reveal>
    </main>
  );
}
