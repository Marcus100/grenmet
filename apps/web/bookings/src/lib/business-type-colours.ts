import type { BookingBusinessType } from "@barrelsgd/api-client";

// One fixed saturated fill per business type, for the home page's type tiles
// and the colour dots. Every fill carries white text at 4.5:1 or better
// (`business-type-colours.test.ts` checks the table; it is also recorded in
// docs/design/bookings.md). A business's own brand colour is never used here.

/** Near-black ink, the fill of the "All" tile and of cards with no usable brand colour. */
export const INK = "#111827";

export const TYPE_FILL: Record<BookingBusinessType, string> = {
  beauty: "#c2185b",
  hair: "#5e35b1",
  health: "#0d4a8f",
  fitness: "#b23c00",
  auto: "#37474f",
  home_services: "#00695c",
  lessons: "#1b5e20",
  professional: "#283593",
  tours: "#006064",
  events: "#8d6e00",
  other: "#4e342e",
};
