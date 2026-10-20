"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

import { btnGhost, btnPrimary } from "@/components/dashboard/form-kit";

/**
 * A single selectable cell in the effect grid. `preview` is a small, already-
 * animated node the caller builds (a live `.name-*` span for username effects, a
 * compact `EffectLayers` tile for background effects) so this component stays
 * presentation-only and works identically for both pickers.
 */
export type EffectColumn = {
  key: string;
  label: string;
  preview: ReactNode;
};

/**
 * Accessible effect picker dialog. Opens on a trigger button, shows a grid of
 * live previews, and only commits the choice on Save (Cancel/backdrop discard).
 * Focus is pulled in on open and returned to the opener on close; Esc closes.
 * No framer-motion here on purpose — the dashboard is LazyMotion-strict, and a
 * plain CSS-faded dialog is simpler and cannot desync hydration.
 */
export default function EffectPickerModal({
  open,
  title,
  columns,
  currentValue,
  onPick,
  onClose,
  palette,
}: {
  open: boolean;
  title: string;
  columns: EffectColumn[];
  currentValue: string;
  onPick: (key: string) => void;
  onClose: () => void;
  /**
   * Optional panel rendered between the effect grid and the button bar. The
   * username picker passes a colour-palette editor here; the background picker
   * omits it. It edits the parent form's live state (via hidden inputs on the
   * real <form>), so it is intentionally NOT gated by this modal's Save/Cancel.
   */
  palette?: ReactNode;
}) {
  const tp = useTranslations("dashboard.customizePage.effectsPicker");
  // `pending` is the tile the visitor is hovering/selecting inside the modal; it
  // only reaches the form via onPick on Save, so closing without saving is safe.
  const [pending, setPending] = useState(currentValue);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Re-seed the pending choice every time the modal opens.
  useEffect(() => {
    if (open) setPending(currentValue);
  }, [open, currentValue]);

  // Pull focus in on open, hand it back on close.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => restoreRef.current?.focus?.();
  }, [open]);

  /**
   * Ask for every animation while the picker is open.
   *
   * This is a preview tool: on a machine whose OS asks for reduced motion the
   * global clamp freezes every `.name-*` keyframe, so all eleven tiles looked
   * identical and the feature read as unimplemented. `html[data-motion]` is the
   * documented escape hatch (lib/motion-pref.ts) and React never renders that
   * attribute, so writing it here cannot desync hydration. Only the previous
   * value is restored — a visitor who explicitly chose "calm" gets it back.
   */
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const prev = root.dataset.motion ?? null;
    root.dataset.motion = "force";
    return () => {
      if (prev === null) delete root.dataset.motion;
      else root.dataset.motion = prev;
    };
  }, [open]);

  // Esc closes. Attached only while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function commit() {
    onPick(pending);
    onClose();
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
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-card border border-white/10 bg-nearblack/95 shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <h2 className="text-base font-bold text-softwhite">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tp("close")}
            className="grid h-9 w-9 place-items-center rounded-micro text-mutedtext transition-colors hover:text-softwhite"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 grid-cols-2 gap-3 overflow-y-auto p-5 sm:grid-cols-3">
          {columns.map((col) => {
            const selected = col.key === pending;
            return (
              <button
                key={col.key}
                type="button"
                onClick={() => setPending(col.key)}
                aria-pressed={selected}
                className={`flex flex-col items-center gap-2 rounded-card border p-3 text-center transition-all ${
                  selected
                    ? "border-plumborder bg-white/[0.06] ring-2 ring-plumborder/50"
                    : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]"
                }`}
              >
                <span className="flex h-16 w-full items-center justify-center overflow-hidden rounded-micro bg-black/40 px-2 text-lg font-black text-softwhite">
                  {col.preview}
                </span>
                <span className="truncate text-xs text-mutedtext">{col.label}</span>
              </button>
            );
          })}
        </div>

        {palette && (
          <div className="border-t border-white/10 px-5 py-4">{palette}</div>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-white/10 px-5 py-4">
          <button type="button" onClick={onClose} className={btnGhost}>
            {tp("cancel")}
          </button>
          <button type="button" onClick={commit} className={btnPrimary}>
            {tp("save")}
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
