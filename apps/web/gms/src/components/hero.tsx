"use client";

import { motion } from "motion/react";

/**
 * Headline and decorative waves for the brand surface. The surface itself —
 * background, radius and padding — belongs to the weather layout, so the
 * forecast panel sits *on* the colour rather than overlapping a separate band.
 */
export function Hero() {
  return (
    <>
      <motion.svg
        animate={{ x: [0, -24, 0] }}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 block h-full w-full"
        preserveAspectRatio="none"
        transition={{
          duration: 18,
          ease: "easeInOut",
          repeat: Number.POSITIVE_INFINITY,
        }}
        viewBox="0 0 1440 420"
      >
        <title>Decorative wave pattern</title>
        <g
          className="stroke-gm-text-inverse"
          fill="none"
          strokeOpacity="0.16"
          strokeWidth="2"
        >
          <path d="M-60 300C180 250 300 120 560 130s360 150 620 96 340-130 400-150" />
          <path d="M-60 350C160 320 320 200 600 196s380 140 640 84 300-120 340-140" />
          <path d="M-60 240C140 180 280 60 520 66s400 160 660 110 300-140 340-160" />
        </g>
      </motion.svg>
      {/* heading-md, not heading-lg: the temperature is the page's largest
          element, and the slogan should not compete with it. */}
      <motion.h1
        animate={{ opacity: 1, y: 0 }}
        className="relative font-bold text-gm-text-inverse text-heading-md leading-heading-md tracking-tight"
        initial={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        Your spice weather
      </motion.h1>
    </>
  );
}
