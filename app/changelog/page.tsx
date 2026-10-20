import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import PageShell from "@/components/PageShell";
import { changelog } from "@/lib/changelog";

export const metadata: Metadata = { title: "Changelog — riasly" };

export default async function ChangelogPage() {
  const t = await getTranslations("changelog");
  const locale = await getLocale();

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

      <div className="mt-12 space-y-6">
        {changelog.map((entry, i) => {
          // Entries added before bilingual copy fall back to English.
          const title = locale === "tr" ? entry.titleTr ?? entry.title : entry.title;
          const changes =
            locale === "tr" ? entry.changesTr ?? entry.changes : entry.changes;
          return (
          <article
            key={entry.version}
            className="rounded-card border border-edge bg-panel p-6 sm:p-8"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm text-plumborder">
                v{entry.version}
              </span>
              {i === 0 && (
                <span className="rounded-pill bg-plum/30 px-2.5 py-0.5 text-xs font-semibold text-softwhite">
                  {t("latest")}
                </span>
              )}
              <time
                dateTime={entry.date}
                className="ml-auto text-sm text-mutedtext"
              >
                {new Date(entry.date).toLocaleDateString()}
              </time>
            </div>
            <h2 className="mt-3 text-xl font-bold text-softwhite">
              {title}
            </h2>
            <ul className="mt-4 space-y-2">
              {changes.map((change) => (
                <li key={change} className="flex gap-3 text-[15px] text-mutedtext">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-plumborder" />
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          </article>
          );
        })}
      </div>
    </PageShell>
  );
}
