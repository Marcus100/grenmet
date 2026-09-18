"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";

/**
 * Restrained on purpose: this wraps every standing content page (including
 * /warnings and /marine/small-craft), so it stays a quick fade — no
 * stagger, no bounce — CAP severity must still read on first frame.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        initial={{ opacity: 0, y: 6 }}
        key={pathname}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
