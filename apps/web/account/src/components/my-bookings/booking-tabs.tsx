import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import { BOOKING_TABS, type BookingView, VIEW_PARAM } from "@/lib/booking-tabs";

interface BookingTabsProps {
  current: BookingView;
}

/**
 * Upcoming, Past and Cancelled as plain links (the page is server-rendered, so
 * each tab is a URL). The current tab carries `aria-current`. Targets are 44 px
 * tall and the row wraps, so it never scrolls sideways on a phone.
 */
export function BookingTabs({ current }: BookingTabsProps) {
  return (
    <nav aria-label="Booking lists" className="border-b">
      <ul className="flex flex-wrap gap-x-6">
        {BOOKING_TABS.map((tab) => {
          const active = tab.key === current;
          return (
            <li key={tab.key}>
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-muted-foreground hover:text-foreground -mb-px inline-flex min-h-11 items-center border-b-2 border-transparent text-sm font-medium",
                  active && "border-primary text-foreground font-semibold"
                )}
                href={`/bookings?${VIEW_PARAM}=${tab.key}`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
