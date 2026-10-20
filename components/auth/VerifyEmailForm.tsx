"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";

import {
  requestVerificationCode,
  resendVerificationCode,
  submitVerificationCode,
  type VerifyResult,
} from "@/app/actions/verify";
import { maskEmail, VERIFIED_EMAIL_KEY } from "@/lib/format";
import GlassCard from "../ui/GlassCard";
import Reveal from "../motion/Reveal";

const inputCls =
  "h-12 w-full rounded-field border border-edge bg-input px-4 text-softwhite placeholder:text-mutedtext/50 transition-all focus:border-plumborder focus:shadow-glow focus:outline-none";

// The same submit shape as SignupForm: this page is a step of the same flow, so a
// visitor should not feel they have landed on a different product.
const btnPrimary =
  "inline-flex h-12 w-full items-center justify-center rounded-pill bg-brandgrad px-6 text-[15px] font-medium text-white shadow-glow transition-all hover:shadow-glowLg hover:-translate-y-0.5 active:translate-y-0 active:scale-[.98] disabled:opacity-60";

// VERIFIED_EMAIL_KEY: the address a finished verification hands to the login form so
// it does not have to be typed a third time. sessionStorage because it is the only
// place that is neither a URL (history, referer, logs) nor a cookie (a page cannot
// write one, and it would outlive the moment it is useful); it dies with the tab, and
// LoginForm deletes it the first time it reads it. Declared in lib/format.ts, which
// both sides of the handoff already import.

/**
 * Email-verification step for a freshly created account.
 *
 * Two stages, exactly like the Account page's email-change card: "email" asks for
 * an address and mails a code to it, "code" consumes the six digits. The server
 * decides which stage to open with (a signed cookie names the account that just
 * signed up), so the normal path from /signup is straight to the code — the address
 * step exists for a closed tab, an expired cookie or a failed send.
 *
 * The address is only ever shown masked. It is not put in the URL: a query-string
 * email survives browser history, the referer header and server logs, which is a
 * worse outcome than asking somebody to type it again.
 */
export default function VerifyEmailForm({
  stage,
  email,
  next,
}: {
  /** Which stage the server resolved from the verify cookie. */
  stage: "email" | "code";
  /** The address the cookie's account has on file, if any. Masked here. */
  email: string | null;
  /** Where a completed verification should hand the visitor back to. */
  next?: string | null;
}) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showEmail, setShowEmail] = useState(stage !== "code" || !email);
  const [address, setAddress] = useState(email ?? "");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function messageFor(res: VerifyResult): string | null {
    if (res.ok) return null;
    switch (res.error) {
      case "invalid":
        return t("verifyInvalidEmail");
      case "invalidToken":
        return t("verifyBadCode");
      case "tooMany":
        return t("tooManyVerify");
      case "emailFailed":
        return t("emailFailed");
      default:
        return t("genericError");
    }
  }

  function send() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("email", address);
      const res = await requestVerificationCode(null, fd);
      const fail = messageFor(res);
      if (fail) {
        setError(fail);
        return;
      }
      // A success here means either a real send or "we are not going to tell you
      // whether that address exists" — both read the same way, on purpose.
      setNotice(t("verifyMailed"));
      if (res.stage === "code") setShowEmail(false);
    });
  }

  function confirm() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("code", code);
      const res = await submitVerificationCode(null, fd);
      const fail = messageFor(res);
      if (fail) {
        setError(fail);
        // The cookie is gone or was never ours: fall back to asking for the
        // address instead of showing a code box that can never succeed.
        if (res.stage === "email") setShowEmail(true);
        return;
      }
      setNotice(t("verifySuccess"));
      // Straight to the login form, with the verification banner and the address
      // already taken care of — and back to the page they came from.
      if (res.email) {
        try {
          window.sessionStorage.setItem(VERIFIED_EMAIL_KEY, res.email);
        } catch {
          // Private-mode failure only costs the prefill, never the verification.
        }
      }
      const params = new URLSearchParams({ verified: "1" });
      if (next) params.set("next", next);
      router.push(`/login?${params.toString()}`);
    });
  }

  function resend() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await resendVerificationCode();
      const fail = messageFor(res);
      if (fail) {
        setError(fail);
        if (res.stage === "email") setShowEmail(true);
        return;
      }
      setNotice(t("verifySent"));
    });
  }

  return (
    <Reveal className="w-full max-w-md">
      <GlassCard className="p-8">
        <h1 className="text-gradient text-2xl font-bold">{t("verifyTitle")}</h1>
        <p className="mt-2 text-[15px] text-mutedtext">{t("verifySubtitle")}</p>

        {showEmail ? (
          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm text-mutedtext">
                {t("verifyEmailLabel")}
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={inputCls}
              />
            </div>
            <button
              type="button"
              onClick={send}
              disabled={pending || !address.trim()}
              className={btnPrimary}
            >
              {t("verifySend")}
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {email && (
              <p className="text-[13px] text-mutedtext">
                {t("verifyMailedTo")} <span className="text-softwhite">{maskEmail(email)}</span>
              </p>
            )}
            <div>
              <label className="mb-1.5 block text-sm text-mutedtext">
                {t("verifyCodeLabel")}
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={inputCls}
              />
              <p className="mt-2 text-[13px] text-mutedtext">{t("verifyCodeHelp")}</p>
            </div>
            <button
              type="button"
              onClick={confirm}
              disabled={pending || !code.trim()}
              className={btnPrimary}
            >
              {t("verifySubmit")}
            </button>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={resend}
                disabled={pending}
                className="text-sm text-plumborder transition-colors hover:text-softwhite disabled:opacity-60"
              >
                {t("verifyResend")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEmail(true);
                  setError(null);
                  setNotice(null);
                }}
                className="text-sm text-mutedtext transition-colors hover:text-softwhite"
              >
                {t("verifyOtherEmail")}
              </button>
            </div>
          </div>
        )}

        {notice && (
          <p className="mt-3 text-[13px] text-plumborder" role="status">
            {notice}
          </p>
        )}

        {error && (
          <p className="mt-3 text-sm text-plumborder" role="alert">
            {error}
          </p>
        )}

        <p className="mt-6 text-center text-sm text-mutedtext">
          <Link href="/login" className="text-plumborder hover:underline">
            {t("backToLogin")}
          </Link>
        </p>
      </GlassCard>
    </Reveal>
  );
}
