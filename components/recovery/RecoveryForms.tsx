"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import {
  requestPasswordReset,
  completePasswordReset,
  type RequestResetResult,
  type ResetResult,
} from "@/app/actions/recovery";

const inputCls =
  "h-12 w-full rounded-field border border-edge bg-input px-4 text-softwhite placeholder:text-mutedtext/50 focus:border-plumborder focus:outline-none";

const buttonCls =
  "inline-flex h-12 w-full items-center justify-center rounded-pill border border-plumborder bg-plum px-6 text-[15px] font-medium text-softwhite transition-colors hover:bg-aubergine disabled:opacity-60";

export function RequestForm() {
  const t = useTranslations("recovery");
  const [state, formAction, isPending] = useActionState<
    RequestResetResult | null,
    FormData
  >(requestPasswordReset, null);

  return (
    <div className="w-full max-w-md rounded-card border border-edge bg-panel p-8">
      <h1 className="text-2xl font-bold text-softwhite">{t("title")}</h1>
      <p className="mt-2 text-[15px] text-mutedtext">{t("subtitle")}</p>

      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-mutedtext">
            {t("emailLabel")}
          </label>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className={inputCls}
          />
        </div>

        {state?.ok && state.token && (
          <div className="rounded-card border border-edge2 bg-nearblack p-4">
            <p className="text-sm text-mutedtext">{t("sentNote")}</p>
            <p className="mt-2 text-xs uppercase tracking-widest text-mutedtext">
              {t("resetLink")}
            </p>
            <Link
              href={`/recovery?token=${state.token}`}
              className="mt-1 block break-all text-sm text-plumborder hover:underline"
            >
              /recovery?token={state.token}
            </Link>
          </div>
        )}

        <button type="submit" disabled={isPending} className={buttonCls}>
          {t("submit")}
        </button>
      </form>
    </div>
  );
}

export function ResetForm({ token }: { token: string }) {
  const t = useTranslations("recovery");
  const [state, formAction, isPending] = useActionState<
    ResetResult | null,
    FormData
  >(completePasswordReset.bind(null, token), null);

  if (state?.ok) {
    return (
      <div className="w-full max-w-md rounded-card border border-edge bg-panel p-8 text-center">
        <p className="text-[15px] text-softwhite">{t("passwordUpdated")}</p>
        <Link
          href="/login"
          className="mt-4 inline-block text-sm text-plumborder hover:underline"
        >
          {t("goLogin")}
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-card border border-edge bg-panel p-8">
      <h1 className="text-2xl font-bold text-softwhite">
        {t("newPasswordTitle")}
      </h1>

      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-mutedtext">
            {t("passwordLabel")}
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

        {state?.error && (
          <p role="alert" className="text-sm text-plumborder">
            {state.error === "invalidToken"
              ? t("invalidToken")
              : t("invalidEmail")}
          </p>
        )}

        <button type="submit" disabled={isPending} className={buttonCls}>
          {t("updatePassword")}
        </button>
      </form>
    </div>
  );
}
