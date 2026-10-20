import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

const base =
  "group relative inline-flex items-center justify-center gap-2 font-medium rounded-pill transition-all duration-200 select-none whitespace-nowrap overflow-hidden";

const variants: Record<Variant, string> = {
  // Bold violet→fuchsia→cyan gradient, glow, hover shine sweep, tactile press.
  primary:
    "bg-brandgrad text-white shadow-glow hover:shadow-glowLg hover:-translate-y-0.5 active:translate-y-0 active:scale-[.98]",
  // Matte glass secondary with a soft violet glow + ring on hover.
  secondary:
    "glass text-softwhite hover:ring-1 hover:ring-plumborder hover:shadow-glow hover:-translate-y-0.5 active:translate-y-0 active:scale-[.98]",
  ghost: "text-mutedtext hover:text-softwhite",
};

const sizes: Record<Size, string> = {
  md: "text-[15px] px-5 h-11",
  lg: "text-[17px] px-7 h-14",
};

type ButtonProps = {
  children: ReactNode;
  href?: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  icon?: ReactNode;
  "aria-label"?: string;
};

function Shine() {
  return (
    <>
      {/* top inner highlight for depth */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent"
      />
      {/* diagonal shine sweep on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
      />
    </>
  );
}

export default function Button({
  children,
  href,
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  onClick,
  icon,
  ...rest
}: ButtonProps) {
  const classes = `${base} ${variants[variant]} ${sizes[size]} ${className}`;
  const content = (
    <>
      {children}
      {icon}
      {variant !== "ghost" && <Shine />}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes} {...rest}>
        {content}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} className={classes} {...rest}>
      {content}
    </button>
  );
}
