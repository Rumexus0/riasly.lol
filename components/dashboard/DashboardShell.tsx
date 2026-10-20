"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import MotionPrefSwitch from "@/components/motion/MotionPrefSwitch";
import Logo from "@/components/Logo";

import type { ReactNode } from "react";

type NavItem = { href: string; labelKey: string; icon: ReactNode };

// One nav definition for both the desktop sidebar and the mobile scroll row:
// the old duplicated markup drifted apart the moment a page was added.
const GROUPS: { labelKey: string; items: NavItem[] }[] = [
  {
    labelKey: "groups.account",
    items: [
      { href: "/dashboard", labelKey: "nav.account", icon: <IconGrid /> },
      { href: "/dashboard/links", labelKey: "nav.links", icon: <IconLink /> },
      { href: "/dashboard/widgets", labelKey: "nav.widgets", icon: <IconWidget /> },
    ],
  },
  {
    labelKey: "groups.customize",
    items: [
      { href: "/dashboard/customize", labelKey: "nav.customize", icon: <IconSliders /> },
      { href: "/dashboard/badges", labelKey: "nav.badges", icon: <IconBadge /> },
    ],
  },
  {
    labelKey: "groups.content",
    items: [
      { href: "/dashboard/templates", labelKey: "nav.templates", icon: <IconSparkles /> },
      { href: "/dashboard/files", labelKey: "nav.files", icon: <IconFolder /> },
    ],
  },
];

const FLAT: NavItem[] = GROUPS.flatMap((g) => g.items);

// Shared dashboard chrome: a guns.lol-style left sidebar on desktop and a
// horizontal scroll nav on mobile. Purely presentational — the data (and the
// auth gate) lives in app/dashboard/layout.tsx, and the active item is derived
// from the URL so a new page never has to be registered twice.
export default function DashboardShell({
  children,
  handle,
  logout,
}: {
  children: React.ReactNode;
  handle: string;
  logout: () => Promise<void>;
}) {
  const t = useTranslations("dashboard");
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const itemBase =
    "flex items-center gap-3 rounded-field px-4 py-2.5 text-sm font-medium transition-colors";
  const activeCls = "bg-plum/30 text-softwhite ring-1 ring-plumborder";
  const idleCls = "text-mutedtext hover:bg-white/5 hover:text-softwhite";

  return (
    <div className="relative min-h-screen bg-nearblack">
      {/* ambient top glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-plumradial"
      />

      <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-5 md:px-6">
        {/* Sidebar (desktop) */}
        <aside className="sticky top-5 hidden h-[calc(100vh-2.5rem)] w-60 shrink-0 flex-col overflow-y-auto md:flex">
          <Link
            href="/dashboard"
            className="mb-6 flex items-center px-1"
          >
            <Logo />
          </Link>

          <nav className="flex flex-col gap-5">
            {GROUPS.map((group) => (
              <div key={group.labelKey}>
                <p className="mb-1.5 px-4 text-[11px] font-semibold uppercase tracking-widest text-mutedtext/50">
                  {t(group.labelKey)}
                </p>
                <div className="flex flex-col gap-1">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`${itemBase} ${isActive(item.href) ? activeCls : idleCls}`}
                    >
                      {item.icon}
                      {t(item.labelKey)}
                    </Link>
                  ))}
                </div>
              </div>
            ))}

            <a
              href={`/${handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${itemBase} ${idleCls}`}
            >
              <IconExternal />
              {t("nav.viewProfile")}
            </a>
          </nav>

          <div className="mt-auto pt-6">
            {/* The owner previews their page with the same control a visitor has.
                On a machine whose OS asks for reduced motion it is the only way to
                see what a template's motion and effects actually do. */}
            <MotionPrefSwitch className="mb-4" />
            <form action={logout}>
              <button type="submit" className={`${itemBase} w-full ${idleCls}`}>
                <IconLogout />
                {t("logout")}
              </button>
            </form>
          </div>
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Mobile top bar */}
          <div className="mb-4 flex items-center justify-between gap-3 md:hidden">
            <Link
              href="/dashboard"
              className="flex items-center"
            >
              <Logo />
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-pill border border-white/10 bg-white/[0.02] px-4 py-2 text-sm text-mutedtext transition-colors hover:border-plumborder hover:text-softwhite"
              >
                {t("logout")}
              </button>
            </form>
          </div>
          {/* Mobile nav (horizontal scroll) — same items as the sidebar */}
          <nav className="mb-5 flex gap-2 overflow-x-auto pb-1 md:hidden">
            {FLAT.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${itemBase} shrink-0 ${isActive(item.href) ? activeCls : idleCls}`}
              >
                {t(item.labelKey)}
              </Link>
            ))}
            <a
              href={`/${handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${itemBase} shrink-0 ${idleCls}`}
            >
              {t("nav.viewProfile")}
            </a>
          </nav>
          {/* Same control as the sidebar, kept out of the scrolling nav row so it
              does not get flicked past by accident. */}
          <MotionPrefSwitch className="mb-5 md:hidden" />

          {children}
        </div>
      </div>
    </div>
  );
}

/* --- tiny inline icons (stroke, currentColor) --- */
function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconSparkles() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15l-1.8-4.2L5.5 9l4.7-1.3L12 3z" />
      <path d="M19 14l.9 2.3L22 17l-2.1.7L19 20l-.9-2.3L16 17l2.1-.7L19 14z" />
    </svg>
  );
}
function IconExternal() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </svg>
  );
}
function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );
}
function IconLink() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d="M9.5 14.5l5-5" />
      <path d="M11 6.6l1.5-1.5a3.6 3.6 0 0 1 5 5L16 11.6" />
      <path d="M13 17.4l-1.5 1.5a3.6 3.6 0 0 1-5-5L8 12.4" />
    </svg>
  );
}
function IconBadge() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8.4 3h7.2l-2.2 5.4h-2.8L8.4 3z" />
      <circle cx="12" cy="15.8" r="5.2" />
    </svg>
  );
}
function IconWidget() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M17.5 14v7M14 17.5h7" />
    </svg>
  );
}
function IconSliders() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <path d="M4 17h4" />
      <path d="M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
}
function IconFolder() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}
