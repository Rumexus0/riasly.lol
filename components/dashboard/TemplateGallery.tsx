"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { m } from "framer-motion";

import {
  isUhdResolution,
  templateCategories,
  type Template,
} from "@/lib/backgrounds";
import {
  MAX_FX_LAYERS,
  MOTION_CLASS,
  getRecipeFor,
  type Recipe,
} from "@/lib/template-recipes";
import { setBackgroundUrl, setAvatarUrl } from "@/app/actions/profile";
import { setTemplateHidden } from "@/app/actions/templates";
import { formatCount } from "@/lib/format";
import EffectLayers from "@/components/profile/EffectLayers";
import CatalogUploadCard from "@/components/dashboard/CatalogUploadCard";
import {
  retryCatalogTemplate,
  deleteCatalogTemplate,
  type CatalogResult,
} from "@/app/actions/catalog";

// Same "riasly." key namespace as lib/motion-pref.ts and lib/format.ts: these are
// browser-side only, so they must never collide with a cookie name.
const FAV_KEY = "riasly.tpl.fav";
const RECENT_KEY = "riasly.tpl.recent";

type Tab = "library" | "favorites" | "recent" | "removed";
type Sort = "trend" | "popular" | "newest" | "az";

// The fourth tab is the undo list for admin curation, so it is the only one an
// admin ever sees.
const TABS: Tab[] = ["library", "favorites", "recent", "removed"];

const btnUse =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-pill bg-brandgrad px-4 text-sm font-medium text-white shadow-glow transition-all hover:shadow-glowLg hover:-translate-y-0.5 active:translate-y-0 active:scale-[.98] disabled:opacity-60";

// Ghost twin of btnUse: same height and radius so the pair sits on one line,
// but visually secondary — applying a template as the background is the main
// action, using its poster as an avatar is the side effect.
const btnAvatar =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-pill border border-white/10 bg-white/[0.02] px-4 text-sm font-medium text-softwhite transition-all hover:border-plumborder hover:shadow-glow active:scale-[.98] disabled:opacity-60";

// Curation, not destruction: the same ghost shape with a red hover edge, because
// "remove" here is reversible and must not look like deleting somebody's file.
const btnRemove =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-pill border border-white/10 bg-transparent px-4 text-sm font-medium text-mutedtext/80 transition-all hover:border-red-400/50 hover:text-red-200 active:scale-[.98] disabled:opacity-60";

function readIds(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// An admin-rendered catalog row (the only kind that is hard-deletable) is
// identifiable by its id shape — the same /^up-[a-z0-9]{4,20}$/ rule
// lib/catalog.ts uses. The 65 code-catalog entries (sp-/ne-/st-…) are never
// deletable, so the button must not appear for them. Kept as a literal because
// this client file cannot import the server-only lib/catalog module.
function isCatalogRow(id: string): boolean {
  return /^up-[a-z0-9]{4,20}$/.test(id);
}

// Shape of an admin row that is not READY yet, passed down from the page. Defined
// locally so this client file never imports the server-only lib/catalog module.
export type PendingCard = {
  id: string;
  name: string;
  status: "RENDERING" | "FAILED";
  failure: string | null;
  thumb: string;
};

export default function TemplateGallery({
  currentBannerUrl,
  currentAvatarUrl,
  canAdmin,
  hiddenIds,
  items,
  pending,
  maxMb,
}: {
  currentBannerUrl: string | null;
  // Only used to mark the card whose poster is currently the avatar.
  currentAvatarUrl: string | null;
  // Admins curate the gallery itself: every card gains a remove button and a
  // "removed" tab appears. The server action re-checks this, always.
  canAdmin: boolean;
  /** Template ids hidden in the database (HiddenTemplate). */
  hiddenIds: string[];
  // The merged gallery (code catalog + admin READY rows), resolved server-side.
  items: Template[];
  // Admin rows still encoding or failed: drives the pending strip and the poll.
  pending: PendingCard[];
  // Upload ceiling for the admin intake panel (CATALOG_MAX_MB).
  maxMb: number;
}) {
  const t = useTranslations("templates");
  const td = useTranslations("dashboard");
  const tc = useTranslations("dashboard.customizePage");
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("library");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("trend");
  const [favs, setFavs] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAvatar, setBusyAvatar] = useState<string | null>(null);
  const [busyRemove, setBusyRemove] = useState<string | null>(null);
  // Which card is asking "are you sure". Cleared by arming another card, so a
  // half-finished click can never linger and fire on the wrong one.
  const [armedRemove, setArmedRemove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Pending-render admin controls, kept separate from the gallery's own remove
  // arming so a delete confirmation can't cross over onto a curated card.
  const [busyRetry, setBusyRetry] = useState<string | null>(null);
  const [busyDelete, setBusyDelete] = useState<string | null>(null);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  // Set when a delete was refused because profiles still use the template; the
  // button then offers an explicit force (which clears those references first).
  const [forceArm, setForceArm] = useState<string | null>(null);

  // Hydrate localStorage after mount (avoids SSR hydration mismatch).
  useEffect(() => {
    setFavs(readIds(FAV_KEY));
    setRecent(readIds(RECENT_KEY));
  }, []);

  // A cheap poll of /api/catalog-status — deliberately NOT /dashboard/templates,
  // which runs queueBadgeSync on every render. It refreshes the page only when the
  // pending set actually changes (a render landing, or a failure flipping status),
  // so the timer never becomes badge-sync spam.
  const pendingSig = pending.map((p) => `${p.id}:${p.status}`).join(",");
  const lastSigRef = useRef(pendingSig);
  useEffect(() => {
    lastSigRef.current = pendingSig;
  }, [pendingSig]);
  useEffect(() => {
    if (!canAdmin || pending.length === 0) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const r = await fetch("/api/catalog-status");
        if (!r.ok) return;
        const data = (await r.json()) as { pending: PendingCard[] };
        const sig = data.pending.map((p) => `${p.id}:${p.status}`).join(",");
        if (!stopped && sig !== lastSigRef.current) {
          lastSigRef.current = sig;
          router.refresh();
        }
      } catch {
        /* one transient failure; the next tick retries */
      }
    }, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [canAdmin, pending.length, router]);

  function persist(key: string, ids: string[]) {
    try {
      window.localStorage.setItem(key, JSON.stringify(ids));
    } catch {
      /* ignore quota / privacy mode */
    }
  }

  function toggleFav(id: string) {
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
      persist(FAV_KEY, next);
      return next;
    });
  }

  function addRecent(id: string) {
    setRecent((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 24);
      persist(RECENT_KEY, next);
      return next;
    });
  }

  // A template's motion + effects come from lib/template-recipes.ts. Resolved
  // once per catalog here (not per render) so a card can preview exactly what
  // will run on the profile later.
  const byId = useMemo(
    () => new Map(items.map((tpl) => [tpl.id, tpl])),
    [items]
  );
  const recipeById = useMemo(
    () => new Map(items.map((tpl) => [tpl.id, getRecipeFor(tpl)])),
    [items]
  );
  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds]);

  const source: Template[] = useMemo(() => {
    if (tab === "removed") return items.filter((tpl) => hiddenSet.has(tpl.id));
    const base =
      tab === "favorites"
        ? favs.map((id) => byId.get(id))
        : tab === "recent"
          ? recent.map((id) => byId.get(id))
          : items;
    return base.filter(
      (tpl): tpl is Template => !!tpl && !hiddenSet.has(tpl.id)
    );
  }, [tab, favs, recent, byId, hiddenSet, items]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const tpl of source) {
      map.set(tpl.category, (map.get(tpl.category) ?? 0) + 1);
    }
    return map;
    // Counts follow the tab's list, not the search box: a chip answers "how many
    // of these are in the gallery", which is also what removing one changes.
  }, [source]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = source.filter((tpl) => {
      if (category !== "all" && tpl.category !== category) return false;
      if (!q) return true;
      return (
        tpl.name.toLowerCase().includes(q) ||
        tpl.author.toLowerCase().includes(q) ||
        tpl.category.toLowerCase().includes(q) ||
        tpl.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "newest":
          return b.createdAt.localeCompare(a.createdAt);
        case "az":
          return a.name.localeCompare(b.name);
        case "popular":
        case "trend":
        default: {
          // `usage` is now a measured count, so ties are the normal case rather
          // than a curiosity: a brand-new gallery has 0 on every card. Without a
          // tie-breaker the order would fall back to whatever the server returned
          // and shuffle between reloads, so the tie-breakers are the two things a
          // visitor can read on the card itself: newest first, then name.
          if (b.usage !== a.usage) return b.usage - a.usage;
          const age = b.createdAt.localeCompare(a.createdAt);
          if (age !== 0) return age;
          return a.name.localeCompare(b.name);
        }
      }
    });
    return list;
  }, [source, query, category, sort]);

  async function onUse(tpl: Template) {
    setBusyId(tpl.id);
    setError(null);
    const res = await setBackgroundUrl(tpl.url, tpl.accent);
    setBusyId(null);
    if (res.ok) {
      addRecent(tpl.id);
      router.refresh();
    } else {
      setError(
        res.error === "unauthorized"
          ? td("errors.unauthorized")
          : res.error === "badmedia"
            ? td("errors.badmedia")
            : td("errors.invalid")
      );
    }
  }

  async function onUseAvatar(tpl: Template) {
    setBusyAvatar(tpl.id);
    setError(null);
    // The poster, never the wall file: a 112px circle must not pull a 4K render
    // per visit, and the poster is the frame that render opens on.
    const res = await setAvatarUrl(tpl.thumb);
    setBusyAvatar(null);
    if (res.ok) {
      // Deliberately no addRecent(): the recent list tracks backgrounds, and
      // an avatar change says nothing about which wall the user wants next.
      router.refresh();
    } else {
      setError(
        res.error === "unauthorized"
          ? td("errors.unauthorized")
          : res.error === "badmedia"
            ? td("errors.badmedia")
            : td("errors.invalid")
      );
    }
  }

  async function onRemove(tpl: Template) {
    const hide = tab !== "removed";
    if (hide && armedRemove !== tpl.id) {
      // Two steps on purpose: one stray click while browsing should never curate
      // the gallery. Restoring is a single step — it cannot lose anything.
      setArmedRemove(tpl.id);
      setError(null);
      return;
    }
    setArmedRemove(null);
    setBusyRemove(tpl.id);
    setError(null);
    const res = await setTemplateHidden(tpl.id, hide);
    setBusyRemove(null);
    if (res.ok) {
      // The hidden ids and the counts come from the server, so this is what makes
      // the card move to the other tab.
      router.refresh();
    } else {
      setError(
        res.error === "unauthorized"
          ? td("errors.unauthorized")
          : // The shared dashboard.errors.forbidden copy talks about badges, so
            // curation gets its own sentence — the server refused the action,
            // not somebody else's badge.
            res.error === "forbidden"
              ? t("forbiddenAdmin")
              : td("errors.invalid")
      );
    }
  }

  // Map a catalog action's render-pipeline code onto its own admin copy.
  function messageForCatalog(res: CatalogResult): string {
    switch (res.error) {
      case "forbidden":
      case "unauthorized":
        return t("admin.forbidden");
      case "busy":
        return t("admin.busy");
      case "unsupported":
        return t("admin.unsupported");
      case "missing":
        return t("admin.noFile");
      case "inuse":
        return t("admin.inUse");
      case "invalid":
        return t("admin.invalid");
      default:
        return t("admin.uploadError");
    }
  }

  async function onRetry(id: string) {
    setBusyRetry(id);
    setError(null);
    const res = await retryCatalogTemplate(id);
    setBusyRetry(null);
    if (res.ok) router.refresh();
    else setError(messageForCatalog(res));
  }

  async function onCatalogDelete(id: string, force = false) {
    // Same two-step arming as remove: one stray click must never destroy bytes.
    setError(null);
    if (!force && armedDelete !== id) {
      setArmedDelete(id);
      setForceArm(null);
      return;
    }
    setArmedDelete(null);
    setForceArm(null);
    setBusyDelete(id);
    const res = await deleteCatalogTemplate(id, force);
    setBusyDelete(null);
    if (res.ok) {
      router.refresh();
      return;
    }
    if (res.error === "inuse") {
      // Don't dead-end: offer the explicit force step with the blocker count.
      setForceArm(id);
      setError(t("admin.forceDeleteInUse", { count: res.count ?? 0 }));
      return;
    }
    setError(messageForCatalog(res));
  }

  return (
    <div className="relative isolate">
      {/* The gallery sells motion, so the page that hosts it moves too — one
          slow gradient pan behind everything, at a weight you only notice when
          it is missing. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-72 animate-gradient-pan bg-brandgrad opacity-[0.07] [background-size:300%_300%]"
      />
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-softwhite sm:text-3xl">{t("title")}</h1>
        <p className="mt-1 text-mutedtext/80">{t("subtitle")}</p>
        {canAdmin && (
          <p className="mt-2 text-xs text-mutedtext/60">{t("adminOnlyHint")}</p>
        )}
      </header>

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(canAdmin ? TABS : TABS.slice(0, 3)).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-pill px-4 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? "bg-plum/30 text-softwhite ring-1 ring-plumborder"
                : "text-mutedtext hover:bg-white/5 hover:text-softwhite"
            }`}
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </div>

      {/* Controls: search + sort */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          className="h-11 w-full rounded-field border border-white/10 bg-white/[0.02] px-4 text-softwhite placeholder:text-mutedtext/40 transition focus:border-plumborder focus:shadow-glow focus:outline-none"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="h-11 shrink-0 rounded-field border border-white/10 bg-white/[0.02] px-3 text-softwhite transition focus:border-plumborder focus:outline-none"
        >
          <option value="trend" className="bg-nearblack">{t("sort.trend")}</option>
          <option value="popular" className="bg-nearblack">{t("sort.popular")}</option>
          <option value="newest" className="bg-nearblack">{t("sort.newest")}</option>
          <option value="az" className="bg-nearblack">{t("sort.az")}</option>
        </select>
      </div>

      {/* Category chips — each one prints how many templates it will show. */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Chip active={category === "all"} onClick={() => setCategory("all")}>
          {t("all")}
          <span className="ml-1.5 opacity-50">{source.length}</span>
        </Chip>
        {templateCategories.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
            {c}
            <span className="ml-1.5 opacity-50">{counts.get(c) ?? 0}</span>
          </Chip>
        ))}
      </div>

      {/* Admin intake + pending renders. Library tab only: this is a creation
          surface, not something to surface while browsing favorites. */}
      {canAdmin && tab === "library" && (
        <>
          <CatalogUploadCard categories={templateCategories} maxMb={maxMb} />
          {pending.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-mutedtext/70">
                {t("admin.pendingTitle")}
              </h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {pending.map((p) => (
                  <div
                    key={p.id}
                    className="overflow-hidden rounded-card border border-white/10 bg-white/[0.02]"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-nearblack">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.thumb}
                        alt={p.name}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                        className="h-full w-full object-cover"
                      />
                      <span
                        className={`absolute left-2 top-2 rounded-pill px-2.5 py-1 text-xs font-semibold ${
                          p.status === "RENDERING"
                            ? "bg-nearblack/60 text-softwhite backdrop-blur"
                            : "bg-red-500/80 text-white"
                        }`}
                      >
                        {p.status === "RENDERING"
                          ? t("admin.rendering")
                          : t("admin.failedTitle")}
                      </span>
                    </div>
                    <div className="p-4">
                      <h3 className="truncate font-semibold text-softwhite">{p.name}</h3>
                      {p.status === "RENDERING" ? (
                        <>
                          <p className="mt-1 text-xs text-mutedtext/60">
                            {t("admin.renderHint")}
                          </p>
                          <button
                            type="button"
                            disabled
                            className={`${btnUse} mt-3 w-full`}
                          >
                            {t("use")}
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="mt-1 text-xs text-red-300/80">
                            {p.failure ?? t("admin.failedTitle")}
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              disabled={busyRetry === p.id}
                              onClick={() => onRetry(p.id)}
                              className={`${btnUse} flex-1`}
                            >
                              {busyRetry === p.id ? t("admin.submitting") : t("admin.retry")}
                            </button>
                            <button
                              type="button"
                              disabled={busyDelete === p.id}
                              onClick={() => onCatalogDelete(p.id)}
                              className={`${btnRemove} flex-1`}
                            >
                              {busyDelete === p.id
                                ? t("admin.delete")
                                : armedDelete === p.id
                                  ? t("admin.confirmDelete")
                                  : t("admin.delete")}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="mb-4 text-sm text-red-300">{error}</p>}

      {visible.length === 0 ? (
        <p className="py-16 text-center text-mutedtext/70">
          {tab === "recent"
            ? t("noneRecent")
            : tab === "removed"
              ? t("removedEmpty")
              : t("empty")}
        </p>
      ) : (
        <m.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {visible.map((tpl) => {
            const applied = !!currentBannerUrl && currentBannerUrl === tpl.url;
            const avatarInUse = !!currentAvatarUrl && currentAvatarUrl === tpl.thumb;
            const isFav = favs.includes(tpl.id);
            const recipe: Recipe = recipeById.get(tpl.id) ?? {
              motion: null,
              fx: [],
            };
            const hovered = hoverId === tpl.id;
            return (
              <div
                key={tpl.id}
                onMouseEnter={() => setHoverId(tpl.id)}
                onMouseLeave={() =>
                  setHoverId((h) => (h === tpl.id ? null : h))
                }
                className="group overflow-hidden rounded-card border border-white/10 bg-white/[0.02] transition-all duration-300 hover:-translate-y-0.5 hover:border-plumborder hover:shadow-glow"
              >
                {/* thumb (gradient fallback behind image) */}
                <div
                  className="relative aspect-[4/3] w-full overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${tpl.accent ?? "#7C3AED"}, #0A0A0A)` }}
                >
                  {/* Hover-only motion: 65 cards must not run 65 loops, and this
                      is the same class the profile uses, so what you preview here
                      is literally what you get. The scale transition stays on the
                      <img> — a keyframe transform and a transition transform on
                      the same element would fight over one property. */}
                  <div
                    className={`h-full w-full ${
                      hovered && recipe.motion ? MOTION_CLASS[recipe.motion] : ""
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={tpl.thumb}
                      alt={tpl.name}
                      loading="lazy"
                      decoding="async"
                      // A poster that cannot load (a render not built yet, a fresh
                      // clone with no media) collapses to the accent gradient this
                      // card was given, so a broken file never shows a broken icon.
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  {/* hover preview: play the loop only while hovered (perf), and
                      play the 720p proxy — 65 cards must never pull 65 wall-sized
                      files just because a mouse crossed them. A transitional entry
                      whose render is missing still has its external loop as `url`. */}
                  {tpl.kind === "video" && hovered && (
                    <video
                      className="absolute inset-0 h-full w-full object-cover"
                      src={tpl.preview ?? tpl.url}
                      poster={tpl.thumb}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="none"
                    />
                  )}
                  {hovered && (
                    <EffectLayers
                      fx={recipe.fx}
                      accent={tpl.accent ?? "#8B5CF6"}
                      compact
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => toggleFav(tpl.id)}
                    aria-label={isFav ? t("unfavorite") : t("favorite")}
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-nearblack/50 backdrop-blur transition-colors hover:bg-nearblack/70"
                  >
                    <StarIcon filled={isFav} />
                  </button>
                  {(applied || avatarInUse) && (
                    <div className="absolute left-2 top-2 flex gap-1.5">
                      {applied && (
                        <span className="rounded-pill bg-brandgrad px-2.5 py-1 text-xs font-semibold text-white shadow-glow">
                          {t("applied")}
                        </span>
                      )}
                      {avatarInUse && (
                        <span className="rounded-pill border border-plumborder bg-nearblack/60 px-2.5 py-1 text-xs font-semibold text-softwhite backdrop-blur">
                          {t("avatarApplied")}
                        </span>
                      )}
                    </div>
                  )}
                  <span className="absolute bottom-2 left-2 rounded-pill bg-nearblack/60 px-2.5 py-1 text-xs font-medium text-softwhite backdrop-blur">
                    {tpl.kind === "video" && isUhdResolution(tpl.resolution)
                      ? t("badgeUhd")
                      : tpl.kind === "video"
                        ? t("badgeVideo")
                        : tpl.kind === "gif"
                          ? t("badgeGif")
                          : t("badgeStill")}
                  </span>
                </div>

                <div className="p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate font-semibold text-softwhite">{tpl.name}</h3>
                  </div>
                  <p className="truncate text-sm text-mutedtext/70">@{tpl.author}</p>
                  {/* Measured facts, so "4K" is a number and not a promise. A
                      stock loop that was stretched to UHD prints its own pixel
                      size and says where those pixels came from. */}
                  {(tpl.resolution || tpl.sizeMb) && (
                    <p className="mt-0.5 truncate text-xs text-mutedtext/50">
                      {tpl.resolution ?? t("tierHd")}
                      {tpl.sizeMb ? ` · ${tpl.sizeMb.toFixed(1)} MB` : ""}
                      {tpl.upscaled ? ` · ${t("upscaledNote")}` : ""}
                    </p>
                  )}

                  <div className="mt-2 flex items-center gap-2 text-xs text-mutedtext/60">
                    <EyeIcon />
                    <span>{formatCount(tpl.usage)} {t("usage")}</span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {tpl.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-pill bg-white/5 px-2 py-0.5 text-xs text-mutedtext"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* The recipe, spelled out: which drift runs and which layers
                      sit on top. Hovering the card shows it; this says it. */}
                  <p className="mt-2 truncate text-xs text-mutedtext/60">
                    <span className="text-softwhite/80">
                      {t(`motionNames.${recipe.motion ?? "none"}`)}
                    </span>
                    {recipe.fx.length > 0 &&
                      ` · ${recipe.fx
                        .slice(0, MAX_FX_LAYERS)
                        .map((key) => t(`fx.${key}`))
                        .join(", ")}`}
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={busyId === tpl.id || applied}
                      onClick={() => onUse(tpl)}
                      className={btnUse}
                    >
                      {applied ? t("applied") : busyId === tpl.id ? t("applying") : t("use")}
                    </button>
                    <button
                      type="button"
                      disabled={busyAvatar === tpl.id || avatarInUse}
                      onClick={() => onUseAvatar(tpl)}
                      className={btnAvatar}
                    >
                      {avatarInUse
                        ? t("avatarApplied")
                        : busyAvatar === tpl.id
                          ? t("avatarApplying")
                          : t("useAvatar")}
                    </button>
                  </div>

                  {/* Admin curation, on its own line: three buttons in a 230px
                      card would truncate every label to nothing. */}
                  {canAdmin && (
                    <>
                      <button
                        type="button"
                        disabled={busyRemove === tpl.id}
                        onClick={() => onRemove(tpl)}
                        className={`${btnRemove} mt-2 w-full`}
                      >
                        {busyRemove === tpl.id
                          ? tab === "removed"
                            ? t("restoring")
                            : t("removing")
                          : tab === "removed"
                            ? t("restore")
                            : armedRemove === tpl.id
                              ? t("confirmRemove")
                              : t("remove")}
                      </button>
                      {/* Hard-delete only for admin-rendered catalog rows (the
                          pending strip has its own). Two-step, and a refusal on
                          "in use" upgrades the next click to an explicit force. */}
                      {isCatalogRow(tpl.id) && (
                        <button
                          type="button"
                          disabled={busyDelete === tpl.id}
                          onClick={() => onCatalogDelete(tpl.id, forceArm === tpl.id)}
                          className={`${btnRemove} mt-2 w-full`}
                        >
                          {busyDelete === tpl.id
                            ? t("admin.delete")
                            : forceArm === tpl.id
                              ? t("admin.forceDelete")
                              : armedDelete === tpl.id
                                ? t("admin.confirmDelete")
                                : t("admin.delete")}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </m.div>
      )}

      {/* Uploads moved to /dashboard/customize — the gallery is browse-only. */}
      <p className="mt-6 text-sm">
        <Link
          href="/dashboard/customize"
          className="text-plumborder transition-colors hover:text-softwhite"
        >
          {tc("uploadHere")} →
        </Link>
      </p>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-pill px-3.5 py-1.5 text-sm transition-colors ${
        active
          ? "bg-plum/30 text-softwhite ring-1 ring-plumborder"
          : "border border-white/10 bg-white/[0.02] text-mutedtext hover:border-plumborder hover:text-softwhite"
      }`}
    >
      {children}
    </button>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill={filled ? "#FACC15" : "none"}
      stroke={filled ? "#FACC15" : "#FAFAFA"}
      strokeWidth={2}
      aria-hidden
    >
      <path d="M12 2l3 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.9 21l1.2-6.8-5-4.9 6.9-1L12 2z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
