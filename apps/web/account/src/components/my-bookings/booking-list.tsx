import type { BookingMyBooking } from "@barrelsgd/api-client";
import { BookingDayList } from "./booking-day-list";

interface BookingListProps {
  bookings: readonly BookingMyBooking[];
  /** `BOOKINGS_APP_URL`: each business links to `<this>/<business slug>`. */
  bookingsBaseUrl: string;
  emptyBody: string;
  emptyTitle: string;
}

/** Rows grouped by day, or the empty state with guidance (always shown). */
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
    <BookingDayList bookings={bookings} bookingsBaseUrl={bookingsBaseUrl} />
  );
}
