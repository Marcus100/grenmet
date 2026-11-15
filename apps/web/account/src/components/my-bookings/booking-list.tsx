import type { BookingMyBooking } from "@barrelsgd/api-client";
import { bookingStatusLabel } from "@/lib/booking-status";
import { businessPageUrl } from "@/lib/bookings-site";
import { LocalBookingWhen } from "./local-booking-when";

interface BookingListProps {
  bookings: readonly BookingMyBooking[];
  /** `BOOKINGS_APP_URL`: each business links to `<this>/<business slug>`. */
  bookingsBaseUrl: string;
  emptyBody: string;
  emptyTitle: string;
}

/** Rows for one section, or the empty state, which is always shown. */
export function BookingList({
  bookings,
  bookingsBaseUrl,
  emptyTitle,
  emptyBody,
}: BookingListProps) {
  if (bookings.length === 0) {
    return (
      <div className="bg-muted/40 space-y-1 rounded-md p-4">
        <p className="font-medium">{emptyTitle}</p>
        <p className="text-muted-foreground text-sm">{emptyBody}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y rounded-md border">
      {bookings.map((booking) => (
        <li className="flex flex-col gap-1 p-4" key={booking.id}>
          <a
            className="w-fit font-semibold underline-offset-4 hover:underline"
            href={businessPageUrl(bookingsBaseUrl, booking.business_slug)}
          >
            {booking.business_name}
          </a>
          <p>{booking.service_name}</p>
          <p className="text-muted-foreground text-sm">
            <LocalBookingWhen
              endsAt={booking.ends_at}
              startsAt={booking.starts_at}
            />
          </p>
          <p className="text-sm">{bookingStatusLabel(booking.status)}</p>
        </li>
      ))}
    </ul>
  );
}
