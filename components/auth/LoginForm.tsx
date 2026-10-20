"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { loginUser, probeMfaRequired, sendLoginOtp } from "@/app/actions/login";
import type { AuthResult } from "@/app/actions/auth";
import { VERIFIED_EMAIL_KEY } from "@/lib/format";
import OAuthButtons from "./OAuthButtons";
import GlassCard from "../ui/GlassCard";
import Reveal from "../motion/Reveal";
import type { OAuthProvider } from "@/lib/oauth";

const inputCls =
  "h-12 w-full rounded-field border border-edge bg-input px-4 text-softwhite placeholder:text-mutedtext/50 transition-all focus:border-plumborder focus:shadow-glow focus:outline-none";

function messageFor(res: AuthResult | null, invalid: string, generic: string): string | null {
  if (!res || res.ok) return null;
  // "emailNotVerified" is not a string-shaped error: it renders as its own block
  // because it carries a link to /verify, so the generic line must stay empty.
  if (res.error === "emailNotVerified") return null;
  return res.error === "invalidCredentials" || res.error === "invalid" ? invalid : generic;
}

// VERIFIED_EMAIL_KEY is set by /verify when an address has just been confirmed, so
// the visitor can sign straight in without retyping it. It is read once and deleted.
// The key lives in lib/format.ts because VerifyEmailForm writes the same literal.

export default function LoginForm({
  providers,
  next,
  staleNotice = false,
  accountNotLinked = false,
  verifiedNotice = false,
}: {
  providers: OAuthProvider[];
  next?: string | null;
  staleNotice?: boolean;
  /**
   * Auth.js refused to attach this provider to the account that already owns the
   * email. The URL only carries the error type, not the provider, so the copy must
   * read for Google, GitHub and Discord alike: `OAuthAccountNotLinked` for an OAuth
   * refusal, `AccountNotLinked` for the same rule on the non-OAuth path.
   */
  accountNotLinked?: boolean;
  /** The email verification for this account just finished. */
  verifiedNotice?: boolean;
}) {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  // "credentials" is the normal email+password step; "code" appears only after the
  // probe says the account has 2FA on. The real sign-in always runs through
  // loginUser/authorize — this step only decides whether a code is collected.
  const [step, setStep] = useState<"credentials" | "code">("credentials");
  const [error, setError] = useState<string | null>(null);
  const [needsVerify, setNeedsVerify] = useState(false);
  const [pending, startTransition] = useTransition();
  // Email second-factor: a separate transition so requesting a code never blocks
  // the (still-form) submit, and a flag to confirm the send landed in the inbox.
  const [otpPending, startOtpTransition] = useTransition();
  const [otpSent, setOtpSent] = useState(false);

  // Prefill in an effect, never during the first render: sessionStorage does not
  // exist on the server, and a value that differs between the two renders is a
  // hydration mismatch on the very first field of the form.
  useEffect(() => {
    if (!verifiedNotice) return;
    try {
      const stored = window.sessionStorage.getItem(VERIFIED_EMAIL_KEY);
      if (!stored) return;
      window.sessionStorage.removeItem(VERIFIED_EMAIL_KEY);
      setEmail(stored);
    } catch {
      // No storage (or a blocked one): the address simply has to be typed.
    }
  }, [verifiedNotice]);

  async function attemptLogin(withCode: string) {
    const fd = new FormData();
    fd.set("email", email);
    fd.set("password", password);
    fd.set("token", withCode);
    if (next) fd.set("next", next);
    // On success loginUser's signIn throws NEXT_REDIRECT and the browser navigates,
    // so this only returns when the attempt failed and we can show why.
    const res = await loginUser(null, fd);
    setNeedsVerify(!res.ok && res.error === "emailNotVerified");
    setError(messageFor(res, t("invalidCredentials"), t("genericError")));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNeedsVerify(false);
    startTransition(async () => {
      if (step === "code") {
        await attemptLogin(code);
        return;
      }
      const { mfa } = await probeMfaRequired(email, password);
      if (mfa) {
        setStep("code");
        return;
      }
      await attemptLogin("");
    });
  }

  function emailCode() {
    setError(null);
    setOtpSent(false);
    startOtpTransition(async () => {
      const res = await sendLoginOtp(email, password);
      if (res.ok) setOtpSent(true);
      else setError(t("genericError"));
    });
  }

  return (
    <Reveal className="w-full max-w-md">
    <GlassCard className="p-8">
      <h1 className="text-gradient text-2xl font-bold">{t("loginTitle")}</h1>
      <p className="mt-2 text-[15px] text-mutedtext">{t("loginSubtitle")}</p>

      {staleNotice && (
        <p className="mt-3 text-[13px] text-mutedtext" role="status">
          {t("staleSession")}
        </p>
      )}

      {accountNotLinked && (
        <p className="mt-3 rounded-field border border-plumborder/40 bg-plumborder/10 p-3 text-[13px] text-softwhite" role="alert">
          {t("oauthNotLinked")}{" "}
          <Link href="/recovery" className="text-plumborder hover:underline">
            {t("forgotPassword")}
          </Link>
        </p>
      )}

      {verifiedNotice && (
        <p className="mt-3 text-[13px] text-plumborder" role="status">
          {t("verifySuccess")}
        </p>
      )}

      {needsVerify && (
        <p className="mt-3 rounded-field border border-plumborder/40 bg-plumborder/10 p-3 text-[13px] text-softwhite" role="alert">
          {t("emailNotVerified")}{" "}
          <Link href="/verify" className="text-plumborder hover:underline">
            {t("verifyOpen")}
          </Link>
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {step === "credentials" ? (
          <>
            <div>
              <label className="mb-1.5 block text-sm text-mutedtext">{t("email")}</label>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm text-mutedtext">{t("password")}</label>
                <Link
                  href="/recovery"
                  className="text-sm text-plumborder hover:underline"
                >
                  {t("forgotPassword")}
                </Link>
              </div>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
              />
            </div>
          </>
        ) : (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm text-mutedtext">{t("mfaCodeLabel")}</label>
              <button
                type="button"
                onClick={() => {
                  setStep("credentials");
                  setCode("");
                  setError(null);
                }}
                className="text-sm text-plumborder hover:underline"
              >
                {t("mfaBack")}
              </button>
            </div>
            <input
              name="token"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={inputCls}
            />
            <p className="mt-2 text-[13px] text-mutedtext">{t("mfaHelp")}</p>
            <div className="mt-3 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={emailCode}
                disabled={otpPending}
                className="self-start text-sm text-plumborder transition-colors hover:text-softwhite disabled:opacity-60"
              >
                {t("mfaEmailBtn")}
              </button>
              {otpSent && (
                <p className="text-[13px] text-plumborder" role="status">
                  {t("mfaEmailSent")}
                </p>
              )}
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-plumborder" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-12 w-full items-center justify-center rounded-pill bg-brandgrad px-6 text-[15px] font-medium text-white shadow-glow transition-all hover:shadow-glowLg hover:-translate-y-0.5 active:translate-y-0 active:scale-[.98] disabled:opacity-60"
        >
          {step === "code" ? t("mfaVerify") : t("signIn")}
        </button>
      </form>

      <OAuthButtons providers={providers} />

      <p className="mt-6 text-center text-sm text-mutedtext">
        {t("noAccount")}{" "}
        <Link href="/signup" className="text-plumborder hover:underline">
          {t("createAccount")}
        </Link>
      </p>
    </GlassCard>
    </Reveal>
  );
}
