"use client";

import { Tabs } from "@base-ui/react/tabs";
import { cn } from "@grenmet/ui/lib/utils";
import type * as React from "react";

function TabsRoot({
  className,
  ...props
}: React.ComponentProps<typeof Tabs.Root>) {
  return (
    <Tabs.Root
      className={cn("flex flex-col gap-2", className)}
      data-slot="tabs"
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof Tabs.List>) {
  return (
    <Tabs.List
      className={cn(
        "inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
      data-slot="tabs-list"
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof Tabs.Tab>) {
  return (
    <Tabs.Tab
      className={cn(
        "inline-flex h-7 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 py-1 font-medium text-foreground text-sm transition-[color,box-shadow] focus-visible:border-ring focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[selected]:border-input data-[selected]:bg-background data-[selected]:text-foreground data-[selected]:shadow-gm-card [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      data-slot="tabs-trigger"
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof Tabs.Panel>) {
  return (
    <Tabs.Panel
      className={cn("flex-1 outline-none", className)}
      data-slot="tabs-content"
      {...props}
    />
  );
}

export { TabsContent, TabsList, TabsRoot as Tabs, TabsTrigger };
