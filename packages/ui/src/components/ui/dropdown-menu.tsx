"use client";

import { Menu } from "@base-ui-components/react/menu";
import { cn } from "@grenmet/ui/lib/utils";
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react";
import type * as React from "react";

function DropdownMenu({ ...props }: React.ComponentProps<typeof Menu.Root>) {
  return <Menu.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof Menu.Trigger>) {
  return <Menu.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof Menu.Group>) {
  return <Menu.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof Menu.RadioGroup>) {
  return <Menu.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof Menu.SubmenuRoot>) {
  return <Menu.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof Menu.Popup> & {
  sideOffset?: number;
}) {
  return (
    <Menu.Portal>
      <Menu.Positioner sideOffset={sideOffset}>
        <Menu.Popup
          className={cn(
            "data-closed:fade-out-0 data-closed:zoom-out-95 data-open:fade-in-0 data-open:zoom-in-95 z-50 max-h-(--available-height) min-w-32 overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none data-closed:animate-out data-open:animate-in",
            className
          )}
          data-slot="dropdown-menu-content"
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
  );
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof Menu.Item> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <Menu.Item
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden data-[variant=destructive]:data-highlighted:bg-destructive/10 data-[variant=destructive]:data-highlighted:text-destructive data-disabled:pointer-events-none data-highlighted:bg-accent data-[variant=destructive]:text-destructive data-highlighted:text-accent-foreground data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0",
        inset && "pl-8",
        className
      )}
      data-inset={inset}
      data-slot="dropdown-menu-item"
      data-variant={variant}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem
      checked={checked}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      data-slot="dropdown-menu-checkbox-item"
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <Menu.CheckboxItemIndicator>
          <CheckIcon className="size-4" />
        </Menu.CheckboxItemIndicator>
      </span>
      {children}
    </Menu.CheckboxItem>
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      data-slot="dropdown-menu-radio-item"
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <Menu.RadioItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </Menu.RadioItemIndicator>
      </span>
      {children}
    </Menu.RadioItem>
  );
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof Menu.GroupLabel> & {
  inset?: boolean;
}) {
  return (
    <Menu.GroupLabel
      className={cn(
        "px-2 py-1.5 font-medium text-sm",
        inset && "pl-8",
        className
      )}
      data-inset={inset}
      data-slot="dropdown-menu-label"
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Menu.Separator>) {
  return (
    <Menu.Separator
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      data-slot="dropdown-menu-separator"
      {...props}
    />
  );
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "ml-auto text-muted-foreground text-xs tracking-widest",
        className
      )}
      data-slot="dropdown-menu-shortcut"
      {...props}
    />
  );
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof Menu.SubmenuTrigger> & {
  inset?: boolean;
}) {
  return (
    <Menu.SubmenuTrigger
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden data-highlighted:bg-accent data-open:bg-accent data-highlighted:text-accent-foreground data-open:text-accent-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0",
        inset && "pl-8",
        className
      )}
      data-inset={inset}
      data-slot="dropdown-menu-sub-trigger"
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </Menu.SubmenuTrigger>
  );
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof Menu.Popup>) {
  return (
    <Menu.Portal>
      <Menu.Positioner>
        <Menu.Popup
          className={cn(
            "data-closed:fade-out-0 data-closed:zoom-out-95 data-open:fade-in-0 data-open:zoom-in-95 z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-closed:animate-out data-open:animate-in",
            className
          )}
          data-slot="dropdown-menu-sub-content"
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
