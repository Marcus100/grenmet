"use client";

import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { DURATION, EASE_OUT } from "@/lib/motion";

/**
 * Quick opacity fade-in on enter, nothing else. Owner decision of 14 Nov 2026
 * (issue #1408): no exit animation and no `mode="wait"`, so the new page is
 * never held back. This wraps /warnings and /marine/small-craft, which must
 * start showing at once. Reduced motion is handled by MotionConfig.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <motion.div
      animate={{ opacity: 1 }}
      initial={{ opacity: 0 }}
      key={pathname}
      transition={{ duration: DURATION.fast, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
