"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  connectDiscord,
  disconnectDiscord,
  rejoinDiscordGuild,
} from "@/app/actions/discord";
import GlassCard from "@/components/ui/GlassCard";
import {
  CardTitle,
  FeedbackLine,
  btnPrimary,
  useFeedback,
  type Feedback,
} from "@/components/dashboard/form-kit";

/** The part of the owner's Discord identity this card needs. */
export type DiscordSummary = {
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

/**
 * The Discord connection, replacing the old "paste your snowflake" field.
 *
 * There is no id to type any more: pressing connect hands the browser to
 * Discord's own authorisation screen, where the owner sees exactly what the
 * application is asking for and grants it. The id, the tokens and every field the
 * profile card shows then follow from that grant — which is why this card carries
 * no input at all.
 *
 * It also owns the second half of that grant: connecting quietly adds the owner to
 * our Discord server, because a bot can only report presence for members of a
 * server it is in. When that did not happen — a grant older than the permission, a
 * server they left, a bot missing the right — the card names the case and offers
 * the one action that can fix it. None of it gates the identity card above, which
 * is why every line below is a hint rather than a wall.
 *
 * It lives outside StyleForm on purpose: `connectDiscord` navigates away, and a
 * submit-style button inside the big "save all" form would be a confusing way to
 * leave the page.
 */
export default function DiscordConnectCard({
  enabled,
  botConfigured,
  inGuild,
  scopeOutdated,
  identity,
}: {
  /** False when the Discord OAuth app is not configured — then nothing renders. */
  enabled: boolean;
  /** Are DISCORD_BOT_TOKEN + DISCORD_GUILD_ID set? Decides which model is described. */
  botConfigured: boolean;
  /** Membership of our server; `null` = not applicable or unknown, so no hint. */
  inGuild: boolean | null;
  /** The stored grant has no `guilds.join`, so Discord will refuse to add them. */
  scopeOutdated: boolean;
  identity: DiscordSummary | null;
}) {
  const tp = useTranslations("dashboard.customizePage.discord");
  const { fb, report } = useFeedback({ ok: tp("disconnected"), lastauth: tp("lastAuth") });
  // Rejoin gets its own line instead of sharing `report`: "you are in the server"
  // is not the same news as "profile saved", and a refusal has one specific reason.
  const [rejoinFb, setRejoinFb] = useState<Feedback>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!enabled) return null;

  const connected = !!identity;

  function onConnect() {
    // Auth.js answers with a redirect to Discord, so this call never returns
    // normally — the same contract the login page's OAuth buttons rely on.
    startTransition(() => {
      void connectDiscord();
    });
  }

  function onDisconnect() {
    startTransition(async () => {
      report(await disconnectDiscord());
      router.refresh();
    });
  }

  function onRejoin() {
    setRejoinFb(null);
    startTransition(async () => {
      const res = await rejoinDiscordGuild();
      if (res.ok) {
        setRejoinFb({ kind: "ok", msg: tp("rejoined") });
        router.refresh();
        return;
      }
      setRejoinFb({ kind: "err", msg: tp("rejoinFailed") });
    });
  }

  return (
    <GlassCard className="p-6">
      <CardTitle>{tp("title")}</CardTitle>

      {connected ? (
        <div className="flex items-center gap-3">
          <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={identity.avatarUrl ?? ""}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-softwhite">
              {identity.displayName ?? identity.username ?? "Discord"}
            </span>
            {identity.username && (
              <span className="block truncate text-xs text-mutedtext/70">
                @{identity.username} · {tp("connected")}
              </span>
            )}
          </span>
        </div>
      ) : (
        <p className="text-sm text-mutedtext/80">{tp("consentNote")}</p>
      )}

      {/* Server membership is what makes the live "Playing …" line possible, so
          the card states it — but only when there is a bot to state it for, and
          only when there is actually something to say (`inGuild === null` means
          Discord did not answer, and an empty box would be worse than none). */}
      {connected && botConfigured && (scopeOutdated || inGuild !== null) && (
        <div className="mt-4 rounded-field border border-white/10 bg-white/[0.02] px-4 py-3">
          {scopeOutdated ? (
            <p className="text-xs text-amber-200/80">{tp("scopeOutdated")}</p>
          ) : inGuild === false ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-xs text-mutedtext/80">{tp("notInGuild")}</p>
              <button
                type="button"
                onClick={onRejoin}
                disabled={pending}
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-pill border border-white/15 px-4 text-xs text-softwhite transition-colors hover:border-[#5865F2] hover:bg-[#5865F2]/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {tp("rejoin")}
              </button>
              <FeedbackLine fb={rejoinFb} />
            </div>
          ) : inGuild === true ? (
            <p className="text-xs text-mutedtext/80">{tp("inGuild")}</p>
          ) : null}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {connected ? (
          <button
            type="button"
            onClick={onDisconnect}
            disabled={pending}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-pill border border-white/10 bg-white/[0.02] px-5 text-sm text-mutedtext transition-colors hover:border-[#DA373C] hover:text-[#f7a4a8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {tp("disconnect")}
          </button>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            disabled={pending}
            className={`${btnPrimary} !bg-[#5865F2] hover:!bg-[#4752c4]`}
          >
            {pending ? tp("connecting") : tp("connect")}
          </button>
        )}
        <FeedbackLine fb={fb} />
      </div>

      {/* `lanyardNote` keeps its (now historical) key while describing the bot
          model; the Lanyard sentence only belongs on screen while no bot is
          configured, so a reader is never told about two mechanisms at once. */}
      <p className="mt-3 text-xs text-mutedtext/60">
        {connected
          ? botConfigured
            ? tp("lanyardNote")
            : tp("botNotConfigured")
          : tp("needConnection")}
      </p>
    </GlassCard>
  );
}
