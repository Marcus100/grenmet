// The "Complete your setup" steps for a new owner. Each step is read from the
// saved settings the agenda already needs (profile, services, providers and
// their hours). Nothing is stored: a step is done when the data says so.

import type {
  BookingProviderPublic,
  BookingServicePublic,
  BookingSettings,
} from "@barrelsgd/api-client";

export interface SetupStep {
  done: boolean;
  id: "services" | "hours" | "staffed" | "address" | "brand" | "payments";
  label: string;
  /** Where to do it, relative to the studio: a page, or a Settings section. */
  target:
    | "services"
    | "people"
    | "settings#hours"
    | "settings#profile"
    | "settings#payments";
}

/**
 * The ids of the active services no active person is set to do. Customers can
 * pick such a service but see no times for it. An add-on is left out: it is
 * booked with a main service and follows that service's person.
 */
export function servicesNobodyDoes(
  services: BookingServicePublic[],
  providers: BookingProviderPublic[]
): Set<string> {
  const done = new Set(
    providers
      .filter((person) => person.active)
      .flatMap((person) => person.service_ids)
  );
  return new Set(
    services
      .filter((item) => item.active && !item.is_add_on && !done.has(item.id))
      .map((item) => item.id)
  );
}

/**
 * The five steps, in the order an owner does them. "Share the address" is
 * read as the booking page being open at its address (sharing itself is not
 * recorded). "Payment choice" is done once the profile exists, because the
 * API stores a default ("deposit") and keeps no record of a choice. A sixth
 * step, "staffed", is listed only while an active service has no person.
 */
export function setupSteps(settings: BookingSettings): SetupStep[] {
  const profile = settings.profile;
  const unstaffed = servicesNobodyDoes(settings.services, settings.providers);
  const staffed: SetupStep[] =
    unstaffed.size > 0
      ? [
          {
            id: "staffed",
            label: "Set a person to do every service",
            done: false,
            target: "people",
          },
        ]
      : [];
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
    ...staffed,
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
