"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { useMotionPref } from "@/components/motion/Providers";
import type { MotionPref } from "@/lib/motion-pref";

const OPTIONS: MotionPref[] = ["system", "force", "calm"];

// One control for both the public page and the dashboard: the visitor (or the
// owner previewing their page) decides how much of this site moves, and the
// choice is stored on the device — it is a viewing preference, not profile data.
export default function MotionPrefSwitch({
  className = "",
}: {
  className?: string;
}) {
  const t = useTranslations("motion");
  const { pref, choose } = useMotionPref();

  // Nothing until mounted: the stored value cannot be known on the server, and
  // rendering a control whose selected state is guessed is exactly how a
  // hydrated tree ends up disagreeing with itself.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div
      role="radiogroup"
      aria-label={t("title")}
      title={t("hint")}
      className={`inline-flex h-9 items-center gap-1 rounded-pill border border-white/10 bg-nearblack/60 p-1 backdrop-blur ${className}`}
    >
      {OPTIONS.map((option) => {
        const active = pref === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => choose(option)}
            className={`h-full rounded-pill px-2.5 text-xs font-medium transition-colors ${
              active
                ? "bg-plum/30 text-softwhite ring-1 ring-plumborder"
                : "text-mutedtext/70 hover:text-softwhite"
            }`}
          >
            {t(option)}
          </button>
        );
      })}
    </div>
  );
}
