"use client";

import { useTranslations } from "next-intl";

import {
  BADGE_CARD_CAP,
  badgeTintClass,
  getBadge,
  type BadgeDef,
} from "@/lib/badges";
import BadgeIcon from "@/components/icons/BadgeIcon";

/**
 * The profile's earned-badge line: a single light plate carrying one dark disc
 * per badge, the way Discord groups marks on a profile — the pill is the shared
 * frame, and each mark sits on its own dark coin (glyph inherits the tint via
 * currentColor). Each badge is tinted by the owner (`colors`, a
 * { badgeKey: "#rrggbb" } map) or falls back to its catalog tone; BadgeIcon
 * draws with currentColor, so the inline `color` alone repaints the mark.
 *
 * The name is not lost — it survives as `title` (tooltip) and as an `sr-only`
 * string (accessible name), and the full list with descriptions stays on
 * /dashboard/badges. Overflow is a plain +N marker INSIDE the pill, because the
 * card has to keep the name line to one row.
 *
 * Keys come from stored grants, so a renamed/removed badge definition resolves to
 * nothing instead of crashing.
 */
export default function BadgeStrip({
  keys,
  colors = {},
}: {
  keys: string[];
  colors?: Record<string, string>;
}) {
  const tb = useTranslations("badges");

  const items = keys
    .map((k) => getBadge(k))
    .filter((b): b is BadgeDef => !!b);
  if (items.length === 0) return null;

  const visible = items.slice(0, BADGE_CARD_CAP);
  const rest = items.length - visible.length;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-1.5 ring-1 ring-white/10">
      {visible.map((b) => (
        <span
          key={b.key}
          title={tb(`items.${b.key}.name`)}
          className="grid h-7 w-7 place-items-center rounded-full bg-black/40 ring-1 ring-white/10"
        >
          {/* An owner tint wins over the catalog tone; the tone classes stay as the
              default so an untinted badge looks exactly like before. Guard the empty
              case so no literal `undefined` leaks into className. */}
          <span
            className={colors[b.key] ? "" : badgeTintClass[b.tone]}
            style={colors[b.key] ? { color: colors[b.key] } : undefined}
          >
            <BadgeIcon name={b.icon} className="h-4 w-4" />
            <span className="sr-only">{tb(`items.${b.key}.name`)}</span>
          </span>
        </span>
      ))}
      {rest > 0 && (
        <span className="whitespace-nowrap text-[11px] font-semibold leading-none text-mutedtext">
          {tb("showMore", { n: rest })}
        </span>
      )}
    </span>
  );
}
