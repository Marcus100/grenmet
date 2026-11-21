import { Ticket } from "lucide-react";
import type { OrganiserOption } from "@/domain/types";
import {
  type DashSection,
  dashNavigation,
  type ShellEvent,
} from "@/lib/dash-navigation";
import { DashMobileMenu } from "./dash-mobile-menu";
import {
  DashAccountLinks,
  DashNavLinks,
  EventSelector,
} from "./dash-navigation";
import { OrganiserSwitcher } from "./organiser-switcher";
import { RememberEvent } from "./remember-event";

/**
 * Organiser console frame: a desktop sidebar, and on phones a header with a
 * menu button that opens the same navigation in a sheet. Desktop-first per
 * apps/web/events/AGENTS.md. `event` is the event in the URL, or the one the
 * member last opened on the overview, events and team screens.
 */
export function DashShell({
  active,
  children,
  currentOrganiser,
  event = null,
  eventName,
  organisers = [],
  viewerName,
}: {
  active: DashSection;
  children: React.ReactNode;
  /** Slug of the organiser the console is acting for. */
  currentOrganiser?: string;
  /** The selected event, or null when none is selected. */
  event?: ShellEvent | null;
  /** Shown when no event is selected (the organiser's name). */
  eventName: string;
  /** Everything the member manages; a switcher shows when there are several. */
  organisers?: readonly OrganiserOption[];
  /** The signed-in viewer's display name, from the server. */
  viewerName: string;
}) {
  const items = dashNavigation(event);
  const switcher =
    currentOrganiser && organisers.length > 1 ? (
      <OrganiserSwitcher current={currentOrganiser} organisers={organisers} />
    ) : null;
  const title = event?.title ?? eventName;

  return (
    <div className="bg-muted/40 min-h-screen">
      {event ? <RememberEvent listingId={event.id} /> : null}

      <aside className="bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 hidden w-64 flex-col lg:flex">
        <div className="flex h-20 items-center gap-3 px-5">
          <div className="bg-sidebar-primary text-sidebar-primary-foreground flex size-10 items-center justify-center rounded-xl">
            <Ticket aria-hidden="true" className="size-5" />
          </div>
          <div>
            <p className="font-display text-body-base font-semibold">
              Barrels Events
            </p>
            <p className="text-caption text-sidebar-foreground/70">Organiser</p>
          </div>
        </div>

        {switcher ? (
          <div className="text-sidebar-foreground px-3 pb-3">{switcher}</div>
        ) : null}

        <div className="px-3">
          <EventSelector event={event} eventName={eventName} />
        </div>

        <div className="mt-5 flex-1">
          <DashNavLinks active={active} items={items} label="Event workspace" />
        </div>

        <DashAccountLinks viewerName={viewerName} />
      </aside>

      <div className="lg:pl-64">
        <header className="border-border bg-card sticky top-0 z-30 border-b px-4 py-2 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="bg-events-ink text-events-lime flex size-9 shrink-0 items-center justify-center rounded-lg">
                <Ticket aria-hidden="true" className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-body-base font-semibold">
                  Barrels Events
                </p>
                <p className="text-caption text-muted-foreground truncate">
                  {title}
                </p>
              </div>
            </div>
            <DashMobileMenu
              active={active}
              event={event}
              eventName={eventName}
              items={items}
              switcher={switcher}
              viewerName={viewerName}
            />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
