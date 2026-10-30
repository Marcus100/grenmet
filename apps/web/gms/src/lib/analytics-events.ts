import type { UnitSystem } from "@/lib/units";

/**
 * Counts-only analytics event names for GMS. An event carries no personal
 * data: only the reviewed property values below, never page text or form
 * values. The shared PostHog runtime (`@barrelsgd/ui/lib/analytics-runtime`)
 * drops any event or property its registry (`packages/ui/src/lib/analytics-policy.ts`)
 * does not list, so a name here reaches PostHog only once that registry lists it.
 */

/** A visitor switched the unit system on the site. */
export const UNITS_SWITCHED_EVENT = "units_switched";

/** A visitor submitted the newsletter sign-up form. */
export const NEWSLETTER_SIGNUP_SUBMITTED_EVENT = "newsletter_signup_submitted";

/** The only properties `units_switched` carries: the system switched to. */
export function unitsSwitchedProperties(to: UnitSystem): { to: UnitSystem } {
  return { to };
}
