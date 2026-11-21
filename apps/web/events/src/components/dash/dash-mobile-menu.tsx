"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@barrelsgd/ui/components/ui/sheet";
import { Menu } from "lucide-react";
import { useState } from "react";
import type {
  DashNavItem,
  DashSection,
  ShellEvent,
} from "@/lib/dash-navigation";
import {
  DashAccountLinks,
  DashNavLinks,
  EventSelector,
} from "./dash-navigation";

/**
 * The phone organiser menu: one sheet with the same nav as the sidebar, the
 * event selector, the organiser switcher and the account block. Every link
 * closes the sheet. Targets are 44px and nothing is hover-only.
 */
export function DashMobileMenu({
  active,
  event,
  eventName,
  items,
  switcher,
  viewerName,
}: {
  active: DashSection;
  event: ShellEvent | null;
  eventName: string;
  items: readonly DashNavItem[];
  /** The organiser switcher, rendered on the server and passed in. */
  switcher?: React.ReactNode;
  viewerName: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger
        render={
          <Button
            aria-label="Open organiser menu"
            className="size-11"
            size="icon"
            variant="ghost"
          />
        }
      >
        <Menu aria-hidden="true" />
      </SheetTrigger>
      <SheetContent
        className="bg-sidebar text-sidebar-foreground w-[min(20rem,calc(100vw-1rem))] overflow-y-auto"
        side="left"
      >
        <SheetHeader>
          <SheetTitle className="font-display">Barrels Events</SheetTitle>
          <SheetDescription className="text-sidebar-foreground/70">
            Organiser menu
          </SheetDescription>
        </SheetHeader>
        {switcher ? <div className="px-4">{switcher}</div> : null}
        <div className="px-4">
          <EventSelector
            event={event}
            eventName={eventName}
            onNavigate={close}
          />
        </div>
        <div className="mt-4">
          <DashNavLinks
            active={active}
            items={items}
            label="Mobile event workspace"
            onNavigate={close}
          />
        </div>
        <DashAccountLinks onNavigate={close} viewerName={viewerName} />
      </SheetContent>
    </Sheet>
  );
}
