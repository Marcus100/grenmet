// Client-side checks for the booking form. They mirror the API's limits
// (BookingPublicCreate) so people get a message next to the field; the API
// stays the authority and re-checks everything.

export interface BookingFields {
  email: string;
  name: string;
  notes: string;
  phone: string;
  serviceId: string | null;
  startsAt: string | null;
}

export type FieldKey =
  | "service"
  | "time"
  | "name"
  | "email"
  | "phone"
  | "notes";

export type FieldErrors = Partial<Record<FieldKey, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const PHONE = /^[+\d][\d\s().-]{5,}$/u;
const NAME_MAX = 120;
const EMAIL_MAX = 254;
const PHONE_MAX = 40;
const NOTES_MAX = 1000;

export function validateBooking(fields: BookingFields): FieldErrors {
  const errors: FieldErrors = {};
  const name = fields.name.trim();
  const email = fields.email.trim();
  const phone = fields.phone.trim();
  if (!fields.serviceId) {
    errors.service = "Choose a service.";
  }
  if (!fields.startsAt) {
    errors.time = "Choose a day and time.";
  }
  if (!name) {
    errors.name = "Enter your name.";
  } else if (name.length > NAME_MAX) {
    errors.name = `Use ${NAME_MAX} characters or fewer.`;
  }
  if (!email) {
    errors.email = "Enter your email address.";
  } else if (!EMAIL.test(email) || email.length > EMAIL_MAX) {
    errors.email = "Enter a valid email address, like name@example.com.";
  }
  if (phone && !(PHONE.test(phone) && phone.length <= PHONE_MAX)) {
    errors.phone =
      "Enter a phone number with digits only, like +1 473 555 0100.";
  }
  if (fields.notes.length > NOTES_MAX) {
    errors.notes = `Use ${NOTES_MAX} characters or fewer.`;
  }
  return errors;
}

/**
 * The errors still worth showing after a change. A field that is now valid
 * drops its message; a field that is still wrong keeps the message for what it
 * holds now. Keys are never added, so a fixed field does not come back until the
 * next submit (and focus does not jump to the summary while someone types).
 */
export function stillWrong(
  errors: FieldErrors,
  fields: BookingFields
): FieldErrors {
  const fresh = validateBooking(fields);
  const kept: FieldErrors = {};
  for (const key of Object.keys(errors) as FieldKey[]) {
    const message = fresh[key];
    if (message) {
      kept[key] = message;
    }
  }
  return kept;
}

/**
 * Two typed addresses name the same mailbox: surrounding spaces and letter case
 * do not count. The API compares addresses the same way when it decides whether
 * a signed-in account vouches for the booking email.
 */
export function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The identity of a submission: the same value means "the same booking request". */
export function fingerprint(
  fields: BookingFields & {
    addOnIds?: readonly string[];
    marketing: boolean;
  }
): string {
  return JSON.stringify([
    fields.serviceId,
    fields.startsAt,
    fields.name.trim(),
    fields.email.trim(),
    fields.phone.trim(),
    fields.notes.trim(),
    fields.marketing,
    // Add-ons change what is booked, so a retry with other add-ons is a new request.
    [...(fields.addOnIds ?? [])].sort(),
  ]);
}
