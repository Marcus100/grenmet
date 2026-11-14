/**
 * A business's public page on the bookings site: `<bookings URL>/<slug>`. The
 * slug is encoded so it can never add a path segment or a query string.
 */
export function businessPageUrl(bookingsBaseUrl: string, slug: string): string {
  const base = bookingsBaseUrl.endsWith("/")
    ? bookingsBaseUrl.slice(0, -1)
    : bookingsBaseUrl;
  return `${base}/${encodeURIComponent(slug)}`;
}
