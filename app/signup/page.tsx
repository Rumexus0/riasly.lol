import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import SignupForm from "@/components/auth/SignupForm";
import { getEnabledOAuthProviders } from "@/lib/oauth";
import {
  getVerifiedSessionUserId,
  hasSessionToken,
  safeInternalPath,
} from "@/lib/auth-session";

export const metadata: Metadata = {
  title: "Create your riasly",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{
    handle?: string;
    next?: string;
    stale?: string;
  }>;
}) {
  const { handle, next, stale } = await searchParams;
  // Same database-verified rule as /login: only a *real* account is bounced.
  if (await getVerifiedSessionUserId()) {
    redirect(safeInternalPath(next) ?? "/dashboard");
  }

  const staleNotice = stale === "1" || (await hasSessionToken());
  const providers = getEnabledOAuthProviders();

  return (
    <AppShell>
      <SignupForm
        providers={providers}
        initialHandle={handle ?? ""}
        next={safeInternalPath(next)}
        staleNotice={staleNotice}
      />
    </AppShell>
  );
}
