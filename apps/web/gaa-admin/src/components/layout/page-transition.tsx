"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";

/**
 * Applies to every module behind AppShell (cap, hr, wxwatch, wxproducts,
 * salesbus) — kept to a fast opacity-only fade, no slide or stagger.
 * Staff hit this on every route change all day; anything slower than a
 * fade reads as latency, not polish. Respects prefers-reduced-motion via
 * MotionConfig in the root layout.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        initial={{ opacity: 0 }}
        key={pathname}
        transition={{ duration: 0.12 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
