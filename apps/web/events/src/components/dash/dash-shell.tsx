import { Button } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import {
  Bell,
  CalendarDays,
  CalendarPlus2,
  Compass,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  type LucideIcon,
  MoreHorizontal,
  ReceiptText,
  ScanLine,
  Settings2,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";
import Link from "next/link";
import { DEMO_EVENT_ID } from "@/data/events";

export type DashSection = "overview" | "events" | "build";

interface NavigationItem {
  badge?: string;
  /** Null while the screen is still to come. */
  href: string | null;
  icon: LucideIcon;
  key: string;
  label: string;
}

const navigation: NavigationItem[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard, href: "/dash" },
  {
    key: "events",
    label: "My events",
    icon: CalendarDays,
    href: "/dash/events",
  },
  {
    key: "build",
    label: "Build event",
    icon: CalendarPlus2,
    href: `/dash/events/${DEMO_EVENT_ID}`,
  },
  { key: "tickets", label: "Tickets & capacity", icon: Ticket, href: null },
  { key: "orders", label: "Orders", icon: ReceiptText, href: null },
  { key: "attendees", label: "Attendees", icon: Users, href: null },
  {
    key: "door",
    label: "Door & box office",
    icon: ScanLine,
    href: null,
    badge: "2",
  },
  { key: "finance", label: "Finance", icon: Landmark, href: null },
  { key: "team", label: "Team", icon: ShieldCheck, href: null },
  { key: "settings", label: "Settings", icon: Settings2, href: null },
];

function NavigationLink({
  active,
  item,
}: {
  active: boolean;
  item: NavigationItem;
}) {
  const Icon = item.icon;
  const className = cn(
    "flex min-h-11 items-center gap-3 rounded-lg px-3 text-body transition-colors",
    active && "bg-sidebar-primary text-sidebar-primary-foreground",
    !active &&
      item.href &&
      "text-sidebar-foreground/80 hover:bg-sidebar-accent",
    !item.href && "pointer-events-none text-sidebar-foreground/45"
  );
  const content = (
    <>
      <Icon className="size-4" />
      <span className="flex-1">{item.label}</span>
      {item.badge ? (
        <span
          aria-hidden="true"
          className="flex size-5 items-center justify-center rounded-full bg-warning text-caption text-warning-foreground"
        >
          {item.badge}
        </span>
      ) : null}
    </>
  );

  if (!item.href) {
    return (
      <span
        aria-disabled="true"
        className={className}
        title="Available in a later step"
      >
        {content}
      </span>
    );
  }
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={className}
      href={item.href}
    >
      {content}
    </Link>
  );
}

/**
 * Organiser console frame: desktop sidebar plus a mobile header with a
 * scrolling section bar. Desktop-first per apps/web/events/AGENTS.md.
 */
export function DashShell({
  active,
  children,
  eventName,
  isDemo,
}: {
  active: DashSection;
  children: React.ReactNode;
  eventName: string;
  isDemo: boolean;
}) {
  return (
    <div className="min-h-screen bg-muted/40">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-20 items-center gap-3 px-5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <Ticket className="size-5" />
          </div>
          <div>
            <p className="font-display font-semibold text-body-base">
              Barrels Events
            </p>
            <p className="text-caption text-sidebar-foreground/70">Organiser</p>
          </div>
        </div>

        <div className="px-3">
          <Button
            aria-label="Select event"
            className="h-auto w-full justify-start border-sidebar-border bg-sidebar-accent px-3 py-3 text-left text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            disabled
            size="lg"
            title="Available in a later step"
            type="button"
            variant="outline"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-sidebar">
              <CalendarDays className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-caption text-sidebar-foreground/65">
                {isDemo ? "Demo event" : "Selected event"}
              </span>
              <span className="block truncate text-body">{eventName}</span>
            </span>
          </Button>
        </div>

        <nav
          aria-label="Event workspace"
          className="mt-5 flex-1 space-y-1 px-3"
        >
          {navigation.map((item) => (
            <NavigationLink
              active={item.key === active}
              item={item}
              key={item.key}
            />
          ))}
        </nav>

        <div className="space-y-1 border-sidebar-border border-t p-3">
          <Link
            className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-body text-sidebar-foreground/80 hover:bg-sidebar-accent"
            href="/"
          >
            <Compass className="size-4" />
            View public site
          </Link>
          <span
            aria-disabled="true"
            className="pointer-events-none flex min-h-11 items-center gap-3 rounded-lg px-3 text-body text-sidebar-foreground/45"
          >
            <LifeBuoy className="size-4" />
            Support
          </span>
          <div className="flex items-center gap-3 px-3 py-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-sidebar-accent font-semibold text-caption">
              EG
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body">Eugine G.</p>
              <p className="truncate text-caption text-sidebar-foreground/60">
                Owner
              </p>
            </div>
            <MoreHorizontal className="size-4 text-sidebar-foreground/60" />
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="border-border border-b bg-card px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-events-ink text-events-lime">
                <Ticket className="size-4" />
              </div>
              <div>
                <p className="font-display font-semibold text-body-base">
                  Barrels Events
                </p>
                <p className="text-caption text-muted-foreground">
                  {eventName}
                </p>
              </div>
            </div>
            <Button
              aria-label="Open notifications"
              disabled
              size="icon"
              title="Available in a later step"
              variant="ghost"
            >
              <Bell />
            </Button>
          </div>
          <nav
            aria-label="Mobile event workspace"
            className="-mx-4 mt-3 flex gap-2 overflow-x-auto border-border border-t px-4 pt-3"
          >
            {navigation.map((item) =>
              item.href ? (
                <Link
                  aria-current={item.key === active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 shrink-0 items-center gap-2 rounded-full px-3 text-caption",
                    item.key === active
                      ? "bg-events-ink text-white"
                      : "bg-muted text-foreground"
                  )}
                  href={item.href}
                  key={item.key}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-muted px-3 text-caption text-muted-foreground opacity-60"
                  key={item.key}
                >
                  {item.label}
                  {item.badge ? (
                    <span aria-hidden="true">{item.badge}</span>
                  ) : null}
                </span>
              )
            )}
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
