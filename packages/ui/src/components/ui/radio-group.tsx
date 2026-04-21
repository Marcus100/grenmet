"use client";

import { Radio } from "@base-ui-components/react/radio";
import { RadioGroup } from "@base-ui-components/react/radio-group";
import { cn } from "@grenmet/ui/lib/utils";
import { CircleIcon } from "lucide-react";
import type * as React from "react";

function RadioGroupRoot({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroup>) {
  return (
    <RadioGroup
      className={cn("grid gap-3", className)}
      data-slot="radio-group"
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof Radio.Root>) {
  return (
    <Radio.Root
      className={cn(
        "aspect-square size-4 shrink-0 rounded-full border border-input text-primary shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className
      )}
      data-slot="radio-group-item"
      {...props}
    >
      <Radio.Indicator
        className="relative flex items-center justify-center"
        data-slot="radio-group-indicator"
      >
        <CircleIcon className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary" />
      </Radio.Indicator>
    </Radio.Root>
  );
}

export { RadioGroupItem, RadioGroupRoot as RadioGroup };
