// The "Complete your setup" steps for a new owner. Each step is read from the
// saved settings the agenda already needs (profile, services, providers and
// their hours). Nothing is stored: a step is done when the data says so.

import type { BookingSettings } from "@barrelsgd/api-client";

export interface SetupStep {
  done: boolean;
  id: "services" | "hours" | "address" | "brand" | "payments";
  label: string;
  /** Where to do it, relative to the studio: a page, or a Settings section. */
  target:
    | "services"
    | "settings#hours"
    | "settings#profile"
    | "settings#payments";
}

/**
 * The five steps, in the order an owner does them. "Share the address" is
 * read as the booking page being open at its address (sharing itself is not
 * recorded). "Payment choice" is done once the profile exists, because the
 * API stores a default ("deposit") and keeps no record of a choice.
 */
export function setupSteps(settings: BookingSettings): SetupStep[] {
  const profile = settings.profile;
  return [
    {
      id: "services",
      label: "Add a service customers can book",
      done: settings.services.length > 0,
      target: "services",
    },
    {
      id: "hours",
      label: "Set the weekly hours for a provider",
      done: settings.providers.some((item) => item.working_hours.length > 0),
      target: "settings#hours",
    },
    {
      id: "address",
      label: "Open your booking page and share its address",
      done: profile?.enabled === true && Boolean(profile.public_slug),
      target: "settings#profile",
    },
    {
      id: "brand",
      label: "Choose an accent colour or upload a logo",
      done: Boolean(profile?.brand_color || profile?.logo_file_id),
      target: "settings#profile",
    },
    {
      id: "payments",
      label: "Choose how customers pay",
      done: profile !== null,
      target: "settings#payments",
    },
  ];
}

export function setupDoneCount(steps: SetupStep[]): number {
  return steps.filter((step) => step.done).length;
}
