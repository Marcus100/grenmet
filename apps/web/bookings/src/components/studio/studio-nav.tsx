"use client";

import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface StudioNavProps {
  orgSlug: string;
}

/**
 * Left navigation on desktop, a top tab row on phones. Agenda is the only
 * screen in this release; services, hours and settings join as they ship.
 */
export function StudioNav({ orgSlug }: StudioNavProps) {
  const pathname = usePathname();
  const items = [
    {
      label: "Agenda",
      href: `/studio/${orgSlug}/agenda`,
      active:
        pathname.startsWith(`/studio/${orgSlug}/agenda`) ||
        pathname.startsWith(`/studio/${orgSlug}/bookings`),
    },
  ];
  return (
    <nav aria-label="Studio" className="border-border border-b md:border-b-0">
      <ul className="flex gap-1 overflow-x-auto md:flex-col">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center whitespace-nowrap rounded-md px-4 font-medium",
                item.active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              )}
              href={{ pathname: item.href }}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
