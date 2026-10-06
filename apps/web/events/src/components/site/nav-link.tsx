"use client";

import { cn } from "@barrelsgd/ui/lib/utils";
import {
  CalendarDays,
  Compass,
  type LucideIcon,
  MessageSquare,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-border border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
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
