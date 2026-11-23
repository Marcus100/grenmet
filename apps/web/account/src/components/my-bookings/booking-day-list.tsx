"use client";

import type { BookingMyBooking } from "@barrelsgd/api-client";
import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { useSyncExternalStore } from "react";
import { clockRange, groupByLocalDay } from "@/lib/booking-days";
import { bookingPaymentLine } from "@/lib/booking-payment";
import { bookingStatusLabel } from "@/lib/booking-status";
import { businessPageUrl } from "@/lib/bookings-site";

const subscribe = () => () => undefined;

/** Before the browser has loaded (server render, no JavaScript): no zone yet. */
const BEFORE_LOAD = "";

/** The viewer's own zone, once the browser has loaded. */
const viewerZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

interface BookingDayListProps {
  bookings: readonly BookingMyBooking[];
  /** `BOOKINGS_APP_URL`: a row without a manage link falls back to the business page. */
  bookingsBaseUrl: string;
}

/**
 * The bookings on one tab, grouped by the day they start. The order is the
 * API's. Before the browser loads, the days and times are UTC and labelled so;
 * after hydration they switch to the viewer's zone. Each row's main action is
 * its manage page (Reschedule, Cancel and Add to calendar are there); the
 * business's page stays one link away.
 */
export function BookingDayList({
  bookings,
  bookingsBaseUrl,
}: BookingDayListProps) {
  const loaded = useSyncExternalStore(subscribe, viewerZone, () => BEFORE_LOAD);
  const zone = loaded || "UTC";
  const groups = groupByLocalDay(bookings, zone);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section
          aria-labelledby={`day-${group.day}`}
          className="space-y-2"
          key={group.day}
        >
          <h3 className="text-base font-semibold" id={`day-${group.day}`}>
            {group.label}
          </h3>
          <ul className="divide-y rounded-md border">
            {group.items.map((booking) => (
              <BookingRow
                booking={booking}
                bookingsBaseUrl={bookingsBaseUrl}
                key={booking.id}
                labelled={loaded === BEFORE_LOAD}
                zone={zone}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function BookingRow({
  booking,
  bookingsBaseUrl,
  labelled,
  zone,
}: {
  booking: BookingMyBooking;
  bookingsBaseUrl: string;
  /** True before the browser loads: the times carry a UTC label. */
  labelled: boolean;
  zone: string;
}) {
  const payment = bookingPaymentLine(booking.payment);
  const businessPage = businessPageUrl(bookingsBaseUrl, booking.business_slug);
  return (
    <li className="flex min-w-0 flex-col gap-2 p-4">
      <p className="font-semibold break-words">{booking.service_name}</p>
      <p className="text-muted-foreground text-sm break-words">
        with {booking.business_name}
      </p>
      <p className="text-sm">
        <time dateTime={booking.starts_at}>
          {clockRange(booking.starts_at, booking.ends_at, zone, labelled)}
        </time>
      </p>
      <p className="text-sm">{bookingStatusLabel(booking.status)}</p>
      {payment ? (
        <p className="text-muted-foreground text-sm">{payment}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        {booking.manage_url ? (
          <a
            className={cn(buttonVariants({ variant: "outline" }), "min-h-11")}
            href={booking.manage_url}
          >
            Manage booking
            <span className="sr-only">
              {`, ${booking.service_name} with ${booking.business_name}`}
            </span>
          </a>
        ) : null}
        <a
          className="min-h-11 py-3 text-sm font-medium underline-offset-4 hover:underline"
          href={businessPage}
        >
          {booking.manage_url ? "Business page" : booking.business_name}
          {booking.manage_url ? (
            <span className="sr-only">{`, ${booking.business_name}`}</span>
          ) : null}
        </a>
      </div>
    </li>
  );
}
