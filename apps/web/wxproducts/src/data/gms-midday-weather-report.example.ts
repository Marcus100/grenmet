/**
 * Example midday weather report for GMS; use for viewing in React.
 * Import from @/data/gms-midday-weather-report.example.
 */

import type { MiddayForecastProduct } from "@/db/schema/midday";

export const gmsMiddayWeatherReportExample: MiddayForecastProduct = {
  product_metadata: {
    product_id: "GMS-MIDDAY-2026-02-23T12:00-04:00",
    product_type: "midday_weather_report",
    issue_datetime_local: "2026-02-23T12:00:00-04:00",
    issue_datetime_utc: "2026-02-23T16:00:00Z",
    validity: {
      valid_from_local: "2026-02-23T12:00:00-04:00",
      valid_to_local: "2026-02-24T06:00:00-04:00",
      valid_duration_hours: 18,
      validity_text: "This afternoon & tonight",
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
    ibf_assessment_id: "IBF-2026-02-23-MIDDAY",
    cap_bundle_id: null,
    related_product_ids: ["GMS-MARINE-2026-02-23T05:00-04:00"],
  },
  forecast: {
    station_observation: {
      station_name: "Maurice Bishop International Airport",
      observation_time_local: "2026-02-23T12:00:00-04:00",
      air_temperature_c: 29.1,
    },
    headline:
      "Fair, windy and hazy; increasing cloudiness by evening with a few light showers.",
    elements: {
      weather: {
        text: "Fair, windy and hazy this afternoon; increasing cloudiness by evening with a few light showers overnight.",
      },
      wind: {
        direction_min: "E",
        direction_max: "SE",
        speed_min: 14,
        speed_max: 24,
        speed_unit: "mph",
        speed_gusting: "gusting to 28 mph at times",
      },
      seas: {
        text: "Moderate to slightly rough with waves up to 8 feet in northeasterly swells in open waters.",
        wave_max: { value: 8, unit: "ft", context: "open_waters" },
      },
      visibility: {
        text: "Good overall; may be reduced at times by haze and dust.",
        min: { value: 5, unit: "nm" },
      },
      temperature: {
        max_c: 30.5,
        min_c: 25.0,
      },
      tides: {
        events: [
          { type: "low", time_local: "13:30" },
          { type: "high", time_local: "19:45" },
          { type: "low", time_local: "01:15" },
        ],
      },
      sun_moon: {
        sunset_local: "18:15",
        sunrise_next_local: "06:25",
        moon_phase_next: { phase: "First Quarter", date: "2026-02-24" },
      },
    },
    education: {
      word_of_the_day: {
        term: "Haze",
        definition:
          "A suspension of extremely small dry particles in the air, invisible to the naked eye but sufficient to give the air an opalescent appearance that reduces horizontal visibility.",
      },
    },
  },
};
