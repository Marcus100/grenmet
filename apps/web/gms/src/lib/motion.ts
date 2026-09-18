import type { Transition, Variants } from "motion/react";

/**
 * Shared motion primitives for gms — the design system's public-facing
 * reference app. Prototype new motion patterns here before promoting them to
 * @barrelsgd/ui. Keep this file free of anything CAP/warnings-adjacent: those
 * surfaces stay on the fast, restrained end deliberately (severity must read
 * instantly), so they use plain CSS transitions instead of these variants.
 */

export const EASE_OUT: Transition["ease"] = [0.16, 1, 0.3, 1];

export const DURATION = {
  fast: 0.15,
  base: 0.35,
  slow: 0.6,
} as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE_OUT },
  },
};

export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
};

export const drawerBackdrop: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.base } },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
};

export const drawerPanel: Variants = {
  hidden: { x: "-100%" },
  show: {
    x: 0,
    transition: { duration: DURATION.slow, ease: EASE_OUT },
  },
  exit: {
    x: "-100%",
    transition: { duration: DURATION.fast, ease: "easeIn" },
  },
};

export const drawerItem: Variants = {
  hidden: { opacity: 0, x: -12 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: DURATION.base, ease: EASE_OUT },
  },
};
