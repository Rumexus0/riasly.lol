import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import PageShell from "@/components/PageShell";
import { prisma } from "@/lib/db";
import { getStats } from "@/lib/stats";

export const metadata: Metadata = { title: "Status — riasly" };
export const dynamic = "force-dynamic";

async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export default async function StatusPage() {
  const t = await getTranslations("status");
  const dbUp = await checkDatabase();
  const stats = await getStats();
  const checkedAt = new Date();

  const services = [
    { name: t("web"), up: true },
    { name: t("database"), up: dbUp },
  ];

  const metrics = [
    { label: t("users"), value: stats.users },
    { label: t("profileViews"), value: stats.profileViews },
    { label: t("fileUploads"), value: stats.fileUploads },
    { label: t("subscribers"), value: stats.subscribers },
  ];

  return (
    <PageShell className="mx-auto w-full max-w-2xl">
      <header className="text-center">
        <div className="mb-3 flex items-center justify-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${dbUp ? "bg-plumborder" : "bg-red-500"}`}
          />
          <span className="text-sm font-semibold uppercase tracking-widest text-mutedtext">
            {dbUp ? t("summary") : t("summaryDown")}
          </span>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-softwhite sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-[15px] text-mutedtext">
          {t("subtitle")}
        </p>
        <p className="mt-3 text-xs text-mutedtext/70">
          {t("lastChecked")}: {checkedAt.toLocaleString()}
        </p>
      </header>

      <div className="mt-10 space-y-3">
        {services.map((s) => (
          <div
            key={s.name}
            className="flex items-center justify-between rounded-card border border-edge bg-panel px-5 py-4"
          >
            <span className="font-medium text-softwhite">{s.name}</span>
            <span
              className={`rounded-pill px-3 py-1 text-xs font-semibold ${
                s.up ? "bg-plum/30 text-softwhite" : "bg-red-500/20 text-red-300"
              }`}
            >
              {s.up ? t("operational") : t("degraded")}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-mutedtext">
          {t("metrics")}
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="rounded-card border border-edge bg-panel p-4 text-center"
            >
              <p className="text-2xl font-bold text-softwhite">
                {m.value.toLocaleString()}
              </p>
              <p className="mt-1 text-xs uppercase tracking-widest text-mutedtext">
                {m.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
