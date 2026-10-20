"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { grantBadge, revokeBadge, setBadgeColor } from "@/app/actions/badges";
import type { ActionResult } from "@/app/actions/profile";
import {
  BADGES,
  BADGE_COUNT,
  badgeBarClass,
  badgeProgress,
  badgeToneClass,
  type BadgeIconName,
  type BadgeMetrics,
  type BadgeTone,
} from "@/lib/badges";
import BadgeIcon from "@/components/icons/BadgeIcon";
import GlassCard from "@/components/ui/GlassCard";
import Reveal from "@/components/motion/Reveal";
import {
  CardTitle,
  FeedbackLine,
  PageHeading,
  btnPrimary,
  inputCls,
  useFeedback,
} from "@/components/dashboard/form-kit";

type Grant = {
  badgeKey: string;
  source: "AUTO" | "ADMIN";
  grantedAt: Date;
};

type Row = {
  key: string;
  tone: BadgeTone;
  icon: BadgeIconName;
  target: number;
  current: number;
  ratio: number;
  granted: Grant | null;
};

/**
 * Stored grants decide what counts as earned (an admin grant with no matching
 * rule still shows, a lapsed condition never takes a badge away), while the live
 * metrics only drive the progress bars on the locked rows.
 */
function buildRows(earned: Grant[], metrics: BadgeMetrics | null): Row[] {
  const stored = new Map(earned.map((g) => [g.badgeKey, g]));
  return BADGES.map((def) => {
    const p = metrics ? badgeProgress(def, metrics) : null;
    const grant = stored.get(def.key) ?? null;
    return {
      key: def.key,
      tone: def.tone,
      icon: def.icon,
      target: def.target,
      current: p?.current ?? 0,
      ratio: grant ? 1 : (p?.ratio ?? 0),
      granted: grant,
    };
  });
}

export default function BadgesClient({
  earned,
  metrics,
  canAdmin,
  handle,
  badgeColors,
}: {
  earned: Grant[];
  metrics: BadgeMetrics | null;
  canAdmin: boolean;
  handle: string;
  /** Stored owner tints { badgeKey: "#rrggbb" } the pickers start from. */
  badgeColors: Record<string, string>;
}) {
  const tb = useTranslations("badges");
  const locale = useLocale();
  const rows = buildRows(earned, metrics);
  const mine = rows.filter((r) => r.granted);
  const locked = rows.filter((r) => !r.granted);
  const dateFmt = (d: Date) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d);

  // `drafts` drive the picker + the live tile preview; `saved` mirrors what is
  // actually in the DB. Committing on blur (not on every input tick) keeps the
  // native colour picker's drag from hammering the server.
  const [drafts, setDrafts] = useState<Record<string, string>>(badgeColors);
  const [saved, setSaved] = useState<Record<string, string>>(badgeColors);
  const [pending, startTransition] = useTransition();
  const { fb, report } = useFeedback({ ok: tb("colorSaved") });

  function commitColor(key: string, hex: string | null) {
    if (hex === null) {
      if (!(key in saved)) return; // nothing stored to clear
    } else if ((saved[key] ?? null) === hex) {
      return; // unchanged — a blur without a real pick must not write
    }
    startTransition(async () => {
      const res = await setBadgeColor({ key, hex });
      if (res.ok) {
        setSaved((prev) => {
          const next = { ...prev };
          if (hex === null) delete next[key];
          else next[key] = hex;
          return next;
        });
        if (hex === null) {
          setDrafts((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
      }
      report(res);
    });
  }

  return (
    <main>
      <PageHeading title={tb("title")} subtitle={tb("subtitle")}>
        <p className="mt-2 text-sm text-mutedtext/70">
          {tb("earnedCount", { earned: mine.length, total: BADGE_COUNT })}
        </p>
      </PageHeading>

      <Reveal>
        <GlassCard className="p-6">
          <CardTitle>{tb("earned")}</CardTitle>
          {mine.length === 0 ? (
            <p className="text-sm text-mutedtext/70">{tb("noEarned")}</p>
          ) : (
            <ul className="space-y-2">
              {mine.map((r) => (
                <li
                  key={r.key}
                  className="flex items-center gap-4 rounded-card border border-edge bg-panel px-4 py-3"
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-micro ring-1 ${badgeToneClass[r.tone]}`}
                    // The draft tint wins over the tone's text colour (inline
                    // style beats a class), so the tile previews the pick live.
                    style={drafts[r.key] ? { color: drafts[r.key] } : undefined}
                  >
                    <BadgeIcon name={r.icon} className="h-5 w-5" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold text-softwhite">
                      {tb(`items.${r.key}.name`)}
                    </span>
                    <span className="truncate text-sm text-mutedtext/70">
                      {tb(`items.${r.key}.desc`, { n: r.target })}
                    </span>
                  </span>
                  <span className="ml-auto flex shrink-0 flex-col items-end gap-1">
                    <span className="flex items-center gap-2">
                      <label
                        htmlFor={`badge-color-${r.key}`}
                        className="sr-only"
                      >
                        {tb("color")}
                      </label>
                      <input
                        id={`badge-color-${r.key}`}
                        type="color"
                        value={drafts[r.key] ?? "#8b5cf6"}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [r.key]: e.target.value,
                          }))
                        }
                        // Blur = the native picker closed; commit exactly once
                        // per pick instead of per drag tick.
                        onBlur={() => commitColor(r.key, drafts[r.key] ?? null)}
                        disabled={pending}
                        title={tb("color")}
                        className="h-7 w-9 cursor-pointer rounded-micro border border-white/10 bg-white/[0.02]"
                      />
                      <button
                        type="button"
                        onClick={() => commitColor(r.key, null)}
                        disabled={pending || !(r.key in saved)}
                        className="text-[11px] text-mutedtext/70 underline-offset-2 hover:text-softwhite hover:underline disabled:opacity-40 disabled:hover:text-mutedtext/70 disabled:no-underline"
                      >
                        {tb("colorReset")}
                      </button>
                    </span>
                    <span className="rounded-pill bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-widest text-mutedtext/70">
                      {r.granted?.source === "ADMIN"
                        ? tb("source.admin")
                        : tb("source.auto")}
                    </span>
                    {r.granted && (
                      <span className="text-[11px] text-mutedtext/50">
                        {dateFmt(r.granted.grantedAt)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-mutedtext/60">{tb("keepForever")}</p>
          <div className="mt-2">
            <FeedbackLine fb={fb} />
          </div>
        </GlassCard>
      </Reveal>

      {locked.length > 0 && (
        <Reveal delay={0.05}>
          <GlassCard className="mt-6 p-6">
            <CardTitle>{tb("locked")}</CardTitle>
            <ul className="space-y-3">
              {locked.map((r) => (
                <li
                  key={r.key}
                  className="flex items-center gap-4 rounded-card border border-edge bg-panel px-4 py-3 opacity-70"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-micro bg-white/5 text-mutedtext ring-1 ring-white/10">
                    <BadgeIcon name="lock" className="h-5 w-5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="truncate font-semibold text-softwhite">
                        {tb(`items.${r.key}.name`)}
                      </span>
                      <span className="shrink-0 text-xs text-mutedtext/70">
                        {tb("progress", { current: r.current, target: r.target })}
                      </span>
                    </span>
                    <span className="block text-sm text-mutedtext/70">
                      {tb(`items.${r.key}.desc`, { n: r.target })}
                    </span>
                    <span className="h-1.5 w-full rounded-pill bg-white/5">
                      <span
                        className={`block h-full rounded-pill ${badgeBarClass[r.tone]}`}
                        style={{ width: `${Math.round(r.ratio * 100)}%` }}
                      />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-mutedtext/60">{tb("hint")}</p>
          </GlassCard>
        </Reveal>
      )}

      {canAdmin && <AdminPanel defaultHandle={handle} />}
    </main>
  );
}

/**
 * Only rendered for the ADMIN_EMAILS allowlist, and every action re-checks the
 * session anyway — hiding this card is not the permission.
 */
function AdminPanel({ defaultHandle }: { defaultHandle: string }) {
  const tb = useTranslations("badges");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(defaultHandle);
  const [key, setKey] = useState(BADGES[0].key);
  // Grant and revoke use the admin wording, not the generic profile-form copy.
  const { fb, report } = useFeedback({
    ok: tb("admin.done"),
    forbidden: tb("admin.forbidden"),
  });

  async function run(
    action: (handle: string, key: string) => Promise<ActionResult>
  ) {
    setBusy(true);
    report(await action(target.trim(), key));
    setBusy(false);
  }

  return (
    <Reveal delay={0.1}>
      <GlassCard className="mt-6 p-6">
        <CardTitle>{tb("admin.title")}</CardTitle>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor="admin-handle">
            {tb("admin.handle")}
          </label>
          <input
            id="admin-handle"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={tb("admin.placeholder")}
            className={inputCls}
          />
          <label className="sr-only" htmlFor="admin-badge">
            {tb("admin.badge")}
          </label>
          <select
            id="admin-badge"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="h-11 shrink-0 rounded-field border border-white/10 bg-white/[0.02] px-3 text-softwhite focus:border-plumborder focus:outline-none"
          >
            {BADGES.map((b) => (
              <option key={b.key} value={b.key} className="bg-nearblack">
                {tb(`items.${b.key}.name`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !target.trim()}
            onClick={() => run(grantBadge)}
            className={btnPrimary}
          >
            {tb("admin.grant")}
          </button>
          <button
            type="button"
            disabled={busy || !target.trim()}
            onClick={() => run(revokeBadge)}
            className="h-11 shrink-0 rounded-pill border border-white/10 px-5 text-sm text-mutedtext transition-colors hover:border-red-400/40 hover:text-red-300 disabled:opacity-60"
          >
            {tb("admin.revoke")}
          </button>
        </div>
        <div className="mt-3 space-y-2">
          <FeedbackLine fb={fb} />
          <p className="text-xs text-mutedtext/60">{tb("admin.note")}</p>
        </div>
      </GlassCard>
    </Reveal>
  );
}
