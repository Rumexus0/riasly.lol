import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import LoginForm from "@/components/auth/LoginForm";
import { getEnabledOAuthProviders } from "@/lib/oauth";
import {
  getVerifiedSessionUserId,
  hasSessionToken,
  safeInternalPath,
} from "@/lib/auth-session";

export const metadata: Metadata = {
  title: "Login — riasly",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; stale?: string; error?: string; verified?: string }>;
}) {
  const { next, stale, error, verified } = await searchParams;
  const target = safeInternalPath(next) ?? "/dashboard";

  // The rule middleware.ts can no longer guess: an authenticated visitor has no
  // business being on /login. Verified against the database, so a session cookie
  // left over from a deleted account degrades into a working form instead of a
  // /login -> /dashboard -> /login redirect cycle.
  //
  // An `error` param is the exception. Auth.js answers a refused account link with
  // /login?error=OAuthAccountNotLinked (or AccountNotLinked on the non-OAuth path)
  // while the visitor is still signed in, so bouncing straight to /dashboard would
  // swallow the only explanation they got.
  if (!error && (await getVerifiedSessionUserId())) redirect(target);

  const staleNotice = stale === "1" || (!error && (await hasSessionToken()));
  const providers = getEnabledOAuthProviders();

  return (
    <AppShell>
      <LoginForm
        providers={providers}
        next={safeInternalPath(next)}
        staleNotice={staleNotice}
        accountNotLinked={error === "AccountNotLinked" || error === "OAuthAccountNotLinked"}
        // `/verify` lands here after confirming an address; the form shows the
        // banner and prefills from sessionStorage rather than being handed the
        // address through this URL, where it would be readable by anyone.
        verifiedNotice={verified === "1"}
      />
    </AppShell>
  );
}
