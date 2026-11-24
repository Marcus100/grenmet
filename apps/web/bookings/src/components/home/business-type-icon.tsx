import type { BookingBusinessType } from "@barrelsgd/api-client";
import type { ReactNode } from "react";

// One simple stroke icon per business type (24 px grid, drawn in the current
// text colour). Decorative: the label next to it names the type.

const PATHS: Record<BookingBusinessType, ReactNode> = {
  beauty: <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />,
  hair: (
    <>
      <circle cx="6" cy="7" r="3" />
      <circle cx="6" cy="17" r="3" />
      <path d="M8.5 8.5L20 18M8.5 15.5L20 6" />
    </>
  ),
  health: (
    <>
      <rect height="16" rx="4" width="16" x="4" y="4" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  fitness: <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />,
  auto: <path d="M4 16v-3l2-5h12l2 5v3zM7 16v2M17 16v2M4 13h16" />,
  home_services: <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />,
  lessons: <path d="M3 9l9-4 9 4-9 4zM7 11v5c2 2 8 2 10 0v-5" />,
  professional: (
    <>
      <rect height="12" rx="2" width="18" x="3" y="8" />
      <path d="M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18" />
    </>
  ),
  tours: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </>
  ),
  events: (
    <>
      <rect height="15" rx="3" width="16" x="4" y="5" />
      <path d="M4 10h16M9 3v4M15 3v4M12 12.5l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z" />
    </>
  ),
  other: (
    <>
      <rect height="6" rx="1.5" width="6" x="4" y="4" />
      <rect height="6" rx="1.5" width="6" x="14" y="4" />
      <rect height="6" rx="1.5" width="6" x="4" y="14" />
      <rect height="6" rx="1.5" width="6" x="14" y="14" />
    </>
  ),
};

/** The icon for a type, or the four-squares icon for "All". */
export function BusinessTypeIcon({
  type,
}: Readonly<{ type: BookingBusinessType | "all" }>) {
  return (
    <svg
      aria-hidden="true"
      className="size-[26px] shrink-0 md:size-5"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {PATHS[type === "all" ? "other" : type]}
    </svg>
  );
}
