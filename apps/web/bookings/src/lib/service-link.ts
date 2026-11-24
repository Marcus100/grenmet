/** Shape of a service id: the UUID the API gives each service. */
const SERVICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * The service id from a page's `?service=` link, or undefined when it is
 * missing, repeated or not shaped like an id. Whether the business still offers
 * it is checked by the booking flow against the live service list.
 */
export function serviceIdFromQuery(
  value: string | string[] | undefined
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return SERVICE_ID_PATTERN.test(value) ? value.toLowerCase() : undefined;
}
