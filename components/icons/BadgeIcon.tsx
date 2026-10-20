// Original badge glyphs (24×24) for the badge system, drawn duotone: a filled
// silhouette at low opacity carries the mass, a crisp stroke carries the detail.
// Registry shape follows components/icons/SocialIcon.tsx, but these are our own
// drawings — deliberately nothing Discord-server / booster / staff related.
//
// The two-layer idiom is what makes a 14px chip read as "minted" rather than
// "outlined": the fill gives the glyph weight against the dark card, the line
// keeps its interior legible. Both layers use currentColor, so badgeToneClass's
// text colour tints the whole mark and the dashboard tiles inherit the upgrade
// for free (same props, same fallback).

import type { BadgeIconName } from "@/lib/badges";

type Glyph = { fill: string[]; line: string[] };

const paths: Record<BadgeIconName, Glyph> = {
  crown: {
    fill: ["M4 8l3.6 3L12 5l4.4 6L20 8l-1.6 10H5.6L4 8z"],
    line: ["M6.4 15.4h11.2", "M12 9.6v3.2"],
  },
  shield: {
    fill: ["M12 3l7 2.6V12c0 4.2-2.9 7.3-7 9-4.1-1.7-7-4.8-7-9V5.6L12 3z"],
    line: ["M9.2 11.8l2 2 3.8-4"],
  },
  check: {
    fill: ["M12 3a9 9 0 110 18 9 9 0 010-18z"],
    line: ["M8.4 12.2l2.5 2.5 4.7-5"],
  },
  layers: {
    fill: ["M12 3l8 4.2-8 4.2-8-4.2L12 3z"],
    line: ["M4 12l8 4.2 8-4.2", "M4 16.2l8 4.2 8-4.2"],
  },
  link: {
    fill: ["M9.9 12.7l2.8-2.8 1.4 1.4-2.8 2.8z"],
    line: [
      "M11.2 6.6L12.8 5a3.6 3.6 0 015 5l-1.6 1.6",
      "M12.8 17.4L11.2 19a3.6 3.6 0 01-5-5l1.6-1.6",
    ],
  },
  palette: {
    fill: [
      "M12 3a9 9 0 100 18c1.4 0 2.1-1 1.6-2.1-.5-1.2.3-2.2 1.6-2.2H17a2.5 2.5 0 002.5-2.5C19.5 7.4 16.2 3 12 3z",
    ],
    line: ["M8.4 10.2h.01", "M11.6 7.8h.01", "M8 14h.01"],
  },
  sparkles: {
    fill: ["M12 4l1.7 4.3L18 10l-4.3 1.7L12 16l-1.7-4.3L6 10l4.3-1.7L12 4z"],
    line: ["M18 15l.7 2.1L21 18l-2.3.8L18 21l-.7-2.2L15 18l2.3-.9L18 15z"],
  },
  upload: {
    fill: ["M12 3.5l4.6 4.6-1.5 1.5L13 7.5V15h-2V7.5L8.9 9.6 7.4 8.1z"],
    line: ["M4.5 15.5v2.5a2 2 0 002 2h11a2 2 0 002-2v-2.5"],
  },
  box: {
    fill: ["M21 8.2L12 3 3 8.2l9 5.2 9-5.2z"],
    line: ["M3 8.2v7.6L12 21l9-5.2V8.2", "M12 13.4V21"],
  },
  eye: {
    fill: ["M12 9.4a2.6 2.6 0 100 5.2 2.6 2.6 0 000-5.2z"],
    line: ["M2.6 12S6.2 5.6 12 5.6 21.4 12 21.4 12 17.8 18.4 12 18.4 2.6 12 2.6 12z"],
  },
  flame: {
    fill: [
      "M12 21c3.3 0 6-2.4 6-5.6 0-3.9-3.2-5.9-4.3-9.4-2 1.4-2.7 3.2-2.7 4.6-1-.5-1.6-1.6-1.6-2.9C7.5 9.3 6 11.7 6 15.4 6 18.6 8.7 21 12 21z",
    ],
    line: ["M12 17.6c1.5 0 2.6-1.1 2.6-2.5 0-1.3-1-2.2-2.6-4-1.6 1.8-2.6 2.7-2.6 4 0 1.4 1.1 2.5 2.6 2.5z"],
  },
  download: {
    fill: ["M12 16.5l-4.2-4.2 1.4-1.4L11 12.7V3.5h2v9.2l1.8-1.8 1.4 1.4z"],
    line: ["M4.5 16v2.5a2 2 0 002 2h11a2 2 0 002-2V16"],
  },
  ticket: {
    fill: [
      "M4 8a2 2 0 012-2h12a2 2 0 012 2v1.2a2 2 0 000 3.6V16a2 2 0 01-2 2H6a2 2 0 01-2-2v-1.2a2 2 0 000-3.6V8z",
    ],
    line: ["M14.5 8v8"],
  },
  medal: {
    fill: ["M12 21a5.2 5.2 0 100-10.4A5.2 5.2 0 0012 21z"],
    line: [
      "M8.4 3h7.2l-2.2 5.6h-2.8L8.4 3z",
      "M12 14.4l.9 1.8 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2L9 16.5l2-.3.9-1.8z",
    ],
  },
  lock: {
    fill: ["M5.4 10h13.2v9.6H5.4V10z"],
    line: ["M7.5 10V7.8a4.5 4.5 0 019 0V10", "M12 13.4v2.4"],
  },
};

export default function BadgeIcon({
  name,
  className = "h-4 w-4",
}: {
  name: BadgeIconName;
  className?: string;
}) {
  const g = paths[name] ?? paths.sparkles;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {g.fill.map((d, i) => (
        <path key={`f${i}`} d={d} fill="currentColor" opacity={0.3} stroke="none" />
      ))}
      {g.line.map((d, i) => (
        <path
          key={`l${i}`}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
