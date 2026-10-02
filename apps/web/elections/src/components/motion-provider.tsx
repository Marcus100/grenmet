"use client";

import { MotionConfig } from "motion/react";

/**
 * `reducedMotion="user"` makes every motion primitive in the app honour the
 * OS-level prefers-reduced-motion setting automatically — required for a
 * public-sector site, not optional polish.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
