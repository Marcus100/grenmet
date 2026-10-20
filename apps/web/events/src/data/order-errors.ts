const SOLD_OUT = /sold out/i;
const NO_ONLINE_PAYMENT = /online payment isn't available/i;
const KEY_REUSED = /Idempotency-Key/i;
const JUST_TAKEN = /just taken|just placed/i;
const PAID_ONLINE = /paid online|ask the organiser for a refund/i;

/**
 * Turns the API's 409 text for ordering and cancelling into guidance a buyer
 * can act on. Messages that already say what to do ("Only 2 VIP tickets are
 * left", "You can hold up to 4 ...") pass through unchanged; so does anything
 * else, since the API words its own refusals.
 */
export function friendlyConflict(detail: string | null): string | null {
  if (detail === null) {
    return null;
  }
  if (NO_ONLINE_PAYMENT.test(detail)) {
    return "The organiser can't take online payment for this event yet. Contact them to buy this ticket.";
  }
  if (PAID_ONLINE.test(detail)) {
    return "This ticket was paid online, so the organiser has to refund it. Contact them to ask for a refund.";
  }
  if (KEY_REUSED.test(detail)) {
    return "Your selection changed since the last attempt. Reload the page and order again.";
  }
  if (JUST_TAKEN.test(detail)) {
    return "Those tickets were just taken or your order is still being placed. Reload the page and try again.";
  }
  if (SOLD_OUT.test(detail)) {
    return `${detail}. Pick another ticket type or check back later.`;
  }
  return detail;
}
