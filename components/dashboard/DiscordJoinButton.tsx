"use client";

import { useTranslations } from "next-intl";

import { DISCORD_INVITE_URL } from "@/lib/discord-guild";
import { btnPrimary } from "@/components/dashboard/form-kit";

/**
 * "Hemen katıl" — opens our public Discord invite in a new tab. Discord's own
 * accept screen does the rest: the visitor taps once, the invite is accepted, and
 * they are in the server. This replaces the old `guilds.join` API call, so the
 * button needs no bot permission and works for anyone.
 *
 * When `inGuild` is true the user is already a member, so the invite CTA is
 * replaced with a confirmation message instead.
 */
export default function DiscordJoinButton({ inGuild }: { inGuild: boolean | null }) {
  const t = useTranslations("dashboard.accountPage.discordSettings");

  if (inGuild === true) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
        <span className="text-sm font-medium text-emerald-300">{t("alreadyInServer")}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <a
        href={DISCORD_INVITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={btnPrimary}
      >
        {t("cta")}
      </a>
    </div>
  );
}
