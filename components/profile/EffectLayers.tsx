"use client";

import type { CSSProperties } from "react";

import type { FxKey } from "@/lib/template-recipes";

// The overlay half of a template recipe. Everything here is decoration in the
// strict sense: aria-hidden (the artwork carries the meaning, not this),
// pointer-events-none and inset-0 (from .fx-layer in app/globals.css), and drawn
// below the scrim so text keeps the contrast it was given.
//
// Layers cost nothing to fetch — every one of them is a gradient or a single
// inline SVG tile. That is why effects stay CSS even now that the artwork itself
// is a rendered 4K file: a grain baked into that file could never react to a
// visitor's motion choice, and the CSS layer on top of it would double it.
export default function EffectLayers({
  fx,
  accent,
  compact = false,
}: {
  fx: FxKey[];
  accent: string;
  /** Gallery thumbs are ~340px, a page is 1080p: particles scale with the frame. */
  compact?: boolean;
}) {
  if (fx.length === 0) return null;

  // The accent travels as a custom property so one stylesheet serves every
  // template, instead of a generated class per colour.
  const style = { ["--fx-accent" as string]: accent } as CSSProperties;

  return (
    <div aria-hidden className="fx-layer profile-effects-immutable" style={style}>
      {fx.map((key) =>
        key === "particles" ? (
          <Particles key={key} compact={compact} />
        ) : (
          <div key={key} className={`fx-layer fx-${key}`} />
        )
      )}
    </div>
  );
}

// Three drifting blooms, the same shape the offline gradient fallback uses — so a
// template with particles and a broken hotlink look related, not contradictory.
function Particles({ compact }: { compact: boolean }) {
  const size = compact
    ? ["h-14 w-14", "h-16 w-16", "h-12 w-12"]
    : ["h-40 w-40", "h-52 w-52", "h-44 w-44"];
  const spots = [
    "left-[15%] top-[18%]",
    "right-[12%] top-[46%]",
    "bottom-[12%] left-[32%]",
  ];
  const delays = ["", "[animation-delay:2.5s]", "[animation-delay:4.5s]"];

  return (
    <div className="fx-layer opacity-40">
      {spots.map((spot, i) => (
        <span
          key={spot}
          className={`absolute ${spot} ${size[i]} rounded-full blur-3xl animate-particle ${delays[i]}`}
          style={{
            background:
              i === 0
                ? "var(--fx-accent, #8b5cf6)"
                : i === 1
                  ? "#22d3ee"
                  : "#d946ef",
          }}
        />
      ))}
    </div>
  );
}
