const CLOCK = /^(\d{1,2})[:.](\d{2})\s*([ap])?\.?\s*m?\.?$/i;

/**
 * "17:42" or "5:42" as "5:42 p.m." for the homepage, which uses a.m./p.m.
 * (owner, 29 Oct 2026): hero card, moon card, live posts and desk cards. The
 * hero's day tabs and the rest of the site keep the 24-hour clock.
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

const SHORT_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Grenada",
  day: "numeric",
  month: "short",
});
const CLOCK_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Grenada",
  hour: "2-digit",
  minute: "2-digit",
});
const GRENADA_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Grenada",
});

/**
 * When a post was published, in Grenada time: "Today at 8:36 a.m.",
 * "Yesterday at 7:00 p.m." or "27 Oct at 7:00 p.m.". The date is always
 * shown for anything older than yesterday, so a live post never reads as if
 * it were from today.
 */
export function postedLabel(iso: string, now = new Date()): string {
  const when = new Date(iso);
  const day = GRENADA_DAY.format(when);
  const yesterday = new Date(now.getTime() - 86_400_000);
  let prefix = SHORT_DATE.format(when);
  if (day === GRENADA_DAY.format(now)) prefix = "Today";
  else if (day === GRENADA_DAY.format(yesterday)) prefix = "Yesterday";
  return `${prefix} at ${clock12(CLOCK_FORMAT.format(when))}`;
}
