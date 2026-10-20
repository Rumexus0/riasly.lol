"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  createCatalogTemplate,
  type CatalogResult,
} from "@/app/actions/catalog";
import { inputCls, btnPrimary, fileInputCls, FeedbackLine, type Feedback } from "@/components/dashboard/form-kit";

// Two-step intake that mirrors CustomTemplateCard: the bytes go to
// /api/catalog-upload (an API route, so a 4K source isn't capped by a server
// action's body limit), then the lightweight action validates the fields, writes
// the RENDERING row and detaches the encoder. This card never claims a render is
// done — the gallery's poll owns that.
export default function CatalogUploadCard({
  categories,
  maxMb,
}: {
  categories: string[];
  maxMb: number;
}) {
  const t = useTranslations("templates");
  const router = useRouter();
  // Forward values so {mb}-style placeholders resolve; the second arg is the
  // next-intl message values object.
  const ta = (key: string, values?: Record<string, string | number>) =>
    t(`admin.${key}`, values);
  const inputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [fb, setFb] = useState<Feedback>(null);

  // The action's codes are about a render pipeline, so they read from
  // templates.admin.* rather than the shared dashboard.errors set.
  function messageFor(res: CatalogResult): string {
    switch (res.error) {
      case "forbidden":
        return ta("forbidden");
      case "busy":
        return ta("busy");
      case "unsupported":
        return ta("unsupported");
      case "missing":
        return ta("noFile");
      case "unauthorized":
        return ta("forbidden");
      case "invalid":
      default:
        return ta("invalid");
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setFb({ kind: "err", msg: ta("noFile") });
      return;
    }

    setBusy(true);
    setFb(null);
    try {
      const up = new FormData();
      up.set("file", file);
      const uploaded = await fetch("/api/catalog-upload", { method: "POST", body: up });
      if (!uploaded.ok) {
        setFb({
          kind: "err",
          msg:
            uploaded.status === 413
              ? ta("tooLarge", { mb: maxMb })
              : uploaded.status === 415
                ? ta("unsupported")
                : ta("uploadError"),
        });
        return;
      }
      const { id } = (await uploaded.json()) as { id?: string };
      if (!id) {
        setFb({ kind: "err", msg: ta("uploadError") });
        return;
      }

      // Carry the form fields plus the server-issued id; the action re-derives
      // every file fact (bytes, mime) from the staged file, never from here.
      const fd = new FormData(form);
      fd.set("id", id);
      const res = await createCatalogTemplate(fd);
      if (!res.ok) {
        setFb({ kind: "err", msg: messageFor(res) });
        return;
      }
      form.reset();
      setFb({ kind: "ok", msg: ta("added") });
      // Pull the new RENDERING row into the pending list; the gallery's poll then
      // drives it to READY without re-running this page on a timer.
      router.refresh();
    } catch {
      setFb({ kind: "err", msg: ta("uploadError") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-6 rounded-card border border-plumborder/40 bg-white/[0.02] p-5"
    >
      <h2 className="mb-1 text-base font-bold text-softwhite">{ta("title")}</h2>
      <p className="mb-4 text-xs text-mutedtext/60">{ta("hint", { mb: maxMb })}</p>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-widest text-mutedtext/60">{ta("file")}</span>
          <input
            ref={inputRef}
            type="file"
            name="file"
            accept="video/mp4,video/webm,video/quicktime,image/gif,image/webp,image/png,image/jpeg"
            className={fileInputCls}
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-widest text-mutedtext/60">{ta("name")}</span>
            <input name="name" required maxLength={60} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-widest text-mutedtext/60">{ta("category")}</span>
            <select name="category" required className={inputCls} defaultValue={categories[0]}>
              {categories.map((c) => (
                <option key={c} value={c} className="bg-nearblack">
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-widest text-mutedtext/60">{ta("author")}</span>
            <input name="author" maxLength={40} className={inputCls} placeholder="@handle" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-widest text-mutedtext/60">{ta("tags")}</span>
            <input name="tags" maxLength={200} className={inputCls} placeholder="a, b, c" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-widest text-mutedtext/60">{ta("accent")}</span>
            <input name="accent" className={inputCls} placeholder="#8B5CF6" />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? ta("submitting") : ta("submit")}
          </button>
          <FeedbackLine fb={fb} />
        </div>
      </div>
    </form>
  );
}
