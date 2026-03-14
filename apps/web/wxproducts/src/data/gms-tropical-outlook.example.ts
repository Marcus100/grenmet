/**
 * Example tropical weather outlook for GMS; use for viewing in React.
 * Import from @/data/gms-tropical-outlook.example.
 */

import type { TropicalOutlookProduct } from "@/db/schema/outlook";

export const gmsTropicalOutlookExample: TropicalOutlookProduct = {
  product_metadata: {
    product_id: "GMS-TROPICAL-OUTLOOK-2026-02-23T05:00-04:00",
    product_type: "tropical_weather_outlook",
    issue_datetime_local: "2026-02-23T05:00:00-04:00",
    issue_datetime_utc: "2026-02-23T09:00:00Z",
    validity: {
      valid_from_local: "2026-02-23T05:00:00-04:00",
      valid_to_local: "2026-02-24T05:00:00-04:00",
      valid_duration_hours: 24,
      validity_text: "Next 24 hours",
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
    geography: { area_name: "Eastern Caribbean" },
    product_channel: ["website", "social_media", "email", "api"],
    forecaster: { name: "Duty Forecaster", role: "Forecaster" },
  },
  links: {
    ibf_assessment_id: null,
    cap_bundle_id: null,
    related_product_ids: [],
  },
  payload: {
    outlook_type: "tropical_weather_outlook",
    area_of_special_interest: {
      description: "Eastern Caribbean and tropical Atlantic",
      geojson: null,
    },
    sources: [
      {
        source_name: "National Hurricane Center",
        source_type: "official",
        attribution_required: true,
        notes: null,
      },
    ],
    systems: [],
    next_update_time_local: "2026-02-24T05:00:00-04:00",
    public_message_plain_language:
      "No tropical cyclone formation expected in the next 5 days. Routine monitoring in place.",
  },
};
