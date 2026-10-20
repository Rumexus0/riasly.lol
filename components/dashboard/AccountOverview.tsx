"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { changeHandle, changeDisplayName, type AccountResult } from "@/app/actions/account";
import type { BadgeMetrics } from "@/lib/badges";
import GlassCard from "@/components/ui/GlassCard";
import Reveal from "@/components/motion/Reveal";
import AnimatedCounter from "@/components/AnimatedCounter";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import {
  CardTitle,
  PageHeading,
  btnGhost,
  btnPrimary,
  inputCls,
} from "@/components/dashboard/form-kit";
import NicknameManager from "@/components/dashboard/NicknameManager";
import EmailCard from "@/components/dashboard/EmailCard";
import TwoFactorCard from "@/components/dashboard/TwoFactorCard";
import ActiveSessionsCard, {
  type DeviceSessionView,
} from "@/components/dashboard/ActiveSessionsCard";
import ConnectionsCard from "@/components/dashboard/ConnectionsCard";
import DiscordJoinButton from "@/components/dashboard/DiscordJoinButton";

// The Account hub that owns /dashboard. It mirrors the reference layout's band
// order — identity stats, completion, then Genel Bilgiler / Dil / Discord /
// Güvenlik / Bağlantılar. Each interactive band is a focused client component that
// talks to exactly one server action module, so this file stays a composition: the
// stat cards, the completion meter and the two plain text editors (username and
// display name) are the only things with markup here.

export type AccountOverviewProps = {
  handle: string;
  displayName: string | null;
  views: number;
  plan: string;
  nicknames: string;
  discordConnected: boolean;
  providers: string[];
  metrics: BadgeMetrics | null;
  email: string | null;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  sessions: DeviceSessionView[];
  guildJoinAvailable: boolean;
  /** Whether the user is already in our Discord guild; null = unknown/not applicable. */
  inGuild: boolean | null;
  googleAvailable: boolean;
  /**
   * Anti-squat: whole days left before the next handle change is allowed.
   * 0 means free to change; >0 locks the change-handle form and shows a note.
   * Computed server-side from User.handleChangedAt so client and action agree.
   */
  handleCooldownDaysLeft: number;
};

export default function AccountOverview(props: AccountOverviewProps) {
  const t = useTranslations("dashboard");
  const ap = (key: string) => t(`accountPage.${key}`);
  const router = useRouter();
  const [nickOpen, setNickOpen] = useState(false);

  // Profile completion is driven by ONE list so the meter and the chips can never
  // disagree: every part is real, observable data (no arbitrary view thresholds).
  const parts = [
    { key: "avatar", done: !!props.metrics?.hasAvatar, href: "/dashboard/customize" },
    { key: "bio", done: !!props.metrics?.hasBio, href: "/dashboard/customize" },
    { key: "socials", done: (props.metrics?.socials ?? 0) > 0, href: "/dashboard/links" },
    { key: "links", done: (props.metrics?.links ?? 0) > 0, href: "/dashboard/links" },
    { key: "discord", done: props.discordConnected, href: "/dashboard/customize" },
  ];
  const done = parts.filter((p) => p.done).length;
  const pct = Math.round((done / parts.length) * 100);

  return (
    <main>
      <PageHeading title={ap("title")} subtitle={ap("subtitle")} />

      {/* ===== identity stats ===== */}
      <Reveal>
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label={ap("stats.handle")} text={props.handle ? `@${props.handle}` : "—"} />
          <StatCard label={ap("stats.nickname")} text={props.displayName ?? props.handle ?? "—"} />
          <StatCard label={ap("stats.views")} counter={props.views} />
        </div>
      </Reveal>

      {/* ===== completion ===== */}
      <Reveal delay={0.05}>
        <GlassCard className="mb-8 p-6">
          <CardTitle>{ap("completion.heading")}</CardTitle>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-softwhite">{pct}%</span>
            {pct < 100 && (
              <span className="text-xs text-amber-200/80">{ap("completion.incomplete")}</span>
            )}
            {pct >= 100 && (
              <span className="text-xs text-plumborder">{ap("completion.done")}</span>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-brandgrad transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {parts.map((p) => (
              <ChecklistChip
                key={p.key}
                label={ap(`completion.checklist.${p.key}`)}
                done={p.done}
                href={p.href}
              />
            ))}
          </div>
        </GlassCard>
      </Reveal>

      {/* ===== general info ===== */}
      <Reveal delay={0.1}>
        <GlassCard className="mb-8 p-6">
          <CardTitle>{ap("general.heading")}</CardTitle>
          <div className="flex flex-col gap-4">
            <ManageForm
              ap={ap}
              router={router}
              action={changeHandle}
              title={ap("manage.changeHandle")}
              locked={props.handleCooldownDaysLeft > 0}
              lockLabel={
                props.handleCooldownDaysLeft > 0
                  ? t("accountPage.changeHandle.cooldown", {
                      days: props.handleCooldownDaysLeft,
                    })
                  : undefined
              }
            >
              <label className="text-sm text-mutedtext">{ap("form.handleNew")}</label>
              <input name="handle" type="text" defaultValue={props.handle} maxLength={30} className={inputCls} autoComplete="off" />
            </ManageForm>

            <ManageForm ap={ap} router={router} action={changeDisplayName} title={ap("manage.changeName")}>
              <label className="text-sm text-mutedtext">{ap("form.nameNew")}</label>
              <input name="name" type="text" defaultValue={props.displayName ?? ""} maxLength={40} className={inputCls} />
            </ManageForm>

            <div className="flex items-center justify-between rounded-field border border-white/10 bg-white/[0.02] px-4 py-3">
              <span className="text-sm text-softwhite">{ap("general.nicknames")}</span>
              <button type="button" onClick={() => setNickOpen(true)} className={btnGhost}>
                {ap("general.openNicknameManager")}
              </button>
            </div>

            <EmailCard email={props.email} verified={props.emailVerified} />
          </div>
        </GlassCard>
      </Reveal>

      {/* ===== language ===== */}
      <Reveal delay={0.12}>
        <GlassCard className="mb-8 p-6">
          <CardTitle>{ap("language.heading")}</CardTitle>
          <LanguageSwitcher label={ap("language.label")} />
        </GlassCard>
      </Reveal>

      {/* ===== discord settings ===== */}
      {props.guildJoinAvailable && (
        <Reveal delay={0.14}>
          <GlassCard className="mb-8 p-6">
            <CardTitle>{ap("discordSettings.heading")}</CardTitle>
            <p className="mb-4 text-sm text-mutedtext/80">{ap("discordSettings.hint")}</p>
            <DiscordJoinButton inGuild={props.inGuild} />
          </GlassCard>
        </Reveal>
      )}

      {/* ===== security ===== */}
      <Reveal delay={0.16}>
        <GlassCard className="mb-8 p-6">
          <CardTitle>{ap("security.heading")}</CardTitle>
          <div className="flex flex-col gap-4">
            <TwoFactorCard enabled={props.twoFactorEnabled} />
            <ActiveSessionsCard sessions={props.sessions} />
          </div>
        </GlassCard>
      </Reveal>

      {/* ===== connections ===== */}
      <Reveal delay={0.18}>
        <GlassCard className="p-6">
          <CardTitle>{ap("connections.heading")}</CardTitle>
          <ConnectionsCard providers={props.providers} googleAvailable={props.googleAvailable} />
        </GlassCard>
      </Reveal>

      <NicknameManager open={nickOpen} initial={props.nicknames} onClose={() => setNickOpen(false)} />
    </main>
  );
}

function StatCard({
  label,
  text,
  counter,
}: {
  label: string;
  text?: string;
  counter?: number;
}) {
  return (
    <GlassCard className="p-4">
      <p className="text-xs uppercase tracking-widest text-mutedtext/70">{label}</p>
      <p className="mt-1 truncate text-2xl font-bold text-softwhite">
        {counter !== undefined ? <AnimatedCounter value={counter} /> : text}
      </p>
    </GlassCard>
  );
}

function ChecklistChip({ label, done, href }: { label: string; done: boolean; href: string }) {
  const cls = done
    ? "bg-plumborder/15 text-plumborder ring-plumborder/40"
    : "bg-white/[0.02] text-mutedtext ring-white/10 hover:text-softwhite";
  return (
    <Link href={href} className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs ring-1 transition-colors ${cls}`}>
      <span aria-hidden>{done ? "✓" : "○"}</span>
      {label}
    </Link>
  );
}

// One focused inline editor: a title row that expands to a form calling a specific
// account action. Success/failure comes back through the action's AccountResult,
// so we surface taken/invalid without a page reload.
function ManageForm({
  ap,
  router,
  action,
  title,
  children,
  locked,
  lockLabel,
}: {
  ap: (key: string) => string;
  router: ReturnType<typeof useRouter>;
  action: (formData: FormData) => Promise<AccountResult>;
  title: string;
  children: React.ReactNode;
  /** Disables submit (anti-squat cooldown) while true. */
  locked?: boolean;
  /** Shown in place of the form note while locked; reused for the cooldown error. */
  lockLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const res = await action(new FormData(e.currentTarget));
      if (res.ok) {
        setMsg({ kind: "ok", text: ap("form.saved") });
        setOpen(false);
        router.refresh();
      } else {
        const text =
          res.error === "taken"
            ? ap("errors.taken")
            : res.error === "cooldown"
              ? lockLabel ?? ap("errors.invalid")
              : ap("errors.invalid");
        setMsg({ kind: "err", text });
      }
    });
  }

  return (
    <div className="rounded-field border border-white/10 bg-white/[0.02] px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-sm font-semibold text-softwhite"
      >
        {title}
        <span className="text-mutedtext">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2">
          {children}
          {locked && lockLabel && (
            <p className="text-xs text-amber-200/80">{lockLabel}</p>
          )}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending || locked} className={btnPrimary}>
              {pending ? ap("form.saving") : ap("form.save")}
            </button>
            {msg && (
              <span role="status" className={`text-sm ${msg.kind === "ok" ? "text-plumborder" : "text-red-300"}`}>
                {msg.text}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
