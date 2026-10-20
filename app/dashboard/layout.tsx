import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import DashboardShell from "@/components/dashboard/DashboardShell";

export const dynamic = "force-dynamic";

/**
 * Auth gate + chrome for every dashboard route.
 *
 * Pages used to repeat this block one-by-one (six of them now): fetch the
 * session, check the row still exists, build the logout action, wrap the shell.
 * Keeping it here means a new page only has to fetch its own data.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login?next=/dashboard");

  const user = await prisma.user
    .findUnique({ where: { id: userId }, select: { handle: true } })
    .catch(() => null);

  // Token present but no row: the account is gone. Send the visitor to a login
  // page that still renders (?stale=1) instead of a bare /login round-trip.
  if (!user) redirect("/login?stale=1");

  const logout = async () => {
    "use server";
    await signOut({ redirectTo: "/" });
  };

  return (
    <DashboardShell handle={user.handle ?? ""} logout={logout}>
      {children}
    </DashboardShell>
  );
}
