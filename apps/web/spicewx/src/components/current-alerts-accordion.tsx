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
        className="flex h-[45px] w-full shrink-0 items-center justify-between rounded-tl-[6px] rounded-tr-[6px] border-[1.5px] border-gm-navy bg-gm-risk-yellow px-[18px]"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span className="flex items-center gap-[14px] font-bold text-[17px] text-gray-900">
          <ExclamationTriangleIcon className="size-[28px] shrink-0" />
          Current alerts
        </span>
        <ChevronDownIcon
          className={cn(
            "size-[28px] text-gray-900 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="w-full rounded-br-[6px] rounded-bl-[6px] border border-gm-navy bg-gm-navy px-[24px] pt-[22px] pb-[24px]">
          {warnings.map((w) => (
            <div
              className={cn(
                "flex h-[30px] items-center gap-[16px] text-[16px]",
                w.count === 0 && "opacity-35"
              )}
              key={w.region}
            >
              <span className="w-[34px] shrink-0 font-semibold text-gm-risk-yellow">
                {w.count}
              </span>
              <span className="text-white">{w.region}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
