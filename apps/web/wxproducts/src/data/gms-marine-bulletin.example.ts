/**
 * Example marine bulletin for GMS; use for viewing in React.
 * Import from @/data/gms-marine-bulletin.example.
 */

import type { MarineBulletinProduct } from "@/app/schema/marine";

export const gmsMarineBulletinExample: MarineBulletinProduct = {
  product_metadata: {
    product_id: "GMS-MARINE-2026-02-23T05:00-04:00",
    product_type: "marine_bulletin",
    issue_datetime_local: "2026-02-23T05:00:00-04:00",
    issue_datetime_utc: "2026-02-23T09:00:00Z",
    validity: {
      valid_from_local: "2026-02-23T06:00:00-04:00",
      valid_to_local: "2026-02-23T18:00:00-04:00",
      valid_duration_hours: 12,
      validity_text: "Today",
    },
    status: "operational",
    language: "en",
    versioning: {
      version: 1,
      revision: 0,
      is_correction: false,
      replaces_product_id: null,
      change_summary: null,
    },
    geography: { area_name: "State of Grenada" },
    product_channel: ["website", "social_media", "email", "api"],
    forecaster: { name: "Duty Forecaster", role: "Forecaster" },
  },
  links: {
    ibf_assessment_id: "IBF-2026-02-23-MARINE",
    cap_bundle_id: null,
    related_product_ids: ["GMS-MORNING-2026-02-23T05:00-04:00"],
  },
  payload: {
    color_code: "GREEN",
    synopsis: { summary: "Moderate seas; winds E'ly 15–25 mph." },
    elements: {
      weather: { text: "Generally fair." },
      wind: {
        direction_text: "E'ly to SE'ly",
        speed_range: { min: 15, max: 25, unit: "mph" },
      },
      seas: {
        text: "Moderate with waves 5–7 feet in open waters.",
        wave_max: { value: 7, unit: "ft", context: "open_waters" },
      },
      visibility: { text: "Good overall." },
    },
    coastal_wave_notes: { west: "3–4 ft", east: "4–5 ft" },
    response_summary_text: "No significant response required.",
  },
};
