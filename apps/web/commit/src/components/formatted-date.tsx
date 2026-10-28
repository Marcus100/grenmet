import type { ComponentPropsWithoutRef } from "react";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** Renders an ISO date ("2026-10-27") as "27 Oct 2026". */
export function FormattedDate({
  date,
  ...props
}: ComponentPropsWithoutRef<"time"> & { date: string }) {
  return (
    <time dateTime={date} {...props}>
      {dateFormatter.format(new Date(`${date}T00:00:00Z`))}
    </time>
  );
}
