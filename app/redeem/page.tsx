import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import AppShell from "@/components/AppShell";
import RedeemForm from "@/components/redeem/RedeemForm";
import { getVerifiedSessionUserId } from "@/lib/auth-session";

export const metadata: Metadata = { title: "Redeem — riasly" };
export const dynamic = "force-dynamic";

export default async function RedeemPage() {
  const t = await getTranslations("redeem");
  // Existence-checked: a cookie from a deleted account must not render a form
  // whose action can only fail.
  const userId = await getVerifiedSessionUserId();

  if (!userId) {
    return (
      <AppShell>
        <div className="w-full max-w-md rounded-card border border-edge bg-panel p-8 text-center">
          <h1 className="text-2xl font-bold text-softwhite">{t("title")}</h1>
          <p className="mt-3 text-[15px] text-mutedtext">{t("needLogin")}</p>
          <Link
            href="/login?next=/redeem"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-pill border border-plumborder bg-plum px-6 text-[15px] font-medium text-softwhite hover:bg-aubergine"
          >
            {t("goLogin")}
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <RedeemForm />
    </AppShell>
  );
}
