/**
 * The API tells a few refusals apart with a stable `code` next to the message
 * (`{ detail, code }`). Match on the code, never on the English wording.
 */
export const ERROR_CODES = {
  attemptExpired: "ATTEMPT_EXPIRED",
  cardPaymentUnavailable: "CARD_PAYMENT_UNAVAILABLE",
  eventsNotEnabled: "EVENTS_NOT_ENABLED",
  organisationNotRejected: "ORGANISATION_NOT_REJECTED",
  uploadsNotConfigured: "UPLOADS_NOT_CONFIGURED",
} as const;

/** The `code` of an error body, or null when the reply carries none. */
export function errorCodeOf(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("code" in data)) {
    return null;
  }
  const { code } = data;
  return typeof code === "string" ? code : null;
}
