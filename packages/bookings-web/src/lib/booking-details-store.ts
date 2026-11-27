// The details a customer has typed so far, kept in sessionStorage so a reload
// or a trip to sign in does not lose them. Only the form's own fields are kept:
// never the verification code, never a token. Every access is wrapped: private
// browsing or a full store must never break the form.

export interface SavedDetails {
  email: string;
  marketing: boolean;
  name: string;
  notes: string;
  phone: string;
}

const PREFIX = "barrels-booking-details:";
const MAX_LENGTH = 1000;

function keyFor(slug: string): string {
  return `${PREFIX}${slug}`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_LENGTH) : "";
}

/** The details saved for this business in this tab, or null when there are none. */
export function readBookingDetails(slug: string): SavedDetails | null {
  try {
    const raw = window.sessionStorage.getItem(keyFor(slug));
    if (!raw) {
      return null;
    }
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const fields = value as Record<string, unknown>;
    return {
      email: text(fields.email),
      marketing: fields.marketing === true,
      name: text(fields.name),
      notes: text(fields.notes),
      phone: text(fields.phone),
    };
  } catch {
    return null;
  }
}

/** Saves what is typed so far. Silently does nothing where storage is refused. */
export function saveBookingDetails(slug: string, details: SavedDetails): void {
  try {
    window.sessionStorage.setItem(keyFor(slug), JSON.stringify(details));
  } catch {
    // Storage is full or refused: the form still works without it.
  }
}

/** Forgets the saved details, once a booking has been made. */
export function clearBookingDetails(slug: string): void {
  try {
    window.sessionStorage.removeItem(keyFor(slug));
  } catch {
    // Nothing to clear where storage is refused.
  }
}
