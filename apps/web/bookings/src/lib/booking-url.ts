/**
 * The full address of a path on the booking site. `new URL` joins the two, so
 * an origin that ends in a slash (`https://bookings.barrels.gd/`) never gives
 * a double slash, and a path with or without its leading slash lands the same.
 */
export function absoluteBookingUrl(path: string, origin: string): string {
  return new URL(path, origin).href;
}
