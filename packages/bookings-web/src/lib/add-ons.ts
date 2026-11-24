// Add-ons on the booking form: which ones follow the chosen service, the limit
// of five, and the running total. Pure, so each rule has a plain unit test.

import type { BookingPublicAddOn } from "@barrelsgd/api-client";
import { dueAtBooking } from "./booking-payment";

/** Most add-ons one booking can carry (the API refuses more). */
export const MAX_ADD_ONS = 5;

/** The add-ons offered with a main service, in the business's order. */
export function addOnsFor(
  addOns: readonly BookingPublicAddOn[] | undefined,
  serviceId: string | null
): BookingPublicAddOn[] {
  if (!(serviceId && addOns)) {
    return [];
  }
  return addOns.filter((addOn) => addOn.service_ids.includes(serviceId));
}

/**
 * The chosen ids after ticking or unticking one. A sixth tick is ignored, and
 * an id that is not offered is never added.
 */
export function toggleAddOn(
  chosen: readonly string[],
  id: string,
  offered: readonly BookingPublicAddOn[]
): string[] {
  if (chosen.includes(id)) {
    return chosen.filter((entry) => entry !== id);
  }
  if (chosen.length >= MAX_ADD_ONS || !offered.some((a) => a.id === id)) {
    return [...chosen];
  }
  return [...chosen, id];
}

export interface AddOnTotals {
  durationMin: number;
  priceMinor: number;
}

/** The appointment's length and price: the main service plus each chosen add-on. */
export function addOnTotals(
  service: { duration_min: number; price_minor: number },
  offered: readonly BookingPublicAddOn[],
  chosen: readonly string[]
): AddOnTotals {
  let durationMin = service.duration_min;
  let priceMinor = service.price_minor;
  for (const addOn of offered) {
    if (chosen.includes(addOn.id)) {
      durationMin += addOn.duration_min;
      priceMinor += addOn.price_minor;
    }
  }
  return { durationMin, priceMinor };
}

/** What the form can say about money for the chosen service and add-ons. */
export interface AmountDueSelection {
  /** Paid online when booking, or null while the API works it out on the total. */
  dueMinor: number | null;
  /** The emailed-code step must come first; null when the form cannot know. */
  emailCodeRequired: boolean | null;
}

/**
 * The amount due for a service plus its ticked add-ons.
 *
 * The API charges on the combined price (a percent rule, a minimum price, or
 * full-price mode all see the add-ons), and the storefront carries no rule, so
 * the form can only state a figure when it is certain: no add-ons, the service's
 * own deposit (which always wins and ignores add-ons), or `fromApi`.
 *
 * TODO: when the availability response carries `due_at_booking_minor` and
 * `email_code_required` (back-end branch feat/booking-due-with-add-ons), pass
 * them in as `fromApi` from the loaded times; nothing else here changes.
 */
export function amountDueForSelection(input: {
  addOnCount: number;
  fromApi?: { dueMinor: number; emailCodeRequired: boolean } | null;
  service: {
    deposit_minor: number;
    due_at_booking_minor?: number;
  };
}): AmountDueSelection {
  const { addOnCount, fromApi, service } = input;
  if (addOnCount === 0) {
    const dueMinor = dueAtBooking(service);
    return { dueMinor, emailCodeRequired: dueMinor > 0 };
  }
  if (fromApi) {
    return {
      dueMinor: fromApi.dueMinor,
      emailCodeRequired: fromApi.emailCodeRequired,
    };
  }
  if (
    service.deposit_minor > 0 &&
    dueAtBooking(service) === service.deposit_minor
  ) {
    return { dueMinor: service.deposit_minor, emailCodeRequired: true };
  }
  return { dueMinor: null, emailCodeRequired: null };
}
