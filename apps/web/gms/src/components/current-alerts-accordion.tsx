"use client";

import { Accordion } from "@base-ui/react/accordion";
import { ChevronDownIcon, TriangleAlertIcon } from "lucide-react";
import type { Warning } from "@/lib/forecast-data";
import { cn } from "@/lib/utils";

interface CurrentAlertsAccordionProps {
  warnings: Warning[];
}

export function CurrentAlertsAccordion({
  warnings,
}: CurrentAlertsAccordionProps) {
  return (
    <Accordion.Root className="mb-4 flex flex-col">
      <Accordion.Item value="alerts">
        <Accordion.Header className="flex">
          <Accordion.Trigger className="group flex h-11 w-full shrink-0 items-center justify-between rounded-tl-md rounded-tr-md border-2 border-gm-navy bg-gm-risk-yellow px-5">
            <span className="flex items-center gap-3.5 font-bold text-base text-gm-text-primary">
              <TriangleAlertIcon className="size-7 shrink-0" />
              Current alerts
            </span>
            <ChevronDownIcon className="size-7 text-gm-text-primary transition-transform duration-200 group-data-[open]:rotate-180" />
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel
          className="overflow-hidden transition-[height] duration-200 ease-out"
          style={
            {
              height: "var(--accordion-panel-height, 0)",
            } as React.CSSProperties
          }
        >
          <div className="w-full rounded-br-md rounded-bl-md border border-gm-navy bg-gm-navy px-6 pt-5 pb-6">
            {warnings.map((w) => (
              <div
                className={cn(
                  "flex h-8 items-center gap-4 text-base",
                  w.count === 0 && "opacity-35"
                )}
                key={w.region}
              >
                <span className="w-9 shrink-0 font-semibold text-gm-risk-yellow">
                  {w.count}
                </span>
                <span className="text-gm-text-inverse">{w.region}</span>
              </div>
            ))}
          </div>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion.Root>
  );
}
