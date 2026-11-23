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
  LayoutDashboard,
  Lightbulb,
  LogIn,
  type LucideIcon,
  Menu,
  MessageSquare,
  UserRound,
  Users,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface NavItem {
  readonly href: Route;
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

function isActive(pathname: string, href: Route): boolean {
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
              "text-body rounded-full px-3.5 py-2 font-medium transition-colors",
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

/**
 * Phone menu for the website; the installed app uses BottomNav instead. The
 * organiser, sign-in and suggestion links are here because the header shows
 * them only from the tablet breakpoint up.
 */
export function MobileNav({ signedIn = false }: { signedIn?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger
        aria-label="Open menu"
        className="standalone:hidden hover:bg-muted inline-flex size-9 items-center justify-center rounded-md md:hidden"
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
                  "text-body flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium",
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
        <nav
          aria-label="Organisers and account"
          className="border-border mt-4 flex flex-col gap-1 border-t px-4 pt-4"
        >
          <Link
            className="text-body text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium"
            href="/dash/events"
            onClick={() => setOpen(false)}
          >
            <LayoutDashboard className="size-5" />
            For organisers
          </Link>
          <Link
            className="text-body text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium"
            href="/events/suggest"
            onClick={() => setOpen(false)}
          >
            <Lightbulb className="size-5" />
            Suggest an event
          </Link>
          {signedIn ? null : (
            // A plain link: /sign-in redirects to the Barrels account host, and
            // a Next client fetch of that redirect fails the connect-src check.
            <a
              className="text-body text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium"
              href="/sign-in"
            >
              <LogIn className="size-5" />
              Sign in
            </a>
          )}
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
      className="border-border bg-card/95 max-md:standalone:block fixed inset-x-0 bottom-0 z-40 hidden border-t pb-[env(safe-area-inset-bottom)] backdrop-blur"
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
                  "text-micro flex min-h-14 flex-col items-center justify-center gap-0.5",
                  active
                    ? "text-events-hibiscus-deep font-semibold"
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
