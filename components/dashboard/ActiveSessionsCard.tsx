"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import {
  revokeAllSessions,
  revokeOtherSessions,
  revokeSession,
} from "@/app/actions/sessions";
import { btnGhost } from "@/components/dashboard/form-kit";

export type DeviceSessionView = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: number;
  lastSeenAt: number;
  /** True for the row matching the browser making this request. */
  current: boolean;
};

/**
 * "Aktif oturumlar" — the device list the Account page shows under Güvenlik.
 *
 * Every row is one DeviceSession (a `jti` the jwt callback minted at sign-in, stored
 * only as its SHA-256 hash). The current browser is flagged so it can be neither
 * revoked by id (the server double-checks that) nor caught by "sign out others".
 * Timestamps are formatted per-locale on the client, so no server date strings leak
 * into the RSC payload and the list stays correct for both en and tr.
 */
export default function ActiveSessionsCard({
  sessions,
}: {
  sessions: DeviceSessionView[];
}) {
  const t = useTranslations("dashboard.accountPage.sessions");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const fmt = (ms: number) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ms));

  function run(fn: () => Promise<{ ok: boolean }>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const others = sessions.filter((s) => !s.current).length;

  return (
    <div className="rounded-field border border-white/10 bg-white/[0.02] px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-softwhite">{t("heading")}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => run(revokeOtherSessions)}
            disabled={pending || others === 0}
            className={btnGhost}
          >
            {t("signOutOthers")}
          </button>
          <button
            type="button"
            onClick={() => run(revokeAllSessions)}
            disabled={pending}
            className={`${btnGhost} hover:border-red-400/60 hover:text-red-200`}
          >
            {t("signOutAll")}
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-mutedtext/70">{t("hint")}</p>

      {sessions.length === 0 ? (
        <p className="mt-3 text-sm text-mutedtext/70">{t("empty")}</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-white/5">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-softwhite">
                  {s.userAgent?.slice(0, 60) || t("unknown")}
                  {s.current && (
                    <span className="ml-2 rounded-pill bg-plumborder/15 px-2 py-0.5 text-xs text-plumborder ring-1 ring-plumborder/40">
                      {t("thisDevice")}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-xs text-mutedtext/70">
                  {s.ip ? `${s.ip} · ` : ""}
                  {t("lastSeen")}: {fmt(s.lastSeenAt)}
                </p>
              </div>
              {!s.current && (
                <button
                  type="button"
                  onClick={() => run(() => revokeSession(s.id))}
                  disabled={pending}
                  className="shrink-0 text-sm text-mutedtext transition-colors hover:text-red-300"
                >
                  {t("signOut")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
