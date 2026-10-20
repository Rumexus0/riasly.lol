"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { signUpUser, type AuthResult } from "@/app/actions/auth";
import OAuthButtons from "./OAuthButtons";
import GlassCard from "../ui/GlassCard";
import Reveal from "../motion/Reveal";
import type { OAuthProvider } from "@/lib/oauth";

const inputCls =
  "h-12 w-full rounded-field border border-edge bg-input px-4 text-softwhite placeholder:text-mutedtext/50 transition-all focus:border-plumborder focus:shadow-glow focus:outline-none";

export default function SignupForm({
  providers,
  initialHandle = "",
  next,
  staleNotice = false,
}: {
  providers: OAuthProvider[];
  initialHandle?: string;
  next?: string | null;
  staleNotice?: boolean;
}) {
  const t = useTranslations("auth");
  const tc = useTranslations("claim");
  const [state, formAction, isPending] = useActionState<AuthResult | null, FormData>(
    signUpUser,
    null
  );

  const errorMessage =
    state && !state.ok
      ? state.error === "emailTaken"
        ? t("emailTaken")
        : state.error === "handleTaken"
          ? t("handleTaken")
          : state.error === "invalid"
            ? tc("invalid")
            : state.error === "tooMany"
              ? t("tooMany")
              // The account was created but the verification mail did not go out —
              // worth naming, because /verify is the documented way to finish it.
              : state.error === "emailFailed"
                ? t("emailFailed")
                : t("genericError")
      : null;

  return (
    <Reveal className="w-full max-w-md">
    <GlassCard className="p-8">
      <h1 className="text-gradient text-2xl font-bold">{t("signupTitle")}</h1>
      <p className="mt-2 text-[15px] text-mutedtext">{t("signupSubtitle")}</p>

      {staleNotice && (
        <p className="mt-3 text-[13px] text-mutedtext" role="status">
          {t("staleSession")}
        </p>
      )}

      <form action={formAction} className="mt-6 space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <div>
          <label className="mb-1.5 block text-sm text-mutedtext">{t("name")}</label>
          <input name="name" required autoComplete="name" className={inputCls} />
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-mutedtext">{t("email")}</label>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-mutedtext">{t("handle")}</label>
          <div className="flex items-stretch overflow-hidden rounded-field border border-edge bg-input transition-all focus-within:border-plumborder focus-within:shadow-glow">
            <span className="flex items-center border-r border-edge px-3 text-mutedtext select-none">
              {tc("prefix")}
            </span>
            <input
              name="handle"
              required
              defaultValue={initialHandle}
              autoComplete="off"
              spellCheck={false}
              placeholder={tc("placeholder")}
              className="h-12 w-full bg-transparent px-3 text-softwhite placeholder:text-mutedtext/50 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-mutedtext">
            {t("password")}
          </label>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputCls}
          />
        </div>

        {errorMessage && (
          <p className="text-sm text-plumborder" role="alert">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-12 w-full items-center justify-center rounded-pill bg-brandgrad px-6 text-[15px] font-medium text-white shadow-glow transition-all hover:shadow-glowLg hover:-translate-y-0.5 active:translate-y-0 active:scale-[.98] disabled:opacity-60"
        >
          {t("createAccount")}
        </button>
      </form>

      <OAuthButtons providers={providers} />

      <p className="mt-6 text-center text-sm text-mutedtext">
        {t("haveAccount")}{" "}
        <Link href="/login" className="text-plumborder hover:underline">
          {t("signIn")}
        </Link>
      </p>
    </GlassCard>
    </Reveal>
  );
}
