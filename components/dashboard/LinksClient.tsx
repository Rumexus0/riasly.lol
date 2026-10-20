"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  addBioLink,
  addSocialLink,
  deleteBioLink,
  deleteSocialLink,
} from "@/app/actions/profile";
import { PLATFORMS } from "@/lib/platforms";
import SocialIcon, { platformBrand } from "@/components/icons/SocialIcon";
import GlassCard from "@/components/ui/GlassCard";
import Reveal from "@/components/motion/Reveal";
import {
  CardTitle,
  FeedbackLine,
  PageHeading,
  btnDanger,
  btnPrimary,
  inputCls,
  useFeedback,
} from "@/components/dashboard/form-kit";

type SocialItem = {
  id: string;
  platform: string;
  url: string;
  username: string | null;
  isVerified: boolean;
};
type LinkItem = { id: string; label: string; url: string };

// Discord is connected via the OAuth grant, never a SocialLink row. When the
// owner has linked Discord we light its tile from this synthetic row so the
// ✓/ring/label all resolve from the same `row` the other platforms use. The
// empty id marks it as OAuth-owned: it must not open the URL form or a delete.
const DISCORD_VIRTUAL: SocialItem = {
  id: "",
  platform: "Discord",
  url: "",
  username: null,
  isVerified: true,
};

export default function LinksClient({
  socials,
  links,
  discordConnected = false,
}: {
  socials: SocialItem[];
  links: LinkItem[];
  discordConnected?: boolean;
}) {
  const t = useTranslations("dashboard");
  const tp = useTranslations("dashboard.linksPage");
  const router = useRouter();
  const refresh = () => router.refresh();

  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { fb, report } = useFeedback();
  // The first field of the custom-link form: the "+" tile scrolls to it and
  // focuses it, so the tile is a real keyboard shortcut rather than just an anchor.
  const customRef = useRef<HTMLInputElement>(null);
  const connected = new Map(socials.map((s) => [s.platform, s]));
  const active = selected ? connected.get(selected) : undefined;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    const res = await addSocialLink(new FormData(form));
    setBusy(false);
    report(res);
    if (res.ok) {
      setSelected(null);
      form.reset();
    }
    refresh();
  }

  async function onDisconnect(id: string) {
    setBusy(true);
    report(await deleteSocialLink(id));
    setSelected(null);
    setBusy(false);
    refresh();
  }

  function openCustom() {
    setSelected(null);
    customRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    customRef.current?.focus({ preventScroll: true });
  }

  return (
    <main>
      <PageHeading title={tp("title")} subtitle={tp("subtitle")} />

      <Reveal>
        <GlassCard className="p-6">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle>{tp("gridTitle")}</CardTitle>
            <p className="text-xs text-mutedtext/70">
              {tp("connectedCount", {
                count:
                  socials.length +
                  (discordConnected && !connected.has("Discord") ? 1 : 0),
                total: PLATFORMS.length,
              })}
            </p>
          </div>
          <p className="mb-4 text-sm text-mutedtext/80">{tp("gridHint")}</p>

          {/* Platform picker: one tile per platform we support */}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {PLATFORMS.map((p) => {
              const row =
                connected.get(p) ??
                (p === "Discord" && discordConnected ? DISCORD_VIRTUAL : undefined);
              const isSame = selected === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelected((cur) => (cur === p ? null : p))}
                  aria-label={`${p} — ${row ? tp("connected") : tp("notConnected")}`}
                  aria-pressed={isSame}
                  style={{
                    ["--brand" as string]:
                      platformBrand[p as keyof typeof platformBrand] ??
                      platformBrand.Other,
                  }}
                  className={`relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-card border border-white/10 px-2 text-center transition-all duration-300 hover:-translate-y-0.5 focus:outline-none focus-visible:border-plumborder ${
                    row
                      ? "bg-white/[0.04] text-[color:var(--brand)] ring-1 ring-[color:var(--brand)]/60 shadow-[0_0_26px_-8px_var(--brand)]"
                      : "bg-white/[0.02] text-mutedtext/70 hover:border-plumborder hover:text-softwhite hover:shadow-glow"
                  } ${isSame ? "border-plumborder ring-1 ring-plumborder" : ""}`}
                >
                  {row && (
                    <span
                      aria-hidden
                      className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-plum text-[10px] font-bold text-softwhite"
                    >
                      ✓
                    </span>
                  )}
                  <SocialIcon platform={p as never} className="h-7 w-7" />
                  <span className="w-full truncate text-xs font-medium">{p}</span>
                  {row?.username && (
                    <span className="w-full truncate text-[11px] text-mutedtext/60">
                      @{row.username}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Custom link tile — the "everything else" entry guns.lol has */}
            <button
              type="button"
              onClick={openCustom}
              aria-label={tp("customTile")}
              className="relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-white/15 bg-white/[0.02] px-2 text-mutedtext/70 transition-all duration-300 hover:-translate-y-0.5 hover:border-plumborder hover:text-softwhite hover:shadow-glow focus:outline-none focus-visible:border-plumborder"
            >
              <span className="flex h-7 w-7 items-center justify-center text-xl leading-none">
                +
              </span>
              <span className="w-full truncate text-xs font-medium">
                {tp("customTile")}
              </span>
            </button>
          </div>

          {/* Inline connect / edit panel: opens under the picker, grid stays put */}
          {/* Discord is OAuth-owned: when its virtual tile is selected there is
              no URL row to edit, so show where it is actually managed instead of
              the connect form (which would POST a shadow SocialLink). */}
          {selected && active?.id === "" && (
            <div className="mt-5 rounded-card border border-white/10 bg-white/[0.02] p-4">
              <p className="text-sm text-mutedtext">{tp("discordManagedElsewhere")}</p>
            </div>
          )}
          {selected && active?.id !== "" && (
            <form
              // Remount per platform so the fields always prefill the right row
              // (an already-connected tile doubles as "change").
              key={selected}
              onSubmit={onSubmit}
              className="mt-5 rounded-card border border-white/10 bg-white/[0.02] p-4"
            >
              <p className="mb-3 text-sm font-semibold text-softwhite">
                {active
                  ? `${tp("edit")} · ${selected}`
                  : tp("openForm", { platform: selected })}
              </p>
              <input type="hidden" name="platform" value={selected} />
              <div className="flex flex-col gap-2 sm:flex-row">
              <input
                name="url"
                required
                type="url"
                defaultValue={active?.url ?? ""}
                placeholder={t("fields.profileUrl")}
                className={inputCls}
              />
                <input
                  name="username"
                  type="text"
                  defaultValue={active?.username ?? ""}
                  placeholder={`${t("fields.username")} · ${t("fields.optional")}`}
                  className={inputCls}
                />
                <button type="submit" disabled={busy} className={btnPrimary}>
                  {busy
                    ? t("actions.saving")
                    : active
                      ? tp("replace")
                      : t("actions.connect")}
                </button>
              </div>
              <div className="mt-3 flex items-center gap-4">
                {/* Re-clicking the tile closes this panel, so no cancel button. */}
                {active && (
                  <button
                    type="button"
                    onClick={() => onDisconnect(active.id)}
                    className={btnDanger}
                  >
                    {tp("removeOne")}
                  </button>
                )}
              </div>
              <p className="mt-3 text-xs text-mutedtext/60">{tp("socialList")}</p>
            </form>
          )}
          {!selected && socials.length === 0 && (
            <p className="mt-4 text-sm text-mutedtext/70">{tp("noneYet")}</p>
          )}
          <FeedbackLine fb={fb} />
        </GlassCard>
      </Reveal>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Reveal delay={0.05}>
          <BioLinksCard links={links} refresh={refresh} labelRef={customRef} />
        </Reveal>

        {socials.length > 0 && (
          <Reveal delay={0.1}>
            <GlassCard className="p-6">
              <CardTitle>{tp("listTitle")}</CardTitle>
              <ul className="space-y-2">
                {socials.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-card border border-white/5 bg-white/[0.02] px-4 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        style={{
                          ["--brand" as string]:
                            platformBrand[s.platform as keyof typeof platformBrand] ??
                            platformBrand.Other,
                        }}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-micro bg-white/5 text-[color:var(--brand)] ring-1 ring-white/10"
                      >
                        <SocialIcon platform={s.platform as never} className="h-4 w-4" />
                      </span>
                      <span className="truncate text-softwhite">{s.platform}</span>
                      {s.username && (
                        <span className="truncate text-sm text-mutedtext/70">
                          @{s.username}
                        </span>
                      )}
                      {s.isVerified && (
                        <span className="shrink-0 rounded-pill bg-plum/40 px-2 text-xs text-softwhite">
                          ✓
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <button
                        onClick={() => setSelected(s.platform)}
                        className="text-sm text-plumborder transition-colors hover:text-softwhite"
                      >
                        {tp("edit")}
                      </button>
                      <button onClick={() => onDisconnect(s.id)} className={btnDanger}>
                        {tp("removeOne")}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </GlassCard>
          </Reveal>
        )}
      </div>
    </main>
  );
}

/** Free-label links, the section that used to live on the overview page. */
function BioLinksCard({
  links,
  refresh,
  labelRef,
}: {
  links: LinkItem[];
  refresh: () => void;
  labelRef: React.Ref<HTMLInputElement>;
}) {
  const t = useTranslations("dashboard");
  const tp = useTranslations("dashboard.linksPage");
  const [busy, setBusy] = useState(false);
  const { fb, report } = useFeedback();

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    const res = await addBioLink(new FormData(form));
    setBusy(false);
    report(res);
    if (res.ok) form.reset();
    refresh();
  }

  async function onDelete(id: string) {
    report(await deleteBioLink(id));
    refresh();
  }

  return (
    <GlassCard className="p-6">
      <div>
        <CardTitle>{tp("customTitle")}</CardTitle>
        <form onSubmit={onAdd} className="mb-4 flex flex-col gap-2 sm:flex-row">
          <input
            ref={labelRef}
            name="label"
            required
            placeholder={t("fields.label")}
            className={inputCls}
          />
          <input
            name="url"
            required
            type="url"
            placeholder={t("fields.urlPlaceholder")}
            className={inputCls}
          />
          <button type="submit" disabled={busy} className={btnPrimary}>
            {t("actions.add")}
          </button>
        </form>
        <ul className="space-y-2">
          {links.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded-card border border-white/5 bg-white/[0.02] px-4 py-2.5"
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate font-medium text-softwhite">{l.label}</span>
                <span className="truncate text-sm text-mutedtext/70">{l.url}</span>
              </span>
              <button onClick={() => onDelete(l.id)} className={btnDanger}>
                {t("actions.delete")}
              </button>
            </li>
          ))}
          {links.length === 0 && (
            <li className="text-sm text-mutedtext/70">{t("empty.links")}</li>
          )}
        </ul>
        <FeedbackLine fb={fb} />
      </div>
    </GlassCard>
  );
}
