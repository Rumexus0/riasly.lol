import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import PageShell from "@/components/PageShell";
import { getLeaderboard } from "@/lib/profile";

export const metadata: Metadata = { title: "Leaderboard — riasly" };
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const t = await getTranslations("leaderboard");

  let rows: Awaited<ReturnType<typeof getLeaderboard>> = [];
  try {
    rows = await getLeaderboard();
  } catch {
    rows = [];
  }

  return (
    <PageShell className="mx-auto w-full max-w-3xl">
      <header className="text-center">
        <h1 className="text-3xl font-black tracking-tight text-softwhite sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] text-mutedtext">
          {t("subtitle")}
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="mt-12 rounded-card border border-edge bg-panel p-10 text-center">
          <p className="text-mutedtext">{t("empty")}</p>
          <Link
            href="/signup"
            className="mt-4 inline-flex rounded-pill border border-plumborder bg-plum px-5 py-2.5 text-sm font-medium text-softwhite hover:bg-aubergine"
          >
            {t("claimCta")}
          </Link>
        </div>
      ) : (
        <ol className="mt-10 space-y-3">
          {rows.map((row, i) => {
            const handle = row.user?.handle ?? "";
            return (
              <li
                key={handle + i}
                className="flex items-center justify-between rounded-card border border-edge bg-panel px-5 py-4"
              >
                <div className="flex items-center gap-4">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-micro text-sm font-bold ${
                      i < 3 ? "bg-plum text-softwhite" : "bg-nearblack text-mutedtext"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <a
                      href={`/${handle}`}
                      className="block truncate font-semibold text-softwhite hover:text-plumborder"
                    >
                      riasly/{handle}
                    </a>
                    <span className="text-xs uppercase tracking-widest text-mutedtext">
                      {row.user?.plan === "PREMIUM" ? t("premium") : t("free")}
                    </span>
                  </div>
                </div>
                <span className="shrink-0 text-right">
                  <span className="text-lg font-bold text-softwhite">
                    {row.viewCount.toLocaleString()}
                  </span>
                  <span className="ml-2 text-xs uppercase tracking-widest text-mutedtext">
                    {t("views")}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </PageShell>
  );
}
