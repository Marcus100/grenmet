"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { fadeUp, staggerContainer } from "@/lib/motion";

export interface Stat {
  /** Text, or a `Measure` that follows the unit switch. */
  detail?: ReactNode;
  label: string;
  /** Text, or a `Measure` that follows the unit switch. */
  value: ReactNode;
}

/** Small figure grid — station counts, normals, totals at a glance. */
export function StatTiles({ stats }: { stats: readonly Stat[] }) {
  return (
    <motion.div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      initial="hidden"
      variants={staggerContainer}
      viewport={{ once: true, margin: "-40px" }}
      whileInView="show"
    >
      {stats.map((stat) => (
        <motion.div
          className="rounded-gm-card border-gm-border bg-background flex flex-col gap-1 border p-4 lg:p-5"
          key={stat.label}
          variants={fadeUp}
        >
          <p className="text-gm-text-muted text-label leading-label font-bold tracking-wider uppercase">
            {stat.label}
          </p>
          <p className="font-gm-display text-gm-heading text-heading-lg leading-heading-lg font-bold tabular-nums">
            {stat.value}
          </p>
          {stat.detail && (
            <p className="text-body text-gm-text-secondary leading-body">
              {stat.detail}
            </p>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}
