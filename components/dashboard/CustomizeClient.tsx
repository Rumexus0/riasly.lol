"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import type { ActionResult } from "@/app/actions/profile";
import type { BackgroundEligibility } from "@/lib/profile";
import type { ProfileStyle } from "@/lib/profile-style";
import type { StoredWidget } from "@/lib/widgets";
import AvatarCard from "@/components/dashboard/AvatarCard";
import CursorCard from "@/components/dashboard/CursorCard";
import DiscordConnectCard from "@/components/dashboard/DiscordConnectCard";
import WidgetHubModal from "@/components/dashboard/WidgetHubModal";
import SoundCard from "@/components/dashboard/SoundCard";
import StyleForm from "@/components/dashboard/StyleForm";
import CustomTemplateCard, {
  type CustomBackgroundAsset,
} from "@/components/dashboard/CustomTemplateCard";
import GlassCard from "@/components/ui/GlassCard";
import Reveal from "@/components/motion/Reveal";
import { CardTitle, PageHeading, btnPrimary } from "@/components/dashboard/form-kit";

export type CustomizeProfile = {
  bio: string;
  accentColor: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
};

/**
 * The Discord connection, resolved on the server from the OAuth grant.
 *
 * `enabled` is false when the Discord application is not configured at all: the
 * card then never mounts, because a connect button that cannot reach Discord is
 * worse than no button. `connected` is the state of the current account.
 *
 * The three fields after it describe the live-presence half of the feature, all
 * answered server-side because only the server may hold a bot token:
 *  - `botConfigured` — DISCORD_BOT_TOKEN + DISCORD_GUILD_ID exist, so the card can
 *    talk about the server at all;
 *  - `inGuild` — are they in our server right now? `null` is "cannot tell", which
 *    shows no hint rather than a wrong one;
 *  - `scopeOutdated` — the grant predates `guilds.join`, so Discord will refuse to
 *    add them and the card must ask for a fresh connection instead.
 */
export type CustomizeDiscord = {
  enabled: boolean;
  connected: boolean;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  botConfigured: boolean;
  inGuild: boolean | null;
  scopeOutdated: boolean;
};

/**
 * The "Customize" page, in the four bands the redesign asked for:
 *   1. File uploader — background, avatar, sound and cursor, each an immediate
 *      two-step upload owned by its own card.
 *   2–4. General / colours / other — a single StyleForm with one sticky save bar.
 *
 * The four media URLs live here and every card resyncs them through `applyMedia`
 * from the full ActionResult the server returns, so an upload in one card can
 * never be undone by a later action in another. The style form writes none of
 * these URLs (its own action skips the media slots), which is why the whole
 * appearance can be edited and saved without any risk to the media.
 */
export default function CustomizeClient({
  profile,
  style,
  eligibility,
  discord,
  plan,
  homeWidgets,
  bgAssets,
  avatarAssets,
  cursorAssets,
  soundAssets,
  maxMb,
  avatarMaxMb,
  soundMaxMb,
}: {
  profile: CustomizeProfile;
  style: ProfileStyle;
  eligibility: BackgroundEligibility;
  discord: CustomizeDiscord;
  /** "FREE" | "PREMIUM" — drives the widget modal's premium lock. */
  plan: string;
  /** Home-page widgets, so the modal can seed each type's field. */
  homeWidgets: StoredWidget[];
  /** Reusable uploads for the background slot (video/GIF only). */
  bgAssets: CustomBackgroundAsset[];
  /** Same query, wider set: an avatar may also be a plain photo. */
  avatarAssets: CustomBackgroundAsset[];
  /** The account's PNG uploads, for the cursor slot. */
  cursorAssets: CustomBackgroundAsset[];
  /** The account's audio uploads, for the sound slot. */
  soundAssets: CustomBackgroundAsset[];
  maxMb: number;
  avatarMaxMb: number;
  soundMaxMb: number;
}) {
  const tp = useTranslations("dashboard.customizePage");
  const tw = useTranslations("dashboard.widgetModal");
  const router = useRouter();
  const refresh = () => router.refresh();

  const [avatar, setAvatar] = useState(profile.avatarUrl ?? "");
  const [bg, setBg] = useState(profile.bannerUrl ?? "");
  const [cursor, setCursor] = useState(style.cursorUrl ?? "");
  const [sound, setSound] = useState(style.soundUrl ?? "");
  const [hubOpen, setHubOpen] = useState(false);

  // Any media action answers with the full stored set, so all four slots resync
  // together and a later save can never write back a stale URL.
  const applyMedia = (data?: ActionResult["data"]) => {
    if (!data) return;
    setAvatar(data.avatarUrl ?? "");
    setBg(data.bannerUrl ?? "");
    setCursor(data.cursorUrl ?? "");
    setSound(data.soundUrl ?? "");
  };

  // `refresh` is used by the modal's post-save router.refresh(); keep the
  // reference alive so an unused-var lint does not fire on this prop.
  void refresh;

  return (
    <main>
      <PageHeading title={tp("title")} subtitle={tp("subtitle")} />

      {/* ===== Section 1 · File uploader ===== */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-softwhite">
          {tp("sections.fileUploader")}
        </h2>
        <p className="-mt-1 mb-4 text-sm text-mutedtext/70">{tp("uploadHint")}</p>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Reveal delay={0.05}>
            <CustomTemplateCard
              eligibility={eligibility}
              currentBannerUrl={bg}
              assets={bgAssets}
              maxMb={maxMb}
              initialClipStartMs={style.bgClipStartMs}
              initialClipEndMs={style.bgClipEndMs}
              onApplied={applyMedia}
            />
          </Reveal>
          <Reveal delay={0.1}>
            <AvatarCard
              avatar={avatar}
              assets={avatarAssets}
              maxMb={avatarMaxMb}
              onMedia={applyMedia}
            />
          </Reveal>
          <Reveal delay={0.15}>
            <SoundCard
              sound={sound}
              assets={soundAssets}
              maxMb={soundMaxMb}
              initialStartMs={style.soundStartMs}
              initialEndMs={style.soundEndMs}
              onMedia={applyMedia}
            />
          </Reveal>
          <Reveal delay={0.2}>
            <CursorCard
              cursor={cursor}
              assets={cursorAssets}
              maxMb={avatarMaxMb}
              onMedia={applyMedia}
            />
          </Reveal>
        </div>
      </section>

      {/* ===== Discord connection: owned by OAuth, so it is not a form field */}
      <Reveal delay={0.05}>
        <div className="mb-8">
          <DiscordConnectCard
            enabled={discord.enabled}
            botConfigured={discord.botConfigured}
            inGuild={discord.inGuild}
            scopeOutdated={discord.scopeOutdated}
            identity={
              discord.connected
                ? {
                    displayName: discord.displayName,
                    username: discord.username,
                    avatarUrl: discord.avatarUrl,
                  }
                : null
            }
          />
          {/* The widget hub trigger: a compact card that opens the modal. The
              modal owns every per-type setting (Discord presence + all embeds),
              so no PresenceWidgetCard is mounted here any more. */}
          <div className="mt-6">
            <GlassCard className="p-6">
              <CardTitle>{tw("title")}</CardTitle>
              <p className="-mt-2 mb-4 text-sm text-mutedtext/70">{tw("subtitle")}</p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-mutedtext">
                  {tw("activeCount", { count: homeWidgets.length })}
                </span>
                <button
                  type="button"
                  onClick={() => setHubOpen(true)}
                  className={btnPrimary}
                >
                  {tw("open")}
                </button>
              </div>
            </GlassCard>
          </div>
        </div>
      </Reveal>

      {/* ===== Sections 2–4 · one form, one save bar ===== */}
      <StyleForm
        profile={profile}
        style={style}
        hasSound={!!sound}
        discordConnected={discord.connected}
      />

      <p className="mt-6 text-sm">
        <Link
          href="/dashboard/templates"
          className="text-plumborder transition-colors hover:text-softwhite"
        >
          {tp("templatesCta")} →
        </Link>
      </p>

      <WidgetHubModal
        open={hubOpen}
        onClose={() => setHubOpen(false)}
        plan={plan}
        widgets={homeWidgets}
        style={style}
        widgetsEnabled={style.widgetsEnabled}
      />
    </main>
  );
}
