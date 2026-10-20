"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";

import { signInWithProvider } from "@/app/actions/auth";
import type { OAuthProvider } from "@/lib/oauth";

const iconPaths: Record<OAuthProvider, React.ReactNode> = {
  google: (
    <path
      d="M12 11v3.6h5.1c-.2 1.3-1.6 3.9-5.1 3.9a5.7 5.7 0 1 1 0-11.4c1.8 0 3 .8 3.7 1.4l2.5-2.4C16.9 4.2 14.7 3.2 12 3.2a8.8 8.8 0 1 0 0 17.6c5.1 0 8.4-3.6 8.4-8.7 0-.6-.1-1-.2-1.5H12z"
      fill="currentColor"
    />
  ),
  github: (
    <path
      d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.1-1-1.4-1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.4-2.2-.2-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.3 9.3 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.6 1 2.7 0 3.9-2.4 4.8-4.6 5 .3.3.7 1 .7 2v2.9c0 .3.2.6.7.5A10 10 0 0 0 12 2z"
      fill="currentColor"
    />
  ),
  discord: (
    <path
      d="M19.3 5.4A16 16 0 0 0 15.3 4l-.3.5a14.7 14.7 0 0 1 4.2 1.9 13.4 13.4 0 0 0-11.5 0A14.7 14.7 0 0 1 12 4.5l-.3-.5A16 16 0 0 0 7.7 5.4 18.7 18.7 0 0 0 5 16.6a16.2 16.2 0 0 0 4.9 2.5l.4-.6a10.6 10.6 0 0 1-1.7-.8l.4-.3a11.5 11.5 0 0 0 9.9 0l.4.3c-.5.3-1.1.6-1.7.8l.4.6a16.2 16.2 0 0 0 4.9-2.5 18.6 18.6 0 0 0-2.9-11.2zM10.3 14.5c-.9 0-1.7-.9-1.7-2s.8-2 1.7-2 1.7.9 1.7 2-.7 2-1.7 2zm3.4 0c-.9 0-1.7-.9-1.7-2s.8-2 1.7-2 1.7.9 1.7 2-.7 2-1.7 2z"
      fill="currentColor"
    />
  ),
};

export default function OAuthButtons({ providers }: { providers: OAuthProvider[] }) {
  const t = useTranslations("auth");
  const [isPending, startTransition] = useTransition();

  if (providers.length === 0) return null;

  const label: Record<OAuthProvider, string> = {
    google: t("google"),
    github: t("github"),
    discord: t("discord"),
  };

  const brandHover: Record<OAuthProvider, string> = {
    google:
      "hover:border-[#4285F4] hover:text-[#4285F4] hover:shadow-[0_0_22px_-8px_#4285F4]",
    github:
      "hover:border-[#8b949e] hover:text-[#c9d1d9] hover:shadow-[0_0_22px_-8px_#8b949e]",
    discord:
      "hover:border-[#5865F2] hover:text-[#5865F2] hover:shadow-[0_0_22px_-8px_#5865F2]",
  };

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-widest text-mutedtext">
        <span className="h-px flex-1 bg-edge" />
        {t("orContinueWith")}
        <span className="h-px flex-1 bg-edge" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {providers.map((p) => (
          <button
            key={p}
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(() => {
                signInWithProvider(p);
              })
            }
            className={`glass inline-flex h-11 items-center justify-center gap-2 rounded-card px-3 text-sm font-medium text-softwhite transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60 ${brandHover[p]}`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
              {iconPaths[p]}
            </svg>
            <span className="truncate">{label[p]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
