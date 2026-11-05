"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@barrelsgd/ui/components/ui/sheet";
import { PlaneTakeoff } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { RefObject } from "react";
import { NAV_GROUPS } from "@/lib/nav";

/** Mobile navigation panel. Loaded on demand by `MobileNavToggle`. */
export function MobileNavSheet({
  open,
  onOpenChange,
  returnFocusRef,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Focus goes back to the menu button on close (the trigger is outside the Sheet). */
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const close = () => onOpenChange(false);

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-80 overflow-y-auto"
        finalFocus={returnFocusRef}
        side="right"
      >
        <SheetHeader>
          <SheetTitle className="font-display text-gaa-navy text-left">
            Grenada Airports Authority
          </SheetTitle>
        </SheetHeader>
        <nav aria-label="Site menu" className="flex flex-col gap-6 px-4 pb-10">
          <Button
            asChild
            className="bg-gaa-gold text-gaa-navy-ink hover:bg-gaa-gold-deep"
          >
            <Link href="/flights" onClick={close}>
              <PlaneTakeoff aria-hidden="true" className="size-4" />
              Flight Information
            </Link>
          </Button>
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <Link
                className="font-display text-gaa-navy mb-2 block text-sm font-bold tracking-wide uppercase"
                data-analytics-event="navigation_category_selected"
                href={group.href as Route}
                onClick={close}
              >
                {group.label}
              </Link>
              <div className="border-gaa-rule flex flex-col border-l">
                {group.links.map((link) => (
                  <Link
                    className="text-gaa-muted hover:text-gaa-navy px-3 py-1.5 text-sm"
                    data-analytics-event="navigation_category_selected"
                    href={link.href as Route}
                    key={link.href}
                    onClick={close}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <Link
            className="text-gaa-navy text-sm font-semibold"
            data-analytics-event="navigation_category_selected"
            href="/contact"
            onClick={close}
          >
            Contact Us
          </Link>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
