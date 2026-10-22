"use client";

import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface StudioNavProps {
  /** Owners and admins only; the page and API enforce it too. */
  canCreate?: boolean;
  orgSlug: string;
}

/**
 * Left navigation on desktop, a top tab row on phones. Agenda and New booking
 * are the screens in this release; services, hours and settings join as they ship.
 */
export function StudioNav({ canCreate = false, orgSlug }: StudioNavProps) {
  const pathname = usePathname();
  const items = [
    {
      label: "Agenda",
      href: `/studio/${orgSlug}/agenda`,
      active:
        pathname.startsWith(`/studio/${orgSlug}/agenda`) ||
        (pathname.startsWith(`/studio/${orgSlug}/bookings`) &&
          !pathname.endsWith("/bookings/new")),
    },
    ...(canCreate
      ? [
          {
            label: "New booking",
            href: `/studio/${orgSlug}/bookings/new`,
            active: pathname.endsWith("/bookings/new"),
          },
        ]
      : []),
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
