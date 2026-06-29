"use client";

import { Accordion } from "@base-ui/react/accordion";
import { cn } from "@grenmet/ui/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import type * as React from "react";

function AccordionRoot({
  className,
  ...props
}: React.ComponentProps<typeof Accordion.Root>) {
  return (
    <Accordion.Root
      className={cn("w-full", className)}
      data-slot="accordion"
      {...props}
    />
  );
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof Accordion.Item>) {
  return (
    <Accordion.Item
      className={cn("border-b last:border-b-0", className)}
      data-slot="accordion-item"
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Accordion.Trigger>) {
  return (
    <Accordion.Header className="flex">
      <Accordion.Trigger
        className={cn(
          "flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left font-medium text-sm outline-none transition-all hover:underline focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&[data-open]>svg]:rotate-180",
          className
        )}
        data-slot="accordion-trigger"
        {...props}
      >
        {children}
        <ChevronDownIcon className="pointer-events-none size-4 shrink-0 translate-y-0.5 text-muted-foreground transition-transform duration-200" />
      </Accordion.Trigger>
    </Accordion.Header>
  );
}

function AccordionPanel({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Accordion.Panel>) {
  return (
    <Accordion.Panel
      className="overflow-hidden transition-[height] duration-200 ease-out"
      data-slot="accordion-content"
      style={
        { height: "var(--accordion-panel-height, 0)" } as React.CSSProperties
      }
      {...props}
    >
      <div className={cn("pt-0 pb-4 text-sm", className)}>{children}</div>
    </Accordion.Panel>
  );
}

export {
  AccordionItem,
  AccordionPanel as AccordionContent,
  AccordionRoot as Accordion,
  AccordionTrigger,
};
