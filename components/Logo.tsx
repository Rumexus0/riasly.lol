/**
 * riasly brand mark: a compact faceted gem glyph (inline SVG, fill-only paths)
 * set beside the lowercase wordmark, both carrying the brand violet→fuchsia→cyan
 * gradient. Deliberately a server component (no client JS for a static mark) so
 * it is cheap and scales crisply at any zoom.
 *
 * Heights are fixed to the old tile size (`h-5`/`h-7`) so replacing the wordmark
 * never shifts the sticky navbar or the fixed-width dashboard sidebar. The class
 * names avoid the `name-` substring on purpose: the global reduced-motion clamp in
 * app/globals.css exempts `[class*="name-"]`, and the logo must not be swept up by
 * that rule. The gem gradient mirrors tailwind's `brandgrad` stops so the mark and
 * the wordmark read as one colour story.
 */
const SIZES = {
  sm: "h-5 text-[15px]",
  md: "h-7 text-lg",
} as const;

const GLYPH_SIZES = {
  sm: "h-5 w-5",
  md: "h-6 w-6",
} as const;

export default function Logo({
  size = "md",
  showWordmark = true,
  className = "",
}: {
  size?: "sm" | "md";
  showWordmark?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 leading-none whitespace-nowrap ${className}`}
    >
      {/* A brilliant-cut gem: a full gradient silhouette with a lighter table
          facet across the top so it catches the eye the way the old mark did. */}
      <svg viewBox="0 0 24 24" className={GLYPH_SIZES[size]} aria-hidden fill="none">
        <defs>
          <linearGradient
            id="riasly-gem"
            x1="0"
            y1="0"
            x2="24"
            y2="24"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#8B5CF6" />
            <stop offset="0.55" stopColor="#D946EF" />
            <stop offset="1" stopColor="#22D3EE" />
          </linearGradient>
        </defs>
        <path d="M7 3h10l4 6-9 12L3 9l4-6z" fill="url(#riasly-gem)" />
        <path d="M7 3h10l-2.2 6H9.2L7 3z" fill="#ffffff" fillOpacity="0.3" />
      </svg>
      {showWordmark && (
        <span className={`${SIZES[size]} font-bold`}>
          <span className="bg-brandgrad bg-clip-text text-transparent">riasly</span>
        </span>
      )}
    </span>
  );
}
