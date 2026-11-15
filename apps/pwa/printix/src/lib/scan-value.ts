/**
 * What the camera read, tidied before it is checked. Control characters are
 * never part of a ticket value, and the API refuses them with a 422.
 */
const MAX_LENGTH = 200;

/** The value with invisible characters removed, or null when nothing is left. */
export function cleanScan(raw: string): string | null {
  const text = Array.from(raw)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim();
  if (!text || text.length > MAX_LENGTH) {
    return null;
  }
  return text;
}
