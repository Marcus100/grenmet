"use client";

import { Switch } from "@base-ui-components/react/switch";
import { cn } from "@grenmet/ui/lib/utils";
import type * as React from "react";

function SwitchRoot({
  className,
  ...props
}: React.ComponentProps<typeof Switch.Root>) {
  return (
    <Switch.Root
      className={cn(
        "peer inline-flex h-5 w-8 shrink-0 items-center rounded-gm-full border border-transparent shadow-none outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-primary data-[unchecked]:bg-input",
        className
      )}
      data-slot="switch"
      {...props}
    >
      <Switch.Thumb
        className={cn(
          "pointer-events-none block size-4 rounded-gm-full bg-background ring-0 transition-transform data-[checked]:translate-x-3.5 data-[unchecked]:translate-x-0 data-[checked]:bg-primary-foreground"
        )}
        data-slot="switch-thumb"
      />
    </Switch.Root>
  );
}

export { SwitchRoot as Switch };
