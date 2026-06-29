"use client";

import { Checkbox } from "@base-ui/react/checkbox";
import { cn } from "@grenmet/ui/lib/utils";
import { CheckIcon } from "lucide-react";
import type * as React from "react";

function CheckboxRoot({
  className,
  ...props
}: React.ComponentProps<typeof Checkbox.Root>) {
  return (
    <Checkbox.Root
      className={cn(
        "peer size-4 shrink-0 rounded-gm-2 border border-input shadow-none outline-none transition-shadow focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground",
        className
      )}
      data-slot="checkbox"
      {...props}
    >
      <Checkbox.Indicator
        className="grid place-content-center text-current transition-none"
        data-slot="checkbox-indicator"
      >
        <CheckIcon className="size-3.5" />
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}

export { CheckboxRoot as Checkbox };
