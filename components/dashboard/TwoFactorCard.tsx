"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  confirmTwoFactor,
  disableTwoFactor,
  startTwoFactor,
} from "@/app/actions/two-factor";
import { btnGhost, btnPrimary, inputCls } from "@/components/dashboard/form-kit";

/**
 * Two-factor (TOTP) control for the Account page's "Güvenlik" band.
 *
 * The whole setup lives client-side and only ever talks to the three server
 * actions in app/actions/two-factor.ts. Enabling runs a strict two-step handshake
 * (start → show QR/secret → confirm with a live code) so a secret is persisted ONLY
 * after the user proves their authenticator actually generates matching codes for
 * it. Backup codes are returned exactly once, at the moment of confirmation, and
 * this component is the only place they ever exist in plaintext.
 */
export default function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const t = useTranslations("dashboard.accountPage.twoFactor");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Setup sub-state: idle → setup (secret shown, awaiting a code) → backup (codes shown once).
  const [phase, setPhase] = useState<"idle" | "setup" | "backup">("idle");
  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [backups, setBackups] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Disable is a single prompt for a current code (or backup).
  const [disableCode, setDisableCode] = useState("");

  function begin() {
    setError(null);
    startTransition(async () => {
      const res = await startTwoFactor();
      if (res.ok && res.secret && res.qrDataUrl) {
        setSecret(res.secret);
        setQr(res.qrDataUrl);
        setCode("");
        setPhase("setup");
      } else {
        setError(t("error"));
      }
    });
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await confirmTwoFactor({ code, secret });
      if (res.ok) {
        setBackups(res.backupCodes ?? []);
        setPhase("backup");
        router.refresh();
      } else {
        setError(res.error === "invalid" ? t("invalid") : t("error"));
      }
    });
  }

  function finish() {
    setPhase("idle");
    setSecret("");
    setQr("");
    setCode("");
    setBackups([]);
    router.refresh();
  }

  function disable() {
    setError(null);
    startTransition(async () => {
      const res = await disableTwoFactor({ code: disableCode });
      if (res.ok) {
        setDisableCode("");
        setError(null);
        router.refresh();
      } else {
        setError(res.error === "invalid" ? t("invalid") : t("error"));
      }
    });
  }

  return (
    <div className="rounded-field border border-white/10 bg-white/[0.02] px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-softwhite">{t("heading")}</p>
          <p className="mt-1 text-xs text-mutedtext">
            {enabled ? t("statusOn") : t("statusOff")}
          </p>
        </div>
        {!enabled && phase === "idle" && (
          <button type="button" onClick={begin} disabled={pending} className={btnPrimary}>
            {pending ? t("working") : t("enable")}
          </button>
        )}
      </div>

      {/* Setup: scan the QR (or type the secret), then prove one live code. */}
      {phase === "setup" && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm text-mutedtext">{t("scanHint")}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt={t("scanAlt")}
            className="h-48 w-48 self-center rounded-field bg-white p-2"
          />
          <div>
            <p className="text-xs uppercase tracking-widest text-mutedtext/70">
              {t("secretLabel")}
            </p>
            <code className="mt-1 block break-all rounded-field bg-black/40 px-3 py-2 text-xs text-softwhite">
              {secret}
            </code>
          </div>
          <label className="text-sm text-mutedtext">{t("codeLabel")}</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={inputCls}
          />
          <div className="flex items-center gap-3">
            <button type="button" onClick={confirm} disabled={pending} className={btnPrimary}>
              {pending ? t("working") : t("confirm")}
            </button>
            <button type="button" onClick={finish} className={btnGhost}>
              {t("cancel")}
            </button>
            {error && <span className="text-sm text-red-300">{error}</span>}
          </div>
        </div>
      )}

      {/* Backup codes: shown exactly once. The server keeps only their hashes. */}
      {phase === "backup" && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-softwhite">{t("backupTitle")}</p>
          <p className="text-xs text-amber-200/80">{t("backupHint")}</p>
          <div className="grid grid-cols-2 gap-2">
            {backups.map((b) => (
              <code
                key={b}
                className="rounded-field bg-black/40 px-3 py-2 text-center text-sm tracking-wider text-softwhite"
              >
                {b}
              </code>
            ))}
          </div>
          <button type="button" onClick={finish} className={`${btnPrimary} self-start`}>
            {t("done")}
          </button>
        </div>
      )}

      {/* Enabled: offer a disable that demands a current code. */}
      {enabled && (
        <div className="mt-4 flex flex-col gap-2">
          <label className="text-sm text-mutedtext">{t("disableCodeLabel")}</label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              inputMode="numeric"
              placeholder={t("disableCodePlaceholder")}
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              className={`${inputCls} max-w-[12rem] flex-1`}
            />
            <button
              type="button"
              onClick={disable}
              disabled={pending || !disableCode.trim()}
              className={btnGhost}
            >
              {pending ? t("working") : t("disable")}
            </button>
            {error && <span className="text-sm text-red-300">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
