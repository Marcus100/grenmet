// Add-ons on the booking form: which ones follow the chosen service, the limit
// of five, and the running total. Pure, so each rule has a plain unit test.

import type { BookingPublicAddOn } from "@barrelsgd/api-client";

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
