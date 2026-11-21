import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import {
  CalendarDays,
  CalendarPlus2,
  Compass,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  type LucideIcon,
  ReceiptText,
  ScanLine,
  Settings2,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";
import Link from "next/link";
import {
  type DashNavItem,
  type DashSection,
  initialsOf,
  type ShellEvent,
} from "@/lib/dash-navigation";

/** Icon per nav section. Kept out of the nav data so that data can cross to Client Components. */
export const DASH_ICONS: Readonly<Record<DashSection, LucideIcon>> = {
  overview: LayoutDashboard,
  events: CalendarDays,
  build: CalendarPlus2,
  tickets: Ticket,
  orders: ReceiptText,
  attendees: Users,
  door: ScanLine,
  finance: Landmark,
  team: ShieldCheck,
  settings: Settings2,
};

export const SUPPORT_HREF = "mailto:support@barrels.gd";

/** The nav list. Used in the desktop sidebar and inside the mobile sheet. */
export function DashNavLinks({
  active,
  items,
  label,
  onNavigate,
}: {
  active: DashSection;
  items: readonly DashNavItem[];
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label={label} className="space-y-1 px-3">
      {items.map((item) => {
        const Icon = DASH_ICONS[item.key];
        const current = item.key === active;
        const className = cn(
          "text-body flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 transition-colors",
          current && "bg-sidebar-primary text-sidebar-primary-foreground",
          !(current || item.href === null) &&
            "text-sidebar-foreground/80 hover:bg-sidebar-accent",
          item.href === null && "text-sidebar-foreground/45 pointer-events-none"
        );
        const content = (
          <>
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block">{item.label}</span>
              {item.hint ? (
                <span
                  className={cn(
                    "text-caption block",
                    current
                      ? "text-sidebar-primary-foreground/80"
                      : "text-sidebar-foreground/60"
                  )}
                >
                  {item.hint}
                </span>
              ) : null}
            </span>
          </>
        );
        if (item.href === null) {
          return (
            <span aria-disabled="true" className={className} key={item.key}>
              {content}
            </span>
          );
        }
        return (
          <Link
            aria-current={current ? "page" : undefined}
            className={className}
            href={item.href}
            key={item.key}
            onClick={onNavigate}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The event selector. It links to the event list, where the organiser picks
 * an event; the chosen one is shown here by title.
 */
export function EventSelector({
  event,
  eventName,
  onNavigate,
}: {
  event: ShellEvent | null;
  /** Shown when no event is selected (the organiser's name). */
  eventName: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      className={cn(
        buttonVariants({ variant: "outline", size: "lg" }),
        "border-sidebar-border bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground h-auto w-full justify-start px-3 py-3 text-left"
      )}
      href="/dash/events"
      onClick={onNavigate}
    >
      <span className="bg-sidebar flex size-9 shrink-0 items-center justify-center rounded-lg">
        <CalendarDays aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-caption text-sidebar-foreground/65 block truncate">
          {event ? "Selected event" : "Organiser"}
        </span>
        <span className="text-body block truncate">
          {event?.title ?? eventName}
        </span>
      </span>
    </Link>
  );
}

/** Public site, support and the signed-in account. Same in the sidebar and the sheet. */
export function DashAccountLinks({
  onNavigate,
  viewerName,
}: {
  onNavigate?: () => void;
  viewerName: string;
}) {
  const name = viewerName.trim() || "Signed-in member";
  return (
    <div className="border-sidebar-border space-y-1 border-t p-3">
      <Link
        className="text-body text-sidebar-foreground/80 hover:bg-sidebar-accent flex min-h-11 items-center gap-3 rounded-lg px-3"
        href="/"
        onClick={onNavigate}
      >
        <Compass aria-hidden="true" className="size-4" />
        View public site
      </Link>
      <a
        className="text-body text-sidebar-foreground/80 hover:bg-sidebar-accent flex min-h-11 items-center gap-3 rounded-lg px-3"
        href={SUPPORT_HREF}
        onClick={onNavigate}
      >
        <LifeBuoy aria-hidden="true" className="size-4" />
        Support
      </a>
      <div className="flex items-center gap-3 px-3 py-3">
        <div
          aria-hidden="true"
          className="bg-sidebar-accent text-caption flex size-9 shrink-0 items-center justify-center rounded-full font-semibold"
        >
          {initialsOf(name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-body truncate">{name}</p>
          <p className="text-caption text-sidebar-foreground/60">Signed in</p>
        </div>
      </div>
    </div>
  );
}
