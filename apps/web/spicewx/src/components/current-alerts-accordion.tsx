"use client";

import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import { useState } from "react";
import type { Warning } from "@/lib/forecast-data";
import { cn } from "@/lib/utils";

interface CurrentAlertsAccordionProps {
  warnings: Warning[];
}

export function CurrentAlertsAccordion({
  warnings,
}: CurrentAlertsAccordionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4 flex flex-col">
      {/* Header */}
      <button
        aria-expanded={open}
        className="flex h-gm-44 w-full shrink-0 items-center justify-between rounded-tl-gm-6 rounded-tr-gm-6 border-2 border-gm-navy bg-gm-risk-yellow px-gm-20"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span className="flex items-center gap-3.5 font-bold text-base text-gm-text-primary">
          <ExclamationTriangleIcon className="size-7 shrink-0" />
          Current alerts
        </span>
        <ChevronDownIcon
          className={cn(
            "size-7 text-gm-text-primary transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="w-full rounded-br-gm-6 rounded-bl-gm-6 border border-gm-navy bg-gm-navy px-gm-24 pt-gm-20 pb-gm-24">
          {warnings.map((w) => (
            <div
              className={cn(
                "flex h-gm-32 items-center gap-gm-16 text-base",
                w.count === 0 && "opacity-35"
              )}
              key={w.region}
            >
              <span className="w-gm-36 shrink-0 font-semibold text-gm-risk-yellow">
                {w.count}
              </span>
              <span className="text-gm-text-inverse">{w.region}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
