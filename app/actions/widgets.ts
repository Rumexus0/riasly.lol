"use server";

import { z } from "zod";

import { getVerifiedSessionUserId } from "@/lib/auth-session";
import { prisma } from "@/lib/db";
import { revalidateDashboard, revalidateProfilePages } from "@/lib/revalidate";
import { updateDiscordWidget } from "./profile";
import {
  appOrigin,
  isWidgetType,
  normalizeSlug,
  resolveEmbed,
  PREMIUM_WIDGET_TYPES,
  FREE_PAGE_LIMIT,
  FREE_PER_PAGE_LIMIT,
  FREE_WIDGET_LIMIT,
  type WidgetType,
} from "@/lib/widgets";

// ActionResult-style vocabulary, extended with the codes this feature adds:
// "limit" (free plan ceiling), "missing" (a pageId that isn't the caller's),
// and "premium" (a PREMIUM_WIDGET_TYPES key added by a FREE-plan user).
export type WidgetResult = {
  ok: boolean;
  error?: "invalid" | "unauthorized" | "forbidden" | "limit" | "missing" | "premium";
  data?: { id?: string };
};

// FormData.get() is null for an absent field, but Zod's .optional() only covers
// undefined — normalize so a missing input never silently fails validation.
const str = (v: FormDataEntryValue | null): string =>
  typeof v === "string" ? v : "";

async function requireUser(): Promise<{ id: string; plan: string; handle: string | null } | null> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return null;
  return prisma.user
    .findUnique({ where: { id: userId }, select: { id: true, plan: true, handle: true } })
    .catch(() => null);
}

/**
 * Add one widget to the home page (pageId empty) or to one of the user's tabs.
 * Stores the CANONICAL embed the adapter produced, never the raw input, so a
 * dead link or an off-allowlist host is rejected here rather than rendered later.
 */
export async function addWidget(formData: FormData): Promise<WidgetResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const parsed = z
    .object({
      type: z.string().trim().min(1).max(24),
      label: z.string().trim().max(60).default(""),
      source: z.string().trim().max(300).default(""),
      pageId: z.string().trim().max(64).default(""),
    })
    .safeParse({
      type: str(formData.get("type")),
      label: str(formData.get("label")),
      source: str(formData.get("source")),
      pageId: str(formData.get("pageId")),
    });
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { source } = parsed.data;
  if (!isWidgetType(parsed.data.type)) return { ok: false, error: "invalid" };
  const type: WidgetType = parsed.data.type;

  // Premium gate runs BEFORE the resolver so a FREE user gets a clear
  // "upgrade" error rather than a generic invalid, and so we never spend a
  // URL parse on a widget we would reject anyway.
  if (PREMIUM_WIDGET_TYPES.has(type) && user.plan !== "PREMIUM") {
    return { ok: false, error: "premium" };
  }

  // A page target must exist and belong to this user; empty means the home page.
  let pageId: string | null = null;
  if (parsed.data.pageId) {
    const page = await prisma.page
      .findFirst({ where: { id: parsed.data.pageId, userId: user.id }, select: { id: true } })
      .catch(() => null);
    if (!page) return { ok: false, error: "missing" };
    pageId = page.id;
  }

  const resolved = resolveEmbed(type, source, appOrigin());
  if (!resolved.ok) return { ok: false, error: "invalid" };

  // Free-plan ceilings: total widgets, and widgets on the specific target page.
  if (user.plan === "FREE") {
    const total = await prisma.widget.count({ where: { userId: user.id } }).catch(() => 0);
    if (total >= FREE_WIDGET_LIMIT) return { ok: false, error: "limit" };

    const onTarget = await prisma.widget
      .count({ where: { userId: user.id, pageId } })
      .catch(() => 0);
    if (onTarget >= FREE_PER_PAGE_LIMIT) return { ok: false, error: "limit" };
  }

  // Order within the same surface (home vs. a given tab), not globally, so each
  // page's own list starts at 0.
  const position = await prisma.widget.count({ where: { userId: user.id, pageId } });

  const fallbackLabel =
    type === "text" ? "Note" : type.charAt(0).toUpperCase() + type.slice(1);

  const created = await prisma.widget
    .create({
      data: {
        userId: user.id,
        type,
        label: parsed.data.label || fallbackLabel,
        sourceUrl: resolved.embedUrl,
        extra: resolved.extra ?? null,
        position,
        pageId,
      },
    })
    .catch(() => null);
  if (!created) return { ok: false, error: "invalid" };

  await revalidateProfilePages(user.handle);
  await revalidateDashboard();
  return { ok: true, data: { id: created.id } };
}

export async function deleteWidget(id: string): Promise<WidgetResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const checked = z.string().trim().min(1).max(64).safeParse(id);
  if (!checked.success) return { ok: false, error: "invalid" };

  // Scoped to the caller, so another account's id is a silent no-op.
  await prisma.widget.deleteMany({ where: { id: checked.data, userId: user.id } });
  await revalidateProfilePages(user.handle);
  await revalidateDashboard();
  return { ok: true };
}

/** Create an extra profile tab. Slug is normalized + reserved words blocked. */
export async function addPage(formData: FormData): Promise<WidgetResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const parsed = z
    .object({
      slug: z.string().trim().max(40).default(""),
      title: z.string().trim().max(40).default(""),
    })
    .safeParse({
      slug: str(formData.get("slug")),
      title: str(formData.get("title")),
    });
  if (!parsed.success) return { ok: false, error: "invalid" };

  const slug = normalizeSlug(parsed.data.slug);
  if (!slug) return { ok: false, error: "invalid" };

  if (user.plan === "FREE") {
    const pages = await prisma.page.count({ where: { userId: user.id } }).catch(() => 0);
    if (pages >= FREE_PAGE_LIMIT) return { ok: false, error: "limit" };
  }

  const title = parsed.data.title || "Untitled";
  const position = await prisma.page.count({ where: { userId: user.id } });

  // The unique index (userId, slug) is the real guard against a race; a violation
  // surfaces as "invalid" so the UI can just say "that tab name is taken".
  const created = await prisma.page
    .create({ data: { userId: user.id, slug, title, position } })
    .catch(() => null);
  if (!created) return { ok: false, error: "invalid" };

  await revalidateProfilePages(user.handle);
  await revalidateDashboard();
  return { ok: true, data: { id: created.id } };
}

export async function deletePage(id: string): Promise<WidgetResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const checked = z.string().trim().min(1).max(64).safeParse(id);
  if (!checked.success) return { ok: false, error: "invalid" };

  // Cascade (Widget.pageId onDelete: Cascade) removes the tab's widgets too.
  await prisma.page.deleteMany({ where: { id: checked.data, userId: user.id } });
  await revalidateProfilePages(user.handle);
  await revalidateDashboard();
  return { ok: true };
}

/**
 * Master switch for the whole widget hub. Writes ONE boolean column on Profile;
 * when false, ProfileView hands ProfileStage an empty widget list AND hides the
 * Discord presence card, so the owner can turn every widget off in one click
 * without deleting rows. Defaults true in the schema so a pre-modal profile
 * renders exactly as it did before this feature existed.
 */
export async function setWidgetsEnabled(enabled: boolean): Promise<WidgetResult> {
  const userId = await getVerifiedSessionUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const user = await prisma.user
    .findUnique({ where: { id: userId }, select: { handle: true } })
    .catch(() => null);
  if (!user) return { ok: false, error: "unauthorized" };

  await prisma.profile.upsert({
    where: { userId },
    create: { userId, widgetsEnabled: !!enabled },
    update: { widgetsEnabled: !!enabled },
  });
  await revalidateProfilePages(user.handle);
  await revalidateDashboard();
  return { ok: true };
}

// The modal has one import site for every widget-shaped action. The actual write
// lives in app/actions/profile.ts (it touches only the four discordCard* columns,
// a disjoint set from updateProfileStyle). A "use server" module may only export
// async functions, so we wrap the imported action rather than re-export it.
export async function updateDiscordStatusWidget(formData: FormData) {
  return updateDiscordWidget(formData);
}
