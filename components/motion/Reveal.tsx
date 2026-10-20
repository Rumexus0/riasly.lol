"use client";

import { m } from "framer-motion";

const variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

// Lightweight scroll-reveal wrapper. Uses the tree-shaken `m` component from
// LazyMotion (registered in Providers). Animates on view, once, and respects
// reduced-motion via MotionConfig. Keep server data-fetching outside this.
export default function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <m.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </m.div>
  );
}
