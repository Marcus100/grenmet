"use client";

import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface StudioNavProps {
  /** Owners and admins only; the page and API enforce it too. */
  canCreate?: boolean;
  /** Plan & billing is for owners and admins only; the page and API enforce it too. */
  canPlan?: boolean;
  orgSlug: string;
}

/**
 * Left navigation on desktop, a top tab row on phones. Agenda, New booking,
 * Services, People, Settings and Plan & billing. Every member sees the management
 * screens (read-only for non-admins); New booking and Plan & billing are for
 * owners and admins only.
 */
export function StudioNav({
  canCreate = false,
  canPlan = false,
  orgSlug,
}: StudioNavProps) {
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
    {
      label: "Services",
      href: `/studio/${orgSlug}/services`,
      active: pathname.startsWith(`/studio/${orgSlug}/services`),
    },
    {
      label: "People",
      href: `/studio/${orgSlug}/people`,
      active: pathname.startsWith(`/studio/${orgSlug}/people`),
    },
    {
      label: "Settings",
      href: `/studio/${orgSlug}/settings`,
      active: pathname.startsWith(`/studio/${orgSlug}/settings`),
    },
    ...(canPlan
      ? [
          {
            label: "Plan & billing",
            href: `/studio/${orgSlug}/plan`,
            active: pathname.startsWith(`/studio/${orgSlug}/plan`),
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
                "flex min-h-11 items-center rounded-md px-4 font-medium whitespace-nowrap",
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
