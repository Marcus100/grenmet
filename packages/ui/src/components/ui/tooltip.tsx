"use client";

import { Tooltip } from "@base-ui-components/react/tooltip";
import { cn } from "@grenmet/ui/lib/utils";
import type * as React from "react";

function TooltipProvider({
  delay = 0,
  ...props
}: React.ComponentProps<typeof Tooltip.Provider>) {
  return (
    <Tooltip.Provider data-slot="tooltip-provider" delay={delay} {...props} />
  );
}

function TooltipRoot({ ...props }: React.ComponentProps<typeof Tooltip.Root>) {
  return (
    <TooltipProvider>
      <Tooltip.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  );
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof Tooltip.Trigger>) {
  return <Tooltip.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof Tooltip.Popup> & { sideOffset?: number }) {
  return (
    <Tooltip.Portal>
      <Tooltip.Positioner sideOffset={sideOffset}>
        <Tooltip.Popup
          className={cn(
            "fade-in-0 zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 z-50 w-fit animate-in text-balance rounded-md bg-foreground px-3 py-1.5 text-background text-xs data-closed:animate-out",
            className
          )}
          data-slot="tooltip-content"
          {...props}
        >
          {children}
          <Tooltip.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
        </Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  );
}

export {
  TooltipContent,
  TooltipProvider,
  TooltipRoot as Tooltip,
  TooltipTrigger,
};
