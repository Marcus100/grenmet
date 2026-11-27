// A starting point for the booking policy a business writes in studio Settings.
// A new business meets an empty box and an example in the hint, which is not
// enough to write terms from, so the form offers this text and the business
// edits it. It is only ever put in the box: nothing is saved until the business
// presses Save (the form owns that), and the box is never filled over text the
// business already wrote.
//
// Every sentence comes from the business's own saved settings, so the words
// match its rules: its cancellation cutoff, whether a paid deposit is kept,
// whether it collects deposits itself, and its late fee.

import type { BookingProfilePublic } from "@barrelsgd/api-client";
import { lateFeeSentence } from "./late-fee";

/** The API's own default when a profile leaves the cutoff out. */
const DEFAULT_CUTOFF_HOURS = 24;

/** What the service rows need to carry to say whether any deposit is taken. */
export interface PolicyService {
  active: boolean;
  deposit_minor: number;
}

/**
 * True when a customer is asked for money at booking: the business-wide rule,
 * the full price by card, or any live service with a deposit of its own. The
 * suggestion then opens with a deposit paragraph, and leaves it out otherwise.
 */
export function businessTakesDeposit(
  profile: BookingProfilePublic,
  services: PolicyService[]
): boolean {
  if (profile.payment_at_booking === "full_price") {
    return true;
  }
  if ((profile.deposit_mode ?? "none") !== "none") {
    return true;
  }
  return services.some(
    (service) => service.active && service.deposit_minor > 0
  );
}

function hours(count: number): string {
  return count === 1 ? "1 hour" : `${count} hours`;
}

function refundSentence(profile: BookingProfilePublic, cutoff: number): string {
  if (profile.deposit_non_refundable) {
    return "The deposit is not refunded if you cancel.";
  }
  if (cutoff === 0) {
    return "If you cancel before your appointment, the deposit is refunded.";
  }
  return `If you cancel more than ${hours(cutoff)} before your appointment, the deposit is refunded. Inside that, we keep it.`;
}

function depositParagraph(
  profile: BookingProfilePublic,
  cutoff: number
): string {
  const paidToUs = (profile.deposit_collection ?? "online") === "business";
  const taken = paidToUs
    ? "You pay the deposit to us directly, outside the booking page, and we confirm your booking once it reaches us."
    : "The deposit is paid when you book and comes off the price on the day.";
  return `Deposit: ${taken} ${refundSentence(profile, cutoff)}`;
}

function changesParagraph(cutoff: number): string {
  if (cutoff === 0) {
    return "Changes and cancellations: you can change or cancel your booking yourself at any time before it starts, from the link in your booking email.";
  }
  return `Changes and cancellations: please change or cancel at least ${hours(cutoff)} before your appointment, from the link in your booking email. Inside ${hours(cutoff)} that link is closed, so contact us instead.`;
}

function latenessParagraph(
  profile: BookingProfilePublic,
  currency: string
): string {
  const fee = lateFeeSentence(
    profile.late_fee_minor ?? null,
    profile.late_grace_min ?? 0,
    currency
  );
  if (fee === null) {
    return "Arriving late: please arrive on time. If you are very late we may not be able to fit the whole appointment in, and we may have to treat it as a missed appointment.";
  }
  return `Arriving late: ${fee} If you are very late we may not be able to fit the whole appointment in.`;
}

/**
 * The suggested policy, as paragraphs separated by a blank line. The business
 * reads it in the box, edits it and saves it; this never writes anything.
 */
export function suggestedPolicy(input: {
  currency: string;
  profile: BookingProfilePublic;
  takesDeposit: boolean;
}): string {
  const { currency, profile, takesDeposit } = input;
  const cutoff = profile.cancel_cutoff_hours ?? DEFAULT_CUTOFF_HOURS;
  const paragraphs = [
    ...(takesDeposit ? [depositParagraph(profile, cutoff)] : []),
    changesParagraph(cutoff),
    latenessParagraph(profile, currency),
  ];
  return paragraphs.join("\n\n");
}
