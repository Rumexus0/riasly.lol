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

async function load(handle: string): Promise<PublicProfile | null> {
  try {
    return await getPublicProfile(handle);
  } catch {
    return null;
  }
}

// Resolve the requested tab slug to the user's page row (null when it isn't
// theirs or doesn't exist). getPublicProfile already returns pages in one query.
function findPage(profile: PublicProfile, slug: string) {
  return profile.pages.find((p) => p.slug === slug) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; tab: string }>;
}): Promise<Metadata> {
  const { username, tab } = await params;
  const profile = await load(username);
  if (!profile) return { title: `${username} — riasly` };
  const page = findPage(profile, tab);
  if (!page) return { title: `${username} — riasly` };
  return {
    title: `${page.title} · ${profile.name ?? username} (@${username}) — riasly`,
    description: profile.profile?.bio ?? undefined,
  };
}

export default async function ProfileTabPage({
  params,
}: {
  params: Promise<{ username: string; tab: string }>;
}) {
  const { username, tab } = await params;
  const profile = await load(username);
  if (!profile) notFound();

  const page = findPage(profile, tab);
  if (!page) notFound();

  // Real view count, de-duplicated per viewer (1 account = 1 view). A tab view
  // shares the owner's viewer key, so browsing tabs never double-count one visit.
  const viewKey = await resolveViewCountKey(profile.id);
  if (viewKey) void incrementViewCount(profile.id, viewKey);

  return (
    <main className="min-h-screen bg-nearblack">
      <ProfileView
        profile={profile}
        showViewCount
        activeSlug={page.slug}
        pageId={page.id}
      />
    </main>
  );
}
