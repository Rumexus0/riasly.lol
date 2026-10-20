import type { ReactNode } from "react";

export default function GlassCard({
  children,
  className = "",
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={`glass rounded-card shadow-card ${
        hover
          ? "transition-all duration-300 hover:-translate-y-0.5 hover:border-plumborder hover:shadow-glow"
          : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
