"use client";

import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { type IconName, StudioIcon } from "@/components/studio/studio-icons";
import { FOCUS } from "@/components/studio/studio-ui";

export interface StudioNavProps {
  /** Owners and admins only; the page and API enforce it too. */
  canCreate?: boolean;
  /** Plan & billing is for owners and admins only; the page and API enforce it too. */
  canPlan?: boolean;
  orgSlug: string;
  /** Bookings waiting for the business to confirm; null when it could not be read. */
  pendingCount?: number | null;
}

export interface StudioNavItem {
  active: boolean;
  /** Bookings waiting to be confirmed (Agenda only). */
  badge?: number;
  href: string;
  icon: IconName;
  label: string;
}

/**
 * Every studio route that has a screen: Agenda (and a booking's detail),
 * New booking, Services, People, Plan & billing, Settings. Which one is
 * current follows the address. New booking and Plan & billing are for owners
 * and admins only.
 */
export function studioNavItems(
  pathname: string,
  { canCreate = false, canPlan = false, orgSlug, pendingCount }: StudioNavProps
): StudioNavItem[] {
  const base = `/studio/${orgSlug}`;
  const onNew = pathname === `${base}/bookings/new`;
  const items: StudioNavItem[] = [
    {
      label: "Agenda",
      href: `${base}/agenda`,
      icon: "agenda",
      active:
        pathname.startsWith(`${base}/agenda`) ||
        (pathname.startsWith(`${base}/bookings`) && !onNew),
      ...(pendingCount ? { badge: pendingCount } : {}),
    },
  ];
  if (canCreate) {
    items.push({
      label: "New booking",
      href: `${base}/bookings/new`,
      icon: "plus",
      active: onNew,
    });
  }
  items.push(
    {
      label: "Services",
      href: `${base}/services`,
      icon: "services",
      active: pathname.startsWith(`${base}/services`),
    },
    {
      label: "People",
      href: `${base}/people`,
      icon: "people",
      active: pathname.startsWith(`${base}/people`),
    }
  );
  if (canPlan) {
    items.push({
      label: "Plan & billing",
      href: `${base}/plan`,
      icon: "plan",
      active: pathname.startsWith(`${base}/plan`),
    });
  }
  items.push({
    label: "Settings",
    href: `${base}/settings`,
    icon: "settings",
    active: pathname.startsWith(`${base}/settings`),
  });
  return items;
}

function Count({ n }: Readonly<{ n: number }>) {
  return (
    <>
      <span
        aria-hidden="true"
        className="bg-primary text-primary-foreground ml-auto inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold"
      >
        {n}
      </span>
      <span className="sr-only">{`(${n} waiting to be confirmed)`}</span>
    </>
  );
}

/** Persistent left navigation for laptops (md and up). */
export function StudioSidebarNav(props: Readonly<StudioNavProps>) {
  const pathname = usePathname();
  const items = studioNavItems(pathname, props);
  return (
    <nav aria-label="Studio" className="flex-1 overflow-y-auto px-3 py-2">
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              aria-current={item.active ? "page" : undefined}
              className={cn(
                FOCUS,
                "flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium transition-colors duration-[120ms]",
                item.active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted active:bg-muted"
              )}
              href={{ pathname: item.href }}
            >
              <StudioIcon name={item.icon} />
              {item.label}
              {item.badge ? <Count n={item.badge} /> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Bottom tab bar for phones: Agenda, Services, People and More (the rest). */
export function StudioTabBar({
  footer,
  ...props
}: Readonly<StudioNavProps & { footer: React.ReactNode }>) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const items = studioNavItems(pathname, props);
  const main = items.filter((item) =>
    ["Agenda", "Services", "People"].includes(item.label)
  );
  const rest = items.filter((item) => !main.includes(item));
  const restActive = rest.some((item) => item.active);

  // A new page closes the panel; Escape closes it too.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const tab =
    "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-medium transition-colors duration-[120ms]";
  return (
    <div className="border-border bg-background fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] md:hidden">
      {open ? (
        <div
          className="border-border bg-background space-y-1 border-b px-3 py-2"
          id={panelId}
        >
          <nav aria-label="More">
            <ul className="space-y-1">
              {rest.map((item) => (
                <li key={item.href}>
                  <Link
                    aria-current={item.active ? "page" : undefined}
                    className={cn(
                      FOCUS,
                      "flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium",
                      item.active
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground active:bg-muted"
                    )}
                    href={{ pathname: item.href }}
                  >
                    <StudioIcon name={item.icon} />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {footer}
        </div>
      ) : null}
      <nav aria-label="Studio tabs" className="flex gap-1 px-2 py-1">
        {main.map((item) => (
          <Link
            aria-current={item.active ? "page" : undefined}
            className={cn(
              FOCUS,
              tab,
              item.active ? "text-primary bg-muted" : "text-foreground"
            )}
            href={{ pathname: item.href }}
            key={item.href}
          >
            <span className="relative">
              <StudioIcon name={item.icon} />
              {item.badge ? (
                <span
                  aria-hidden="true"
                  className="bg-primary text-primary-foreground absolute -top-1.5 -right-3 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold"
                >
                  {item.badge}
                </span>
              ) : null}
            </span>
            {item.label}
            {item.badge ? (
              <span className="sr-only">{`(${item.badge} waiting to be confirmed)`}</span>
            ) : null}
          </Link>
        ))}
        <button
          aria-controls={open ? panelId : undefined}
          aria-expanded={open}
          className={cn(
            FOCUS,
            tab,
            restActive || open ? "text-primary bg-muted" : "text-foreground"
          )}
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <StudioIcon name="more" />
          More
        </button>
      </nav>
    </div>
  );
}
