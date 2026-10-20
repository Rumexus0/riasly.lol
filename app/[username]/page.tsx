import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getPublicProfile,
  incrementViewCount,
  resolveViewCountKey,
  type PublicProfile,
} from "@/lib/profile";
import ProfileView from "@/components/ProfileView";

export const dynamic = "force-dynamic";

async function loadProfile(handle: string): Promise<PublicProfile | null> {
  try {
    return await getPublicProfile(handle);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await loadProfile(username);
  if (!profile) return { title: `${username} — riasly` };
  return {
    title: `${profile.name ?? username} (@${username}) — riasly`,
    description: profile.profile?.bio ?? undefined,
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await loadProfile(username);
  if (!profile) notFound();

  // Real view count, de-duplicated per viewer (1 account = 1 view). The owner
  // previewing their own page resolves to a null key and is never counted.
  const viewKey = await resolveViewCountKey(profile.id);
  if (viewKey) void incrementViewCount(profile.id, viewKey);

  return (
    <main className="min-h-screen bg-nearblack">
      <ProfileView profile={profile} showViewCount />
    </main>
  );
}
