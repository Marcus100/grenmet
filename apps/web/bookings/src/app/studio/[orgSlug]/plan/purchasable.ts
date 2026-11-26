// Whether the studio may offer Subscribe for a plan. The API lists `purchasable` as
// `plan_key:currency` strings and stays empty until Stripe is configured, so a
// missing or empty list means "not purchasable". Pure: shared by the page and tests.

/** The API's key for a plan in a currency, for example `bookings-monthly:XCD`. */
export function purchaseKey(planKey: string, currency: string): string {
  return `${planKey}:${currency}`;
}

/** True only when the list names this plan in this currency. */
export function isPurchasable(
  purchasable: readonly string[] | null | undefined,
  planKey: string,
  currency: string
): boolean {
  return purchasable?.includes(purchaseKey(planKey, currency)) ?? false;
}
