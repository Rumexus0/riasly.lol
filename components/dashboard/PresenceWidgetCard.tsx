"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { updateDiscordWidget } from "@/app/actions/profile";
import type { ProfileStyle } from "@/lib/profile-style";
import GlassCard from "@/components/ui/GlassCard";
import { CardTitle, FeedbackLine, btnPrimary, useFeedback } from "@/components/dashboard/form-kit";

/**
 * The "Profil Widget'ı" — the owner's control panel for the Discord presence card
 * that renders on their public profile. It lives directly under the Discord
 * connection card and only mounts once Discord is linked, because every option
 * here configures a card that cannot exist without the OAuth grant.
 *
 * It is a SEPARATE, self-submitting form from StyleForm on purpose: its action
 * (`updateDiscordWidget`) writes only the five discordCard* columns, disjoint from
 * the full style set StyleForm saves. That is why none of these fields appear in
 * StyleForm and why the two saves can never overwrite each other.
 */
export default function PresenceWidgetCard({ style }: { style: ProfileStyle }) {
  const tp = useTranslations("dashboard.customizePage.widget");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { fb, report } = useFeedback({ ok: tp("saved") });

  // Local, editable copy of the kernel values.
  const [enabled, setEnabled] = useState(style.discordCardEnabled);
  const [showBadges, setShowBadges] = useState(style.discordCardShowBadges);
  const [idleText, setIdleText] = useState(style.discordCardIdleText ?? "");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      // The action normalises everything (bools, source whitelist "auto"→null,
      // idle-text clamp), so the DB never receives an unvalidated widget value.
      const res = await updateDiscordWidget(new FormData(e.currentTarget));
      report(res);
      router.refresh();
    });
  }

  return (
    <GlassCard className="p-6">
      <CardTitle>{tp("title")}</CardTitle>
      <p className="-mt-2 mb-4 text-sm text-mutedtext/70">{tp("subtitle")}</p>

      <form onSubmit={onSubmit} className="space-y-4">
        <SwitchField
          label={tp("enable")}
          name="discordCardEnabled"
          checked={enabled}
          onChange={setEnabled}
        />

        <div className={enabled ? undefined : "pointer-events-none opacity-50"}>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
            <SwitchField
              label={tp("showBadges")}
              name="discordCardShowBadges"
              checked={showBadges}
              onChange={setShowBadges}
            />
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-sm text-mutedtext">{tp("idleText")}</label>
            <input
              name="discordCardIdleText"
              type="text"
              maxLength={80}
              value={idleText}
              onChange={(e) => setIdleText(e.target.value)}
              placeholder={tp("idlePlaceholder")}
              className="h-11 w-full rounded-field border border-white/10 bg-white/[0.02] px-3 text-softwhite placeholder:text-mutedtext/40 transition focus:border-plumborder focus:shadow-glow focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending ? tp("saving") : tp("save")}
          </button>
          <FeedbackLine fb={fb} />
        </div>
      </form>
    </GlassCard>
  );
}

// A compact toggle mirroring StyleForm's SwitchField. It carries a real checkbox
// under the hood, so an unchecked switch submits nothing and the action's
// normBool reads it as false — exactly how the rest of the dashboard toggles work.
function SwitchField({
  label,
  name,
  checked,
  onChange,
}: {
  label: string;
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          name={name}
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
