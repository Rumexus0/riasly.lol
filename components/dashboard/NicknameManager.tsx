"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { saveNicknames } from "@/app/actions/account";
import { btnGhost, btnPrimary } from "@/components/dashboard/form-kit";

/**
 * Nickname manager, opened from the Account page's "Genel Bilgiler" band.
 *
 * Mirrors EffectPickerModal's dialog mechanics (backdrop click + Esc close, focus
 * pulled in on open and handed back on close) so the dashboard has one consistent
 * modal vocabulary. The list is edited locally and only committed on Save, which
 * serialises the rows back into the single comma-separated `nicknames` column that
 * `saveNicknames` already owns — so the manager and the old inline textarea share
 * exactly one writer and one storage format.
 */
const NICK_MAX = 6;
const NICK_LEN = 24;

export default function NicknameManager({
  open,
  initial,
  onClose,
}: {
  open: boolean;
  /** The stored comma-separated list, split into rows on open. */
  initial: string;
  onClose: () => void;
}) {
  const t = useTranslations("dashboard.accountPage.nicknameManager");
  const router = useRouter();
  const [rows, setRows] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Re-seed the editable rows from the stored value every time the modal opens.
  useEffect(() => {
    if (!open) return;
    const list = initial
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setRows(list.length ? list : [""]);
    setMsg(null);
  }, [open, initial]);

  // Pull focus in on open, hand it back on close.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => restoreRef.current?.focus?.();
  }, [open]);

  // Esc closes, only while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const full = rows.length >= NICK_MAX;

  function setRow(i: number, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? value.slice(0, NICK_LEN) : r)));
  }
  function addRow() {
    setRows((prev) => (prev.length >= NICK_MAX ? prev : [...prev, ""]));
  }
  function removeRow(i: number) {
    setRows((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      return next.length ? next : [""];
    });
  }

  function commit() {
    setMsg(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("nicknames", rows.map((r) => r.trim()).join(","));
      const res = await saveNicknames(fd);
      if (res.ok) {
        setMsg({ kind: "ok", text: t("saved") });
        router.refresh();
        onClose();
      } else {
        setMsg({ kind: "err", text: t("saveError") });
      }
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-card border border-white/10 bg-nearblack/95 shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <h2 className="text-base font-bold text-softwhite">{t("title")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="grid h-9 w-9 place-items-center rounded-micro text-mutedtext transition-colors hover:text-softwhite"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto p-5">
          <p className="text-xs text-mutedtext/70">
            {t("hint", { max: NICK_MAX, len: NICK_LEN })}
          </p>
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={r}
                maxLength={NICK_LEN}
                onChange={(e) => setRow(i, e.target.value)}
                placeholder={t("rowPlaceholder")}
                className="h-11 w-full rounded-field border border-white/10 bg-white/[0.02] px-3 text-softwhite placeholder:text-mutedtext/40 transition focus:border-plumborder focus:shadow-glow focus:outline-none"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                aria-label={t("remove")}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-micro text-mutedtext transition-colors hover:text-red-300"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addRow}
            disabled={full}
            className={`${btnGhost} mt-1 self-start`}
          >
            {t("add")}
          </button>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-white/10 px-5 py-4">
          {msg && (
            <span
              role="status"
              className={`mr-auto text-sm ${msg.kind === "ok" ? "text-plumborder" : "text-red-300"}`}
            >
              {msg.text}
            </span>
          )}
          <button type="button" onClick={onClose} className={btnGhost}>
            {t("cancel")}
          </button>
          <button type="button" onClick={commit} disabled={pending} className={btnPrimary}>
            {pending ? t("saving") : t("save")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6" />
    </svg>
  );
}
