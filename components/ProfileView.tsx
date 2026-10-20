import type { PublicProfile } from "@/lib/profile";
import { MAX_FX_LAYERS, getRecipeFor, type FxKey } from "@/lib/template-recipes";
import { getCatalogTemplateByUrl } from "@/lib/catalog";
import { isWidgetType, type StoredWidget } from "@/lib/widgets";
import { buildProfileStyle } from "@/lib/profile-style";
import { parseBadgeColors } from "@/lib/badges";
import ProfileStage from "@/components/profile/ProfileStage";
import AnimatedTabTitle from "@/components/profile/AnimatedTabTitle";

// Server component: maps the Prisma-derived PublicProfile into plain,
// serializable props for the client ProfileStage (which owns the animated
// background, pointer effects and frameless layout). Keeps the server/client
// boundary clean — no hooks or motion values run here.
export default async function ProfileView({
  profile,
  showViewCount = false,
  activeSlug = null,
  pageId = null,
}: {
  profile: PublicProfile;
  showViewCount?: boolean;
  /** Slug of the tab being shown (null = home). Drives the tab bar highlight. */
  activeSlug?: string | null;
  /** Filter for which widgets to render: null = home, set = that tab's page id. */
  pageId?: string | null;
}) {
  // Rows written before the action enforced "one account per platform" still
  // exist; the newest connection per platform is what a visitor should see.
  const byPlatform = new Map<string, (typeof profile.socialLinks)[number]>();
  for (const s of profile.socialLinks) byPlatform.set(s.platform, s);
  const socials = [...byPlatform.values()];

  // Resolve the curated template's motion + effect recipe here, on the server:
  // ProfileStage then receives two plain values and the public bundle never has
  // to carry the catalog. An uploaded background matches nothing, and a template
  // an admin hid from the gallery still resolves — hiding is a gallery filter,
  // never a change to somebody's page. getCatalogTemplateByUrl searches the code
  // catalog first, so the 65 curated templates still cost this page zero queries;
  // only an admin-added row adds one read.
  const template = await getCatalogTemplateByUrl(profile.profile?.bannerUrl ?? null);
  const recipe = template ? getRecipeFor(template) : null;

  // The style system (colors, opacity/blur, effects, toggles) resolved once here
  // so ProfileStage gets a plain object and never reads the DB shape itself.
  const style = buildProfileStyle(profile.profile);

  // A user-chosen background effect OVERRIDES the per-template recipe; "none"
  // forces a clean page. When nothing is picked, the recipe decides as before.
  const fx: FxKey[] = style.bgEffect
    ? style.bgEffect === "none"
      ? []
      : [style.bgEffect as FxKey]
    : (recipe?.fx ?? []).slice(0, MAX_FX_LAYERS);

  // Widgets for the surface being rendered: home has pageId null, a tab has its
  // own id. Guard the type on the way out so a stray/legacy row can't smuggle an
  // unknown key to the client renderer (which would fall through to `undefined`).
  // The master switch (Profile.widgetsEnabled) short-circuits the whole list so
  // the widget hub modal's "Devre dışı" pill has an immediate, uniform effect.
  const wantPage = pageId ?? null;
  const widgets: StoredWidget[] = !style.widgetsEnabled
    ? []
    : profile.widgets
        .filter((w) => (w.pageId ?? null) === wantPage && isWidgetType(w.type))
        .map((w) => ({
          id: w.id,
          type: w.type as StoredWidget["type"],
          label: w.label,
          sourceUrl: w.sourceUrl,
          extra: w.extra,
        }));
  const tabs = profile.pages.map((p) => ({ slug: p.slug, title: p.title }));

  // Owner tints for the badge pill. The column is a loose JSON blob, so it is
  // parsed defensively (parseBadgeColors): a corrupt map degrades to "no tints"
  // (catalog tones) instead of throwing during the page render.
  const badgeColors = parseBadgeColors(profile.profile?.badgeColors);

  return (
    <>
      {/* The typewriter browser-tab title: it deletes and retypes `@handle`
          while this profile is open in its own tab. Renders nothing itself. */}
      <AnimatedTabTitle handle={profile.handle ?? ""} />
      <ProfileStage
      handle={profile.handle ?? ""}
      name={profile.name ?? null}
      bio={profile.profile?.bio ?? null}
      plan={profile.plan}
      accent={profile.profile?.accentColor || "#8B5CF6"}
      bgUrl={profile.profile?.bannerUrl || null}
      avatarUrl={profile.profile?.avatarUrl || null}
      viewCount={profile.profile?.viewCount ?? 0}
      showViewCount={showViewCount}
      socials={socials.map((s) => ({
        id: s.id,
        platform: s.platform,
        url: s.url,
      }))}
      links={profile.bioLinks.map(
        (l: { id: string; label: string; url: string }) => ({
          id: l.id,
          label: l.label,
          url: l.url,
        })
      )}
      // Plain strings keep the server/client boundary clean; BadgeStrip resolves
      // each key against the catalog in lib/badges.ts.
      badges={profile.userBadges.map((b) => b.badgeKey)}
      badgeColors={badgeColors}
      motion={recipe?.motion ?? null}
      fx={fx}
      style={style}
      widgets={widgets}
      tabs={tabs}
      activeSlug={activeSlug}
    />
    </>
  );
}
