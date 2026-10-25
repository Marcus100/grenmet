import { Tabs, TabsList, TabsTrigger } from "@barrelsgd/ui/components/ui/tabs";
import { cn } from "@barrelsgd/ui/lib/utils";
import type { Route } from "next";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * Page-level section tabs. One pattern for the portal: the shared `line`
 * variant, left-aligned, scrolling sideways on phones instead of wrapping.
 * Small two or three option toggles inside cards keep the default pill
 * (`TabsList` without this wrapper).
 */
export function PageTabsList({
  className,
  ...props
}: Omit<ComponentProps<typeof TabsList>, "variant">) {
  return (
    <TabsList
      className={cn(
        "h-auto w-full max-w-full justify-start overflow-x-auto overflow-y-hidden border-b p-0 pb-1.5 group-data-[orientation=horizontal]/tabs:h-auto",
        className
      )}
      variant="line"
      {...props}
    />
  );
}

export interface PageRouteTab {
  href: Route;
  label: ReactNode;
  value: string;
}

/**
 * Route tabs: each trigger is a Next `Link`, so the URL is the state. The
 * caller passes the active `value`; `aria-current` marks the same tab for
 * assistive technology that reads links rather than tabs.
 */
export function PageRouteTabs({
  "aria-label": ariaLabel,
  className,
  items,
  value,
}: {
  "aria-label": string;
  className?: string;
  items: readonly PageRouteTab[];
  value: string;
}) {
  return (
    <Tabs className={cn("flex-col gap-4", className)} value={value}>
      <PageTabsList aria-label={ariaLabel}>
        {items.map((item) => {
          const active = item.value === value;
          return (
            <TabsTrigger
              aria-current={active ? "page" : undefined}
              key={item.value}
              // A link, not a button: Enter and Space follow Base UI's link
              // handling and no native-button warning is logged.
              nativeButton={false}
              render={<Link href={item.href} />}
              value={item.value}
            >
              {item.label}
            </TabsTrigger>
          );
        })}
      </PageTabsList>
    </Tabs>
  );
}
