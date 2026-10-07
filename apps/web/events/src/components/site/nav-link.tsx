"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@barrelsgd/ui/components/ui/sheet";
import { cn } from "@barrelsgd/ui/lib/utils";
import {
  CalendarDays,
  Compass,
  type LucideIcon,
  Menu,
  MessageSquare,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface NavItem {
  readonly href: string;
  readonly icon: LucideIcon;
  readonly label: string;
}

// Defined here, not passed from a Server Component: icon components are
// functions and cannot cross the server/client boundary as props.
const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Discover", icon: Compass },
  { href: "/events", label: "Calendar", icon: CalendarDays },
  { href: "/groups", label: "Groups", icon: Users },
  { href: "/network", label: "Network", icon: UserRound },
  { href: "/messages", label: "Messages", icon: MessageSquare },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-2 font-medium text-body transition-colors",
              active
                ? "bg-events-ink text-white"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Phone menu for the website; the installed app uses BottomNav instead. */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger
        aria-label="Open menu"
        className="inline-flex standalone:hidden size-9 items-center justify-center rounded-md hover:bg-muted md:hidden"
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent className="w-72" side="right">
        <SheetHeader>
          <SheetTitle className="text-left">Barrels Events</SheetTitle>
        </SheetHeader>
        <nav aria-label="Main" className="flex flex-col gap-1 px-4">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium text-body",
                  active
                    ? "bg-events-ink text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                href={item.href}
                key={item.href}
                onClick={() => setOpen(false)}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/** Installed app (PWA) only, on phones: hidden on the website. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 hidden border-border border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur max-md:standalone:block"
    >
      <ul className="grid grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-micro",
                  active
                    ? "font-semibold text-events-hibiscus-deep"
                    : "text-muted-foreground"
                )}
                href={item.href}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
