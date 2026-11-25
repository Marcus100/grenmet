"use client";

import { type FirstVisit, newClientsNote } from "../lib/booking-extras";

/** The note for a new-clients-only service; renders nothing for any other. */
export function NewClientsNote({
  booked = false,
  className,
  service,
}: {
  /** Extra class names (the host's `book-phone-only` shows it on phone steps only). */
  className?: string;
  /** True on the confirmation and manage page, where the booking is already made. */
  booked?: boolean;
  service: FirstVisit | null;
}) {
  const lines = newClientsNote(service, booked);
  if (lines.length === 0) {
    return null;
  }
  return (
    <div
      className={`notice new-clients-note${className ? ` ${className}` : ""}`}
    >
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}
