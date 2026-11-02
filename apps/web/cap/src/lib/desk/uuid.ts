const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A full UUID, lower-cased, or null. Anything else (encoded dots, extra path
 * segments, a truncated id) is refused before it can reach an upstream path.
 */
export function parseUuid(value: unknown): string | null {
  if (typeof value !== "string" || !UUID.test(value)) return null;
  return value.toLowerCase();
}
