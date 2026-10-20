"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { LOCALE_COOKIE, locales, type Locale } from "@/i18n/request";

const schema = z.object({
  locale: z.enum([locales[0], locales[1]] as [Locale, Locale]),
  redirectTo: z.string().optional(),
});

export async function switchLocale(formData: FormData) {
  const parsed = schema.safeParse({
    locale: formData.get("locale"),
    redirectTo: formData.get("redirectTo") ?? undefined,
  });
  if (!parsed.success) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, parsed.data.locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  redirect(parsed.data.redirectTo || "/");
}
