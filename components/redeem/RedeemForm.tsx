"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { redeemCode, type RedeemResult } from "@/app/actions/redeem";

const inputCls =
  "h-12 w-full rounded-field border border-edge bg-input px-4 text-softwhite placeholder:text-mutedtext/50 focus:border-plumborder focus:outline-none";

export default function RedeemForm() {
  const t = useTranslations("redeem");
  const [state, formAction, isPending] = useActionState<
    RedeemResult | null,
    FormData
  >(redeemCode, null);

  const message =
    state?.ok
      ? { text: t("success"), good: true }
      : state?.error === "invalid"
        ? { text: t("invalidCode"), good: false }
        : state?.error === "used"
          ? { text: t("alreadyUsed"), good: false }
          : null;

  return (
    <div className="w-full max-w-md rounded-card border border-edge bg-panel p-8">
      <h1 className="text-2xl font-bold text-softwhite">{t("title")}</h1>
      <p className="mt-2 text-[15px] text-mutedtext">{t("subtitle")}</p>

      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-mutedtext">
            {t("codeLabel")}
          </label>
          <input
            name="code"
            required
            autoComplete="off"
            placeholder={t("placeholder")}
            className={inputCls}
          />
        </div>

        {message && (
          <p
            role="status"
            className={`text-sm ${message.good ? "text-plumborder" : "text-plumborder"}`}
          >
            {message.text}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-12 w-full items-center justify-center rounded-pill border border-plumborder bg-plum px-6 text-[15px] font-medium text-softwhite transition-colors hover:bg-aubergine disabled:opacity-60"
        >
          {t("submit")}
        </button>
      </form>
    </div>
  );
}
