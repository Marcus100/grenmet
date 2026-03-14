/**
 * Example evening forecast for GMS; use for viewing in React.
 * Import from @/data/gms-evening-forecast.example.
 */

import type { EveningForecastProduct } from "@/db/schema/evening";

const sharedElements = {
  weather: { text: "Partly cloudy with a few showers." },
  wind: {
    direction_text: "E'ly",
    speed_range: { min: 10, max: 18, unit: "mph" },
  },
  temperature: { max_c: 29, min_c: 25 },
};

export const gmsEveningForecastExample: EveningForecastProduct = {
  product_metadata: {
    product_id: "GMS-EVENING-2026-02-23T17:00-04:00",
    product_type: "evening_forecast",
    issue_datetime_local: "2026-02-23T17:00:00-04:00",
    issue_datetime_utc: "2026-02-23T21:00:00Z",
    validity: {
      valid_from_local: "2026-02-23T18:00:00-04:00",
      valid_to_local: "2026-02-26T18:00:00-04:00",
      valid_duration_hours: 72,
      validity_text: "Tonight through Wednesday",
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
    ibf_assessment_id: null,
    cap_bundle_id: null,
    related_product_ids: [],
  },
  payload: {
    headline:
      "Partly cloudy with a few showers tonight; similar conditions through midweek.",
    periods: {
      night: {
        label: "Tonight",
        validity_window_local: {
          from: "2026-02-23T18:00:00-04:00",
          to: "2026-02-24T06:00:00-04:00",
          validity_text: "Tonight",
        },
        elements: sharedElements,
      },
      day_1: {
        label: "Monday",
        date_local: "2026-02-24",
        elements: sharedElements,
      },
      day_2: {
        label: "Tuesday",
        date_local: "2026-02-25",
        elements: sharedElements,
      },
      day_3: {
        label: "Wednesday",
        date_local: "2026-02-26",
        elements: sharedElements,
      },
    },
  },
};
