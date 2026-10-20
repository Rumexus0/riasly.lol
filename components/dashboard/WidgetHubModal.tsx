"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  addWidget,
  deleteWidget,
  setWidgetsEnabled,
  updateDiscordStatusWidget,
} from "@/app/actions/widgets";
import {
  PREMIUM_WIDGET_TYPES,
  TIMEZONE_CHOICES,
  WIDGET_CATEGORY,
  WIDGET_HUB_TYPES,
  WIDGET_TYPES,
  type StoredWidget,
  type WidgetType,
} from "@/lib/widgets";
import type { ProfileStyle } from "@/lib/profile-style";
import { btnGhost, btnPrimary, inputCls } from "@/components/dashboard/form-kit";

/**
 * The "Profil Widget'ı" hub — one modal that replaces the old split between
 * PresenceWidgetCard (Discord-only settings) and WidgetsClient's add-form.
 *
 * Layout mirrors the reference image:
 *   - Header + close.
 *   - Master Etkin / Devre dışı pill row (writes Profile.widgetsEnabled).
 *   - A grid of every widget type; premium-locked types show a 💎 and refuse
 *     selection on a FREE plan (the modal only mirrors what the server action
 *     already enforces — see app/actions/widgets.ts addWidget).
 *   - A per-type settings panel below the grid.
 *   - İptal / Uygula footer.
 *
 * Modal shell follows NicknameManager: createPortal, backdrop click + Esc,
 * focus pull-in on open and hand-back on close.
 */
export default function WidgetHubModal({
  open,
  onClose,
  plan,
  widgets,
  style,
  widgetsEnabled,
  pages = [],
}: {
  open: boolean;
  onClose: () => void;
  plan: string;
  /** Home-page widgets already saved; used to seed the selected type + URL. */
  widgets: StoredWidget[];
  style: ProfileStyle;
  /** Profile.widgetsEnabled — the master switch's initial value. */
  widgetsEnabled: boolean;
  /**
   * Extra tabs the user owns. When present the modal grows a target selector so
   * a widget can be added to a specific tab instead of only the home page.
   * Optional: the customize page mounts the modal without it (home-only).
   */
  pages?: { id: string; title: string; widgets: StoredWidget[] }[];
}) {
  const t = useTranslations("dashboard.widgetModal");
  const tp = useTranslations("dashboard.widgetsPage");
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const isFree = plan !== "PREMIUM";

  // ---- state ----
  const [master, setMaster] = useState(widgetsEnabled);
  const [selected, setSelected] = useState<WidgetType>("discord_status");
  // Which surface the URL/system widgets target: "" = home page, otherwise an
  // extra tab id. Reset to home whenever the modal reopens.
  const [targetPageId, setTargetPageId] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Per-type editable fields. Kept as one flat state bag so switching tabs
  // preserves unsaved edits (the user can hop between YouTube and Discord
  // without losing a half-typed URL).
  const [source, setSource] = useState("");
  const [weatherCity, setWeatherCity] = useState("");
  const [tzZone, setTzZone] = useState<string>("UTC");
  const [dsEnabled, setDsEnabled] = useState(style.discordCardEnabled);
  const [dsBadges, setDsBadges] = useState(style.discordCardShowBadges);
  const [dsIdle, setDsIdle] = useState(style.discordCardIdleText ?? "");

  // The widget rows for the currently-targeted surface. Home ("") reads the
  // `widgets` prop; a tab reads that page's own rows. Used to seed each field so
  // switching target shows the value already stored on that page, not home's.
  const activeWidgets =
    targetPageId === ""
      ? widgets
      : (pages.find((p) => p.id === targetPageId)?.widgets ?? []);

  // Re-seed every time the modal opens: pull the selected type from the first
  // existing widget (fall back to discord_status) and hydrate that type's field
  // from the stored row. The discordCard* fields always come from `style`.
  useEffect(() => {
    if (!open) return;
    setMaster(widgetsEnabled);
    setTargetPageId("");
    const first = widgets[0];
    const initialType: WidgetType = first?.type ?? "discord_status";
    setSelected(initialType);
    setDsEnabled(style.discordCardEnabled);
    setDsBadges(style.discordCardShowBadges);
    setDsIdle(style.discordCardIdleText ?? "");
    hydrateFromWidget(initialType, widgets);
    setMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // When the target surface changes, re-pull the selected type's stored row from
  // the new page so the field never shows the previous page's value.
  useEffect(() => {
    if (!open) return;
    hydrateFromWidget(selected, activeWidgets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetPageId]);

  // When the user picks a different tab, pull that type's stored row (if any)
  // into the field so the panel shows the current value, not an empty input.
  function selectType(next: WidgetType) {
    setSelected(next);
    hydrateFromWidget(next, activeWidgets);
    setMsg(null);
  }

  function hydrateFromWidget(type: WidgetType, rows: StoredWidget[]) {
    const row = rows.find((w) => w.type === type);
    if (type === "weather") setWeatherCity(row?.extra ?? "");
    else if (type === "timezone") setTzZone(row?.extra ?? "UTC");
    else setSource(row?.sourceUrl ?? "");
  }

  // Focus pull-in / restore, Esc close, backdrop click close.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => restoreRef.current?.focus?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const category = WIDGET_CATEGORY[selected];
  const isLocked = isFree && PREMIUM_WIDGET_TYPES.has(selected);

  // Curated hub tabs first, then any remaining renderable types (the legacy
  // text/image/link/discord/twitch/soundcloud rows) appended so the modal on the
  // widgets page can edit every type, not just the eleven the hub highlights.
  const gridTypes: WidgetType[] = [
    ...WIDGET_HUB_TYPES,
    ...WIDGET_TYPES.filter(
      (type) => !(WIDGET_HUB_TYPES as readonly string[]).includes(type)
    ),
  ];

  function report(res: { ok: boolean; error?: string }) {
    if (res.ok) {
      setMsg({ kind: "ok", text: t("saved") });
      return true;
    }
    const key =
      res.error === "premium"
        ? "premiumLocked"
        : res.error === "limit"
          ? "errors.limit"
          : res.error === "unauthorized"
            ? "errors.unauthorized"
            : "saveError";
    // "errors.*" lives on the widgetsPage namespace; "premiumLocked" / "saveError"
    // live on widgetModal. Route them separately so we never ask for a missing key.
    const text = key.startsWith("errors.") ? tp(key) : t(key);
    setMsg({ kind: "err", text });
    return false;
  }

  function apply() {
    setMsg(null);
    startTransition(async () => {
      // 1. Master switch — always send it so the pill state on disk matches
      //    what the user just saw in the modal (a no-op write is cheap).
      const masterRes = await setWidgetsEnabled(master);
      if (!report(masterRes)) return;

      // 2. Type-specific write. Only run when the tab is unlocked; a locked
      //    tab leaves existing rows untouched.
      if (isLocked) {
        router.refresh();
        return;
      }

      if (selected === "discord_status") {
        const fd = new FormData();
        if (dsEnabled) fd.set("discordCardEnabled", "on");
        if (dsBadges) fd.set("discordCardShowBadges", "on");
        fd.set("discordCardIdleText", dsIdle);
        const res = await updateDiscordStatusWidget(fd);
        report(res);
      } else if (category === "system" && selected === "weather") {
        // Replace any existing weather row so the city edit actually takes.
        const existing = activeWidgets.find((w) => w.type === "weather");
        if (existing) await deleteWidget(existing.id);
        const fd = new FormData();
        fd.set("type", "weather");
        fd.set("label", "");
        fd.set("source", weatherCity);
        fd.set("pageId", targetPageId);
        const res = await addWidget(fd);
        report(res);
      } else if (category === "system" && selected === "timezone") {
        const existing = activeWidgets.find((w) => w.type === "timezone");
        if (existing) await deleteWidget(existing.id);
        const fd = new FormData();
        fd.set("type", "timezone");
        fd.set("label", "");
        fd.set("source", tzZone);
        fd.set("pageId", targetPageId);
        const res = await addWidget(fd);
        report(res);
      } else if (source.trim()) {
        // URL-based tab (embed / card / text / image / link / discord / etc.):
        // replace the existing row of the same type so the modal behaves like
        // a form, not an "add another one" button.
        const existing = activeWidgets.find((w) => w.type === selected);
        if (existing) await deleteWidget(existing.id);
        const fd = new FormData();
        fd.set("type", selected);
        fd.set("label", "");
        fd.set("source", source.trim());
        fd.set("pageId", targetPageId);
        const res = await addWidget(fd);
        report(res);
      }

      router.refresh();
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
        className="flex max-h-[85vh] max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-card border border-white/10 bg-nearblack/95 shadow-2xl outline-none"
      >
        {/* header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <h2 className="text-base font-bold text-softwhite">{t("title")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("cancel")}
            className="grid h-9 w-9 place-items-center rounded-micro text-mutedtext transition-colors hover:text-softwhite"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {/* master toggle */}
          <div className="mb-5 flex items-center gap-2 rounded-pill border border-white/10 bg-white/[0.02] p-1">
            <button
              type="button"
              onClick={() => setMaster(true)}
              aria-pressed={master}
              className={`flex-1 rounded-pill px-4 py-2 text-sm font-medium transition-colors ${
                master
                  ? "bg-plum/40 text-softwhite"
                  : "text-mutedtext hover:text-softwhite"
              }`}
            >
              {t("enabled")}
            </button>
            <button
              type="button"
              onClick={() => setMaster(false)}
              aria-pressed={!master}
              className={`flex-1 rounded-pill px-4 py-2 text-sm font-medium transition-colors ${
                !master
                  ? "bg-white/10 text-softwhite"
                  : "text-mutedtext hover:text-softwhite"
              }`}
            >
              {t("disabled")}
            </button>
          </div>

          {/* target selector — only when the user owns extra tabs. Chooses the
           * surface (home or a tab) that URL/system widgets are written to. */}
          {pages.length > 0 && (
            <div className="mb-5">
              <label className="mb-1.5 block text-sm text-mutedtext">
                {t("targetPage")}
              </label>
              <select
                value={targetPageId}
                onChange={(e) => setTargetPageId(e.target.value)}
                className={inputCls}
              >
                <option value="">{tp("form.homeTab")}</option>
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* widget-type grid */}
          <p className="mb-2 text-xs uppercase tracking-widest text-mutedtext/60">
            {t("chooseType")}
          </p>
          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {gridTypes.map((type) => {
              const locked = isFree && PREMIUM_WIDGET_TYPES.has(type);
              const active = selected === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => selectType(type)}
                  aria-pressed={active}
                  className={`flex items-center justify-between gap-2 rounded-field border px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "border-plumborder bg-plum/30 text-softwhite"
                      : "border-white/10 bg-white/[0.02] text-mutedtext hover:text-softwhite"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <WidgetTypeIcon
                      type={type}
                      className={`h-4 w-4 shrink-0 ${
                        active ? "text-plumborder" : "text-mutedtext/70"
                      }`}
                    />
                    <span className="truncate">{tp(`types.${type}`)}</span>
                  </span>
                  {locked && (
                    <span aria-hidden className="shrink-0 text-plumborder">
                      <DiamondIcon className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* per-type settings panel */}
          <div className="rounded-card border border-white/10 bg-white/[0.02] p-4">
            {isLocked ? (
              <p className="text-sm text-mutedtext">{t("premiumLocked")}</p>
            ) : (
              <>
                <p className="mb-3 text-xs text-mutedtext/70">
                  {tp(`hint.${selected}`)}
                </p>
                {selected === "discord_status" && (
                  <div className="space-y-4">
                    <SwitchRow
                      label={tp("types.discord_status") + " · " + t("enabled")}
                      checked={dsEnabled}
                      onChange={setDsEnabled}
                    />
                    {/* The two presence sub-toggles sit side-by-side like the
                     * reference panel, then the idle note spans the full width. */}
                    <div className="grid grid-cols-2 gap-4">
                      <SwitchRow
                        label={t("showBadges")}
                        checked={dsBadges}
                        onChange={setDsBadges}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm text-mutedtext">
                        {t("idleText")}
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mutedtext/60">
                          <PencilIcon className="h-4 w-4" />
                        </span>
                        <input
                          type="text"
                          maxLength={80}
                          value={dsIdle}
                          onChange={(e) => setDsIdle(e.target.value)}
                          placeholder={t("idlePlaceholder")}
                          className={`${inputCls} pl-9`}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {category === "system" && selected === "weather" && (
                  <div>
                    <label className="mb-1.5 block text-sm text-mutedtext">
                      {t("city")}
                    </label>
                    <input
                      type="text"
                      maxLength={60}
                      value={weatherCity}
                      onChange={(e) => setWeatherCity(e.target.value)}
                      placeholder={t("cityPlaceholder")}
                      className={inputCls}
                    />
                  </div>
                )}

                {category === "system" && selected === "timezone" && (
                  <div>
                    <label className="mb-1.5 block text-sm text-mutedtext">
                      {t("zone")}
                    </label>
                    <select
                      value={tzZone}
                      onChange={(e) => setTzZone(e.target.value)}
                      className={inputCls}
                    >
                      {TIMEZONE_CHOICES.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {(category === "embed" || category === "card" || category === "text") &&
                  selected !== "discord_status" && (
                    <div>
                      <label className="mb-1.5 block text-sm text-mutedtext">
                        {category === "text" ? t("noteLabel") : t("sourceLabel")}
                      </label>
                      <input
                        type={category === "text" ? "text" : "url"}
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        placeholder={tp("form.source")}
                        className={inputCls}
                      />
                    </div>
                  )}
              </>
            )}
          </div>
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-3 border-t border-white/10 px-5 py-4">
          {msg && (
            <span
              role="status"
              className={`mr-auto text-sm ${
                msg.kind === "ok" ? "text-plumborder" : "text-red-300"
              }`}
            >
              {msg.text}
            </span>
          )}
          <button type="button" onClick={onClose} className={btnGhost}>
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={pending}
            className={btnPrimary}
          >
            {pending ? t("saving") : t("apply")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// A compact switch matching PresenceWidgetCard's design. Uses a real checkbox
// so an unchecked field submits nothing; the action's normBool reads it as false.
function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-white/10 transition-colors peer-checked:bg-plumborder" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-softwhite transition-transform peer-checked:translate-x-5" />
      </span>
      <span className="block text-sm text-softwhite">{label}</span>
    </label>
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

function DiamondIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M6 2h12l4 6-10 14L2 8l4-6zm1.5 2L5 7.5h14L16.5 4h-9z" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

/**
 * Monochrome per-type glyphs for the hub grid (reference image 2). Kept inline
 * so the modal needs no icon package and every tile inherits the current text
 * colour via `currentColor` — the selected tile already switches to the plum
 * accent, so these ride that change for free. Outline marks use stroke; the
 * brand-recognisable ones (Discord/YouTube/Spotify/Telegram) use fill.
 */
function WidgetTypeIcon({ type, className }: { type: WidgetType; className?: string }) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (type) {
    case "discord_status":
    case "discord_server":
    case "discord":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
          <path d="M20 4.4A17 17 0 0 0 15.8 3l-.3.6a13 13 0 0 1 3.6 1.8 12 12 0 0 0-10.9 0A13 13 0 0 1 8.8 3.6L8.5 3A17 17 0 0 0 4 4.4C1.6 8 1 11.5 1.3 15a17 17 0 0 0 5.2 2.6l.6-1a11 11 0 0 1-1.8-.9l.4-.3a12 12 0 0 0 10.4 0l.4.3a11 11 0 0 1-1.8.9l.6 1A17 17 0 0 0 22.5 15c.4-4-.6-7.5-2.5-10.6ZM8.6 13.2c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.6.8 1.6 1.8-.7 1.8-1.6 1.8Zm6.8 0c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.6.8 1.6 1.8-.7 1.8-1.6 1.8Z" />
        </svg>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
          <path d="M23 12s0-3.2-.4-4.7a2.5 2.5 0 0 0-1.7-1.7C19.3 5.2 12 5.2 12 5.2s-7.3 0-8.9.4A2.5 2.5 0 0 0 1.4 7.3C1 8.8 1 12 1 12s0 3.2.4 4.7a2.5 2.5 0 0 0 1.7 1.7c1.6.4 8.9.4 8.9.4s7.3 0 8.9-.4a2.5 2.5 0 0 0 1.7-1.7C23 15.2 23 12 23 12ZM9.8 15.3V8.7l6 3.3-6 3.3Z" />
        </svg>
      );
    case "spotify":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 14.4a.8.8 0 0 1-1 .2c-2.6-1.6-6-2-9.9-1.1a.8.8 0 1 1-.3-1.5c4.3-1 8-.5 10.9 1.3.4.2.5.7.3 1.1Zm1.2-2.9a1 1 0 0 1-1.3.3c-3-1.8-7.5-2.3-11-1.3a1 1 0 1 1-.5-1.9c4-1.2 9-.6 12.5 1.5.4.3.6.9.3 1.4Zm.1-3C14.4 8.5 8.6 8.3 5.1 9.4a1.2 1.2 0 1 1-.6-2.3c4-1.2 10.4-1 14.4 1.4a1.2 1.2 0 0 1-1.4 2Z" />
        </svg>
      );
    case "telegram":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
          <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.2-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.8 8.7-7.9c.4-.3-.1-.5-.6-.2L6.9 13.2l-4.6-1.4c-1-.3-1-1 .2-1.4l18-6.9c.8-.3 1.5.2 1.4 1.1Z" />
        </svg>
      );
    case "roblox":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}>
          <path d="M5 3l16 5-5 16L1 14 5 3Z" />
          <path d="M10.4 8.3l5.3 1.6-1.6 5.3-5.3-1.6 1.6-5.3Z" />
        </svg>
      );
    case "github":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
          <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.3-1.1.6-1.4-2.2-.2-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.8-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" />
        </svg>
      );
    case "cs":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "lastfm":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3.6 13.2c-1.4 0-2.4-.8-2.9-2l-.4-1.4c-.3-.9-.5-1.5-1.2-1.5-.7 0-1.1.5-1.1 1.4 0 1.2.9 2 .9 2-.4.6-1.2 1-1.2 1C7 13.3 6.6 12 6.6 11c0-2.2 1.4-3.4 3.1-3.4 1.9 0 2.8 1.2 3.3 2.6l.5 1.4c.3.8.6 1.2 1.3 1.2.6 0 1-.4 1-1 0-.8-.6-1.4-1.6-2 .3-.6.8-1.1.8-1.1 1 .5 1.7 1.6 1.7 3 0 1.9-1.3 3.1-3.1 3.1Z" />
        </svg>
      );
    case "weather":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}>
          <path d="M7 18a4 4 0 0 1-.5-8 5 5 0 0 1 9.6-1.3A3.5 3.5 0 0 1 18 18H7Z" />
        </svg>
      );
    case "timezone":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    default:
      // text / image / link / soundcloud / twitch: a neutral tile glyph so the
      // hub grid never renders an empty slot for an unexpected type.
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M8 12h8" />
        </svg>
      );
  }
}
