"use client";

import { motion } from "motion/react";
import { fadeUp, staggerContainer } from "@/lib/motion";

export interface Stat {
  detail?: string;
  label: string;
  value: string;
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
          className="rounded border border-gm-border bg-background p-4 lg:p-5"
          key={stat.label}
          variants={fadeUp}
        >
          <p className="text-gm-text-muted text-label leading-label">
            {stat.label}
          </p>
          <p className="font-bold text-gm-navy text-heading-sm tabular-nums leading-heading-sm">
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
