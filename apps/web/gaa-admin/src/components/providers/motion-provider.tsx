"use client";

import { MotionConfig } from "motion/react";

/**
 * `reducedMotion="user"` makes every motion primitive in the app — including
 * the in-progress CAP composer's own `motion/react` usage — honour the
 * OS-level prefers-reduced-motion setting automatically.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
