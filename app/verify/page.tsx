import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import VerifyEmailForm from "@/components/auth/VerifyEmailForm";
import { prisma } from "@/lib/db";
import { safeInternalPath } from "@/lib/auth-session";
import { readVerifyUserId } from "@/lib/verify-cookie";

export const metadata: Metadata = {
  title: "Confirm your email — riasly",
};

// Reads a request cookie, so this page is never a static render: a cached stage
// would show one visitor's address to the next.
export const dynamic = "force-dynamic";

/**
 * The verification step of signup. Public by construction — the middleware matcher
 * only guards `/dashboard/:path*` and `/redeem`, and an account that has not
 * verified yet has no session to guard with.
 *
 * Which stage the form opens on is decided here, from the signed cookie: an account
 * that was just created lands on the code, anyone else (or a cookie that has aged
 * out) starts by naming the address. Nothing about this page grants access; only
 * `authorize()` does that, and it keeps refusing until the flag is cleared.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const userId = await readVerifyUserId();

  const user = userId
    ? await prisma.user
        .findUnique({
          where: { id: userId },
          select: { email: true, verifyEmail: true },
        })
        .catch(() => null)
    : null;

  // A stale pointer to an account that has since been verified: there is nothing
  // left to confirm here, so send the visitor where they are actually going.
  if (user && !user.verifyEmail) redirect("/login?verified=1");

  const email = user?.email ?? null;

  return (
    <AppShell>
      <VerifyEmailForm
        stage={email ? "code" : "email"}
        email={email}
        next={safeInternalPath(next)}
      />
    </AppShell>
  );
}
