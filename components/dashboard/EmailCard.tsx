"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  confirmEmailChange,
  requestEmailChange,
} from "@/app/actions/account";
import { btnGhost, btnPrimary, inputCls } from "@/components/dashboard/form-kit";
import { maskEmail } from "@/lib/format";

/**
 * Email row for the Account page's "Genel Bilgiler" band.
 *
 * The address arrives masked and is only fully revealed client-side (the plain value
 * still ships in the RSC payload for the owner's own dashboard, so toggling never
 * hits the server). Changing it is a two-step confirmation: the first step mints a
 * one-time code and MAILES it to the new address (lib/mailer.ts), the second applies
 * whatever the user types back. The code never reaches the browser, so a failed send
 * surfaces an "emailFailed" message rather than a fake code. Every failure maps to
 * its own message so a taken or malformed address reads clearly.
 */
export default function EmailCard({
  email,
  verified,
}: {
  email: string | null;
  verified: boolean;
}) {
  const t = useTranslations("dashboard.accountPage.email");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [revealed, setRevealed] = useState(false);
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  // null = awaiting a new address; "sent" = a code was issued and must be confirmed.
  const [stage, setStage] = useState<null | "sent">(null);
  const [error, setError] = useState<string | null>(null);

  function request() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("email", newEmail);
      const res = await requestEmailChange(null, fd);
      if (res.ok) {
        setCode("");
        setStage("sent");
      } else {
        setError(
          res.error === "taken"
            ? t("taken")
            : res.error === "invalid"
              ? t("invalid")
              : res.error === "emailFailed"
                ? t("emailFailed")
                : t("error")
        );
      }
    });
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("token", code);
      const res = await confirmEmailChange(null, fd);
      if (res.ok) {
        setOpen(false);
        setStage(null);
        setNewEmail("");
        setCode("");
        router.refresh();
      } else {
        setError(res.error === "invalidToken" ? t("invalidToken") : t("error"));
      }
    });
  }

  return (
    <div className="rounded-field border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-mutedtext">{t("heading")}</p>
          <p className="mt-1 flex items-center gap-2 truncate text-sm font-medium text-softwhite">
            <span>{email ? (revealed ? email : maskEmail(email)) : t("none")}</span>
            {email && (
              <button
                type="button"
                onClick={() => setRevealed((v) => !v)}
                className="text-xs text-plumborder transition-colors hover:text-softwhite"
              >
                {revealed ? t("hide") : t("reveal")}
              </button>
            )}
            <span
              className={`rounded-pill px-2 py-0.5 text-xs ring-1 ${
                verified
                  ? "bg-plumborder/15 text-plumborder ring-plumborder/40"
                  : "bg-white/[0.02] text-mutedtext ring-white/10"
              }`}
            >
              {verified ? t("verified") : t("notVerified")}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setError(null);
          }}
          className={btnGhost}
        >
          {t("change")}
        </button>
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          {stage === null ? (
            <>
              <label className="text-sm text-mutedtext">{t("newEmail")}</label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className={`${inputCls} max-w-sm flex-1`}
                  autoComplete="email"
                />
                <button
                  type="button"
                  onClick={request}
                  disabled={pending || !newEmail.trim()}
                  className={btnPrimary}
                >
                  {pending ? t("working") : t("sendCode")}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-mutedtext">{t("emailSent")}</p>
              <label className="text-sm text-mutedtext">{t("enterCode")}</label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={`${inputCls} max-w-sm flex-1`}
                />
                <button
                  type="button"
                  onClick={confirm}
                  disabled={pending || !code.trim()}
                  className={btnPrimary}
                >
                  {pending ? t("working") : t("confirm")}
                </button>
              </div>
            </>
          )}
          {error && <span className="text-sm text-red-300">{error}</span>}
        </div>
      )}
    </div>
  );
}
