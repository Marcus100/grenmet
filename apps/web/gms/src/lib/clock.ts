const CLOCK = /^(\d{1,2})[:.](\d{2})\s*([ap])?\.?\s*m?\.?$/i;

/**
 * "17:42" or "5:42" as "5:42 p.m." for the home hero, which uses a.m./p.m.
 * (owner, 29 Oct 2026; the rest of the site keeps the 24-hour clock).
 * Forecasters type sun times without a.m. or p.m., so `afternoon` reads an
 * hour before noon as the afternoon (a sunset typed "5:42"). Text that is not
 * a clock time comes back unchanged.
 */
export function clock12(text: string, { afternoon = false } = {}): string {
  const match = CLOCK.exec(text.trim());
  if (!match) return text;
  let hour = Number(match[1]);
  const minutes = match[2];
  const suffix = match[3]?.toLowerCase();
  if (suffix === "p" && hour < 12) hour += 12;
  else if (suffix === "a" && hour === 12) hour = 0;
  else if (!suffix && afternoon && hour < 12) hour += 12;
  if (hour > 23) return text;
  return `${hour % 12 || 12}:${minutes} ${hour < 12 ? "a.m." : "p.m."}`;
}
