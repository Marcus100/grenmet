"use client";

import { Popover } from "@base-ui-components/react/popover";
import { cn } from "@grenmet/ui/lib/utils";
import type * as React from "react";

function PopoverRoot({ ...props }: React.ComponentProps<typeof Popover.Root>) {
  return <Popover.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof Popover.Trigger>) {
  return <Popover.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverClose({
  ...props
}: React.ComponentProps<typeof Popover.Close>) {
  return <Popover.Close data-slot="popover-close" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof Popover.Popup> & {
  align?: "start" | "center" | "end";
  sideOffset?: number;
}) {
  return (
    <Popover.Portal>
      <Popover.Positioner align={align} sideOffset={sideOffset}>
        <Popover.Popup
          className={cn(
            "data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[open]:fade-in-0 data-[open]:zoom-in-95 z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden data-[closed]:animate-out data-[open]:animate-in",
            className
          )}
          data-slot="popover-content"
          {...props}
        />
      </Popover.Positioner>
    </Popover.Portal>
  );
}

export { PopoverRoot as Popover, PopoverTrigger, PopoverContent, PopoverClose };
