"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { ActionResult } from "@/app/actions/profile";

// Shared form vocabulary for the dashboard pages. These lived inside
// DashboardClient.tsx while it was the only page; with six routes each owning a
// form, copying them per file is how the error wording would start to drift.

export const inputCls =
  "h-11 w-full rounded-field border border-white/10 bg-white/[0.02] px-3 text-softwhite placeholder:text-mutedtext/40 transition focus:border-plumborder focus:shadow-glow focus:outline-none";

export const btnPrimary =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-pill bg-brandgrad px-5 text-sm font-medium text-white shadow-glow transition-all hover:shadow-glowLg hover:-translate-y-0.5 active:translate-y-0 active:scale-[.98] disabled:opacity-60";

export const btnDanger =
  "shrink-0 text-sm text-mutedtext transition-colors hover:text-plumborder";

// Secondary (outline) action and the native file-picker styling. Both started
// life inside CustomTemplateCard; the avatar card needs the exact same look, and
// two copies is how the two cards would drift apart.
export const btnGhost =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-pill border border-white/10 bg-white/[0.02] px-4 text-sm text-mutedtext transition-colors hover:border-plumborder hover:text-softwhite disabled:cursor-not-allowed disabled:opacity-60";

export const fileInputCls =
  "block w-full text-sm text-mutedtext file:mr-3 file:rounded-pill file:border-0 file:bg-plum file:px-4 file:py-2 file:text-softwhite disabled:opacity-50";

export type Feedback = { kind: "ok" | "err"; msg: string } | null;

export function useFeedback(messages?: {
  ok?: string;
  forbidden?: string;
  lastauth?: string;
}) {
  const t = useTranslations("dashboard");
  const [fb, setFb] = useState<Feedback>(null);
  const report = (res: ActionResult) => {
    if (res.ok) {
      setFb({ kind: "ok", msg: messages?.ok ?? t("actions.saved") });
      return;
    }
    const key =
      res.error === "unauthorized"
        ? "errors.unauthorized"
        : res.error === "badmedia"
          ? "errors.badmedia"
          : res.error === "forbidden"
            ? "errors.forbidden"
            : res.error === "lastauth"
              ? "errors.lastauth"
              : res.error === "quota"
                ? "errors.quota"
                : "errors.invalid";
    // An override only replaces the generic wording for that same failure code.
    const override =
      res.error === "forbidden"
        ? messages?.forbidden
        : res.error === "lastauth"
          ? messages?.lastauth
          : undefined;
    setFb({ kind: "err", msg: override ?? t(key) });
  };
  return { fb, report };
}

export function FeedbackLine({ fb }: { fb: Feedback }) {
  if (!fb) return null;
  return (
    <p
      role="status"
      className={`text-sm ${fb.kind === "ok" ? "text-plumborder" : "text-red-300"}`}
    >
      {fb.msg}
    </p>
  );
}

/**
 * The storage-ceiling message. Upload cards each own their own generic "upload
 * failed" wording in their own translation namespace, but the quota is one
 * account-wide fact stated once on the pricing card — so its text lives once here
 * (dashboard.errors.quota) and every card that can be answered 507 reads it.
 */
export function useQuotaMessage(): string {
  const t = useTranslations("dashboard");
  return t("errors.quota");
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-lg font-bold text-softwhite">{children}</h2>;
}

/** Standard page heading used by the split-out dashboard pages. */
export function PageHeading({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-bold text-softwhite sm:text-3xl">{title}</h1>
      <p className="mt-1 text-mutedtext/80">{subtitle}</p>
      {children}
    </header>
  );
}
