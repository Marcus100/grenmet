import {
  type BookingBusinessType,
  bookingBusinessType,
} from "@barrelsgd/api-client";

// The kinds of business the API knows, with the plain words shown for each.
// Which kinds appear on the home page is decided by the API's `types_available`;
// this file only names them.

/** Every kind, in the API's order. */
export const BUSINESS_TYPES: readonly BookingBusinessType[] =
  Object.values(bookingBusinessType);

const LABELS: Record<BookingBusinessType, string> = {
  beauty: "Beauty",
  hair: "Hair",
  health: "Health",
  fitness: "Fitness",
  auto: "Auto",
  home_services: "Home",
  lessons: "Lessons",
  professional: "Professional",
  tours: "Tours",
  events: "Events",
  other: "Other",
};

/** The word shown for a kind. */
export function businessTypeLabel(type: BookingBusinessType): string {
  return LABELS[type];
}

/** The kind a raw value names, or undefined for anything the API does not know. */
export function parseBusinessType(
  value: string | undefined
): BookingBusinessType | undefined {
  return BUSINESS_TYPES.find((type) => type === value);
}
