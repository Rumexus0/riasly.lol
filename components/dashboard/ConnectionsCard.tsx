"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  connectDiscord,
  connectGoogle,
  disconnectDiscord,
  disconnectGoogle,
} from "@/app/actions/discord";
import {
  FeedbackLine,
  btnGhost,
  btnPrimary,
  useFeedback,
} from "@/components/dashboard/form-kit";
import SocialIcon from "@/components/icons/SocialIcon";
import type { ActionResult } from "@/app/actions/profile";

/**
 * "Bağlantılar" band — one row per OAuth provider the Account page manages
 * (Google and Discord). Connecting runs `signIn(provider)` which redirects to the
 * provider consent screen and back; because a session already exists, Auth.js LINKS
 * the returned account to the current user rather than starting a fresh login. The
 * Google row is only rendered when its provider is actually configured, so a build
 * without those env keys never shows a dead button.
 */
type Row = {
  id: "google" | "discord";
  label: string;
  icon: React.ReactNode;
  connected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<ActionResult>;
};

export default function ConnectionsCard({
  providers,
  googleAvailable,
}: {
  providers: string[];
  googleAvailable: boolean;
}) {
  const t = useTranslations("dashboard.accountPage.connections");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { fb, report } = useFeedback({ lastauth: t("locked") });

  const rows: Row[] = [];
  if (googleAvailable) {
    rows.push({
      id: "google",
      label: t("google"),
      icon: <GoogleGlyph />,
      connected: providers.includes("google"),
      connect: () => connectGoogle(),
      disconnect: disconnectGoogle,
    });
  }
  rows.push({
    id: "discord",
    label: t("discord"),
    icon: <SocialIcon platform="Discord" className="h-5 w-5" />,
    connected: providers.includes("discord"),
    connect: () => connectDiscord(),
    disconnect: disconnectDiscord,
  });

  function doConnect(row: Row) {
    startTransition(async () => {
      // A successful connect throws NEXT_REDIRECT and the browser navigates, so the
      // refresh below only runs on the (rare) resolve-without-redirect path.
      await row.connect();
      router.refresh();
    });
  }

  function doDisconnect(row: Row) {
    startTransition(async () => {
      const res = await row.disconnect();
      report(res);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex items-center gap-3 rounded-field border border-white/10 bg-white/[0.02] px-4 py-3"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-softwhite ring-1 ring-white/10">
            {row.icon}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-softwhite">
            {row.label}
          </span>
          {row.connected ? (
            <button
              type="button"
              onClick={() => doDisconnect(row)}
              disabled={pending}
              className={`${btnGhost} hover:border-red-400/60 hover:text-red-200`}
            >
              {t("disconnect")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => doConnect(row)}
              disabled={pending}
              className={btnPrimary}
            >
              {t("connect")}
            </button>
          )}
        </div>
      ))}
      <FeedbackLine fb={fb} />
    </div>
  );
}

// Google's four-colour "G" as a monochrome currentColor glyph would read oddly
// against the brand marks, so a compact multicolour mark keeps the row honest.
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.26-2.09 3.56-5.17 3.56-8.87z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.87-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.76c1.77 0 3.35.61 4.6 1.8l3.42-3.42A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.87 8.87 4.76 12 4.76z"
      />
    </svg>
  );
}
