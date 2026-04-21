"use client";

import { Select } from "@base-ui-components/react/select";
import { cn } from "@grenmet/ui/lib/utils";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type * as React from "react";

function SelectRoot({ ...props }: React.ComponentProps<typeof Select.Root>) {
  return <Select.Root data-slot="select" {...props} />;
}

function SelectGroup({ ...props }: React.ComponentProps<typeof Select.Group>) {
  return <Select.Group data-slot="select-group" {...props} />;
}

function SelectValue({ ...props }: React.ComponentProps<typeof Select.Value>) {
  return <Select.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof Select.Trigger> & {
  size?: "sm" | "default";
}) {
  return (
    <Select.Trigger
      className={cn(
        "flex w-fit items-center justify-between gap-2 whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[size=default]:h-9 data-[size=sm]:h-8 data-placeholder:text-muted-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:hover:bg-input/50 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      data-size={size}
      data-slot="select-trigger"
      {...props}
    >
      {children}
      <Select.Icon>
        <ChevronDownIcon className="size-4 opacity-50" />
      </Select.Icon>
    </Select.Trigger>
  );
}

function SelectContent({
  className,
  children,
  align = "center",
  ...props
}: React.ComponentProps<typeof Select.Popup> & {
  align?: "start" | "center" | "end";
  position?: string;
}) {
  return (
    <Select.Portal>
      <Select.Positioner align={align}>
        <Select.Popup
          className={cn(
            "data-closed:fade-out-0 data-closed:zoom-out-95 data-open:fade-in-0 data-open:zoom-in-95 relative z-50 max-h-[var(--available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-closed:animate-out data-open:animate-in",
            className
          )}
          data-slot="select-content"
          {...props}
        >
          <Select.ScrollUpArrow className="flex cursor-default items-center justify-center py-1">
            <ChevronUpIcon className="size-4" />
          </Select.ScrollUpArrow>
          <Select.List className="p-1">{children}</Select.List>
          <Select.ScrollDownArrow className="flex cursor-default items-center justify-center py-1">
            <ChevronDownIcon className="size-4" />
          </Select.ScrollDownArrow>
        </Select.Popup>
      </Select.Positioner>
    </Select.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof Select.GroupLabel>) {
  return (
    <Select.GroupLabel
      className={cn("px-2 py-1.5 text-muted-foreground text-xs", className)}
      data-slot="select-label"
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Select.Item>) {
  return (
    <Select.Item
      className={cn(
        "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      data-slot="select-item"
      {...props}
    >
      <span
        className="absolute right-2 flex size-3.5 items-center justify-center"
        data-slot="select-item-indicator"
      >
        <Select.ItemIndicator>
          <CheckIcon className="size-4" />
        </Select.ItemIndicator>
      </span>
      <Select.ItemText>{children}</Select.ItemText>
    </Select.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Select.Separator>) {
  return (
    <Select.Separator
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      data-slot="select-separator"
      {...props}
    />
  );
}

export {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectRoot as Select,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
