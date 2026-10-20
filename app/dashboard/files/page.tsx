import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { queueBadgeSync } from "@/lib/badge-sync";
import FilesClient from "@/components/dashboard/FilesClient";

export const metadata: Metadata = { title: "Files — riasly" };
export const dynamic = "force-dynamic";

export default async function FilesPage() {
  // The layout already proved the session and the account row exist.
  const userId = await getVerifiedSessionUserId();
  if (!userId) return null;

  queueBadgeSync(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      fileAssets: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          size: true,
          mime: true,
          isPrivate: true,
          downloadCount: true,
        },
      },
    },
  });

  return (
    <FilesClient
      files={(user?.fileAssets ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        size: f.size,
        mime: f.mime,
        isPrivate: f.isPrivate,
        downloadCount: f.downloadCount,
      }))}
    />
  );
}
