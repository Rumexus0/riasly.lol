"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { deleteWidget, addPage, deletePage, type WidgetResult } from "@/app/actions/widgets";
import { FREE_PAGE_LIMIT, type StoredWidget } from "@/lib/widgets";
import type { ProfileStyle } from "@/lib/profile-style";
import GlassCard from "@/components/ui/GlassCard";
import Reveal from "@/components/motion/Reveal";
import WidgetHubModal from "@/components/dashboard/WidgetHubModal";
import {
  CardTitle,
  FeedbackLine,
  PageHeading,
  btnDanger,
  btnPrimary,
  inputCls,
  type Feedback,
} from "@/components/dashboard/form-kit";

type PageItem = { id: string; slug: string; title: string; widgets: StoredWidget[] };

export default function WidgetsClient({
  plan,
  handle,
  homeWidgets,
  pages,
  style,
  widgetsEnabled,
}: {
  plan: string;
  handle: string;
  homeWidgets: StoredWidget[];
  pages: PageItem[];
  style: ProfileStyle;
  widgetsEnabled: boolean;
}) {
  const tp = useTranslations("dashboard.widgetsPage");
  const tw = useTranslations("dashboard.widgetModal");
  const [busy, setBusy] = useState(false);
  const [fb, setFb] = useState<Feedback>(null);
  const [hubOpen, setHubOpen] = useState(false);
  const router = useRouter();
  const refresh = () => router.refresh();

  const isFree = plan === "FREE";

  function report(res: WidgetResult) {
    if (res.ok) {
      setFb({ kind: "ok", msg: tp("saved") });
      return;
    }
    const key =
      res.error === "limit"
        ? "errors.limit"
        : res.error === "missing"
          ? "errors.missing"
          : res.error === "unauthorized"
            ? "errors.unauthorized"
            : "errors.invalid";
    setFb({ kind: "err", msg: tp(key) });
  }

  async function onRemoveWidget(id: string) {
    setBusy(true);
    report(await deleteWidget(id));
    setBusy(false);
    refresh();
  }

  return (
    <main>
      <PageHeading title={tp("title")} subtitle={tp("subtitle")} />

      {/* The widget hub trigger — the same modal the customize page opens. It
          owns every per-type setting (all types + extra-tab targeting), so the
          old inline "pick a type" grid + add-form is gone from this page. */}
      <Reveal>
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
              disabled={busy}
              className={btnPrimary}
            >
              {tw("open")}
            </button>
          </div>
          <FeedbackLine fb={fb} />
        </GlassCard>
      </Reveal>

      <div className="mt-6">
        <Reveal delay={0.05}>
          <GlassCard className="p-6">
            <CardTitle>{tp("list.title")}</CardTitle>
            <WidgetList widgets={homeWidgets} onRemove={onRemoveWidget} empty={tp("list.empty")} />
          </GlassCard>
        </Reveal>
      </div>

      <div className="mt-6">
        <Reveal delay={0.1}>
          <PagesCard
            pages={pages}
            isFree={isFree}
            refresh={refresh}
            setFb={setFb}
            tp={tp}
            handle={handle}
            onRemoveWidget={onRemoveWidget}
          />
        </Reveal>
      </div>

      <WidgetHubModal
        open={hubOpen}
        onClose={() => setHubOpen(false)}
        plan={plan}
        style={style}
        widgetsEnabled={widgetsEnabled}
        widgets={homeWidgets}
        pages={pages.map((p) => ({ id: p.id, title: p.title, widgets: p.widgets }))}
      />
    </main>
  );
}

function WidgetList({
  widgets,
  onRemove,
  empty,
}: {
  widgets: StoredWidget[];
  onRemove: (id: string) => void;
  empty: string;
}) {
  const tp = useTranslations("dashboard.widgetsPage");
  if (widgets.length === 0) return <p className="text-sm text-mutedtext/70">{empty}</p>;
  return (
    <ul className="space-y-2">
      {widgets.map((w) => (
        <li
          key={w.id}
          className="flex items-center justify-between rounded-card border border-white/5 bg-white/[0.02] px-4 py-2.5"
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 rounded-pill bg-plum/40 px-2 text-xs text-softwhite">
              {tp(`types.${w.type}`)}
            </span>
            <span className="truncate font-medium text-softwhite">{w.label}</span>
            {w.sourceUrl && (
              <span className="truncate text-sm text-mutedtext/70">{w.sourceUrl}</span>
            )}
          </span>
          <button onClick={() => onRemove(w.id)} className={btnDanger}>
            {tp("remove")}
          </button>
        </li>
      ))}
    </ul>
  );
}

function PagesCard({
  pages,
  isFree,
  refresh,
  setFb,
  tp,
  handle,
  onRemoveWidget,
}: {
  pages: PageItem[];
  isFree: boolean;
  refresh: () => void;
  setFb: (f: Feedback) => void;
  tp: ReturnType<typeof useTranslations>;
  handle: string;
  onRemoveWidget: (id: string) => void;
}) {
  const t = useTranslations("dashboard");
  const [busy, setBusy] = useState(false);

  async function onAddPage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const res = await addPage(new FormData(e.currentTarget));
    setBusy(false);
    if (res.ok) {
      setFb({ kind: "ok", msg: tp("pages.saved") });
      e.currentTarget.reset();
    } else {
      const key = res.error === "limit" ? "errors.limit" : "errors.invalid";
      setFb({ kind: "err", msg: tp(key) });
    }
    refresh();
  }

  async function onDeletePage(id: string) {
    setBusy(true);
    await deletePage(id);
    setBusy(false);
    refresh();
  }

  return (
    <GlassCard className="p-6">
      <CardTitle>{tp("pages.title")}</CardTitle>
      <form onSubmit={onAddPage} className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input name="title" required maxLength={40} placeholder={tp("pages.titleField")} className={inputCls} />
        <input name="slug" required maxLength={24} placeholder={tp("pages.slug")} className={inputCls} />
        <button type="submit" disabled={busy} className={btnPrimary}>
          {busy ? t("actions.saving") : tp("pages.add")}
        </button>
      </form>
      {isFree && <p className="mb-3 text-xs text-mutedtext/60">{tp("pages.limitFree", { max: FREE_PAGE_LIMIT })}</p>}

      {pages.length === 0 ? (
        <p className="text-sm text-mutedtext/70">{tp("pages.empty")}</p>
      ) : (
        <ul className="space-y-4">
          {pages.map((p) => (
            <li key={p.id} className="rounded-card border border-white/10 bg-white/[0.02] p-4">
              <div className="mb-2 flex items-center justify-between">
                <a
                  href={`/${handle}/${p.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-softwhite hover:text-plumborder"
                >
                  {p.title} <span className="text-xs text-mutedtext/60">/{p.slug} ↗</span>
                </a>
                <button onClick={() => onDeletePage(p.id)} className={btnDanger}>
                  {tp("pages.delete")}
                </button>
              </div>
              <WidgetListForPage widgets={p.widgets} onRemove={onRemoveWidget} />
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

function WidgetListForPage({
  widgets,
  onRemove,
}: {
  widgets: StoredWidget[];
  onRemove: (id: string) => void;
}) {
  const tp = useTranslations("dashboard.widgetsPage");
  if (widgets.length === 0) return <p className="text-xs text-mutedtext/60">{tp("list.empty")}</p>;
  return (
    <ul className="space-y-2">
      {widgets.map((w) => (
        <li key={w.id} className="flex items-center justify-between rounded-micro bg-white/[0.02] px-3 py-1.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 rounded-pill bg-plum/40 px-2 text-xs text-softwhite">
              {tp(`types.${w.type}`)}
            </span>
            <span className="truncate text-sm text-softwhite">{w.label}</span>
          </span>
          <button onClick={() => onRemove(w.id)} className={btnDanger}>
            {tp("remove")}
          </button>
        </li>
      ))}
    </ul>
  );
}
