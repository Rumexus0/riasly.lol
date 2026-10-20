"use client";

import Link from "next/link";

// Link-based tab bar (no client state): the home page and each extra tab are
// real routes, so this is just a row of <Link>s. Active state comes from the
// server, never from a hook, so there is nothing to desync at hydration.
export default function ProfileTabs({
  handle,
  tabs,
  activeSlug,
  homeLabel,
}: {
  handle: string;
  tabs: { slug: string; title: string }[];
  /** null/undefined when the home page is the active one. */
  activeSlug?: string | null;
  homeLabel: string;
}) {
  const base =
    "rounded-pill border px-4 py-1.5 text-sm font-medium transition-colors backdrop-blur";
  const active = "border-plumborder bg-plum/30 text-softwhite";
  const idle = "border-white/10 bg-white/[0.02] text-mutedtext hover:text-softwhite";

  const isHome = !activeSlug;

  return (
    <nav className="mt-5 flex flex-wrap items-center justify-center gap-2">
      <Link href={`/${handle}`} className={`${base} ${isHome ? active : idle}`}>
        {homeLabel}
      </Link>
      {tabs.map((tab) => (
        <Link
          key={tab.slug}
          href={`/${handle}/${tab.slug}`}
          className={`${base} ${activeSlug === tab.slug ? active : idle}`}
        >
          {tab.title}
        </Link>
      ))}
    </nav>
  );
}
