"use client";

import { motion } from "motion/react";

/**
 * Headline above the forecast panel. No background surface — the weather
 * layout renders this on the page background.
 */
export function Hero() {
  return (
    // heading-md, not heading-lg: the temperature is the page's largest
    // element, and the slogan should not compete with it.
    <motion.h1
      animate={{ opacity: 1, y: 0 }}
      className="font-bold text-gm-navy text-heading-md leading-heading-md tracking-tight"
      initial={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      Your spice weather
    </motion.h1>
  );
}
