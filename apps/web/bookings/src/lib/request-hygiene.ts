// Booking-request hygiene: how long an unconfirmed request waits and how many
// upcoming bookings one customer can hold online. The API enforces both; these
// helpers validate the form and word the "Expires in" line on Needs confirming.

export const EXPIRY_HOURS_MIN = 1;
export const EXPIRY_HOURS_MAX = 168;
export const EXPIRY_HOURS_DEFAULT = 24;
export const MAX_OPEN_MIN = 1;
export const MAX_OPEN_MAX = 20;
export const MAX_OPEN_DEFAULT = 3;

const WHOLE = /^\d+$/u;
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

export const EXPIRY_INVALID = `Enter whole hours from ${EXPIRY_HOURS_MIN} to ${EXPIRY_HOURS_MAX}.`;
export const MAX_OPEN_INVALID = `Enter a whole number from ${MAX_OPEN_MIN} to ${MAX_OPEN_MAX}.`;

export type Checked<T = number | null> =
  | { ok: true; value: T }
  | { ok: false; message: string };

function bounded(text: string, min: number, max: number): number | null {
  const trimmed = text.trim();
  if (!WHOLE.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return value >= min && value <= max ? value : null;
}

/** The expiry window: "start" means null (only at the start time). */
export function checkExpiry(mode: string, hoursText: string): Checked {
  if (mode === "start") {
    return { ok: true, value: null };
  }
  const value = bounded(hoursText, EXPIRY_HOURS_MIN, EXPIRY_HOURS_MAX);
  return value === null
    ? { ok: false, message: EXPIRY_INVALID }
    : { ok: true, value };
}

export function checkMaxOpen(text: string): Checked<number> {
  const value = bounded(text, MAX_OPEN_MIN, MAX_OPEN_MAX);
  return value === null
    ? { ok: false, message: MAX_OPEN_INVALID }
    : { ok: true, value };
}

/**
 * The limit in plain words, under the field, so a business can see what the
 * number does before a customer meets it. Null while the typed value is not one
 * the API would take (the field's own error says why).
 */
export function maxOpenSentence(text: string): string | null {
  const check = checkMaxOpen(text);
  if (!check.ok) {
    return null;
  }
  const held =
    check.value === 1
      ? "1 upcoming booking"
      : `${check.value} upcoming bookings`;
  return `A customer may hold ${held} at once. Beyond that, online booking is refused: the customer is told how many they hold and that they can change or cancel one from the link in their booking email.`;
}

/**
 * When a pending request cancels itself: the request time plus the window, or
 * the start time if that is sooner or the window is null. Without a request
 * time and with a window set, the moment cannot be known: null (say nothing).
 */
export function expiryInstant(input: {
  createdAt?: string | null | undefined;
  hours: number | null;
  startsAt: string;
}): number | null {
  const start = new Date(input.startsAt).getTime();
  if (input.hours === null) {
    return Number.isNaN(start) ? null : start;
  }
  const created = input.createdAt
    ? new Date(input.createdAt).getTime()
    : Number.NaN;
  if (Number.isNaN(created)) {
    return null;
  }
  const window = created + input.hours * MINUTES_PER_HOUR * MS_PER_MINUTE;
  return Number.isNaN(start) ? window : Math.min(window, start);
}

/** "Expires in 5 h", "Expires in 20 min" or "Expiring now"; null when unknown. */
export function expiryText(input: {
  createdAt?: string | null | undefined;
  /** The API's own moment (`expires_at`), used first when present. */
  expiresAt?: string | null | undefined;
  hours: number | null;
  now: Date;
  startsAt: string;
}): string | null {
  const given = input.expiresAt
    ? new Date(input.expiresAt).getTime()
    : Number.NaN;
  const at = Number.isNaN(given) ? expiryInstant(input) : given;
  if (at === null) {
    return null;
  }
  const minutes = Math.ceil((at - input.now.getTime()) / MS_PER_MINUTE);
  if (minutes <= 0) {
    return "Expiring now";
  }
  if (minutes < MINUTES_PER_HOUR) {
    return `Expires in ${minutes} min`;
  }
  return `Expires in ${Math.floor(minutes / MINUTES_PER_HOUR)} h`;
}
