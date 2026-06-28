/**
 * Example morning forecast for GMS; use for viewing in React.
 * Import from @/data/wxproducts/gms-morning-forecast.example.
 */

import type { MorningForecastProduct } from "@/db/wxproducts/schema/morning";

export const gmsMorningForecastExample: MorningForecastProduct = {
  product_metadata: {
    product_id: "GMS-MORNING-2026-02-23T05:00-04:00",
    product_type: "morning_forecast",
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
    ibf_assessment_id: "IBF-2026-02-23-MORNING",
    cap_bundle_id: null,
    related_product_ids: ["GMS-MARINE-2026-02-23T05:00-04:00"],
  },
  forecast: {
    headline:
      "Generally fair, windy and hazy; partly cloudy at times with a few light showers.",
    elements: {
      weather: {
        text: "Generally fair, windy and hazy, becoming partly cloudy at times with a few light showers mainly during the afternoon.",
      },
      wind: {
        direction_min: "E",
        direction_max: "SE",
        speed_min: 15,
        speed_max: 25,
        speed_unit: "mph",
        speed_gusting: "gusting to 30 mph at times",
      },
      seas: {
        text: "Moderate with waves 5–7 feet in northeasterly swells in open waters.",
        wave_max: { value: 7, unit: "ft", context: "open_waters" },
      },
      visibility: {
        text: "Good (greater than 5 nautical miles); may be reduced at times by haze and dust.",
        min: { value: 5, unit: "nm" },
      },
      temperature: {
        max_c: 30.5,
        min_c: 25.5,
      },
      tides: {
        events: [
          { type: "high", time_local: "07:00" },
          { type: "low", time_local: "13:30" },
          { type: "high", time_local: "19:45" },
          { type: "low", time_local: "01:15" },
        ],
      },
      sun_moon: {
        sunrise_local: "06:25",
        sunset_local: "18:15",
        moon_phase_last: { phase: "New Moon", date: "2026-02-17" },
        moon_phase_next: { phase: "First Quarter", date: "2026-02-24" },
      },
    },
    product_notes: {
      advisories_text: [
        "Small craft operators should consult the Marine Bulletin before departure.",
        "Haze and dust may affect visibility; motorists and mariners should exercise caution.",
      ],
    },
  },
};
