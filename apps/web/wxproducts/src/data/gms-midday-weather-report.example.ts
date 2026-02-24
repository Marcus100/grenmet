/**
 * Example midday weather report for GMS; use for viewing in React.
 * Import from @/data/gms-midday-weather-report.example.
 */

import type { MiddayWeatherReportProduct } from "@/app/schema/midday";

export const gmsMiddayWeatherReportExample: MiddayWeatherReportProduct = {
  product_metadata: {
    product_id: "GMS-MIDDAY-2026-02-23T12:00-04:00",
    product_type: "midday_weather_report",
    issue_datetime_local: "2026-02-23T12:00:00-04:00",
    issue_datetime_utc: "2026-02-23T16:00:00Z",
    validity: {
      valid_from_local: "2026-02-23T12:00:00-04:00",
      valid_to_local: "2026-02-23T18:00:00-04:00",
      valid_duration_hours: 6,
      validity_text: "This afternoon",
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
    station_observation: {
      station_name: "Maurice Bishop International Airport",
      observation_time_local: "2026-02-23T12:00:00-04:00",
      air_temperature_c: 29.5,
    },
    headline: "Warm and partly cloudy with a few showers possible.",
    elements: {
      weather: { text: "Partly cloudy with isolated showers." },
      temperature: { max_c: 30.5, min_c: 25.5 },
    },
    education: {
      word_of_the_day: {
        term: "Trade wind",
        definition:
          "A wind that blows steadily toward the equator from the northeast or southeast.",
      },
    },
  },
};
