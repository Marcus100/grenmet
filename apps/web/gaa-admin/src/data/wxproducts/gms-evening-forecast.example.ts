/**
 * Example evening forecast for GMS; use for viewing in React.
 * Import from @/data/wxproducts/gms-evening-forecast.example.
 */

import type { EveningForecastProduct } from "@/db/wxproducts/schema/evening";

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
      validity_text: "6:00 pm tonight through Wednesday evening",
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
    ibf_assessment_id: "IBF-2026-02-22-EVENING",
    cap_bundle_id: null,
    related_product_ids: ["GMS-MARINE-2026-02-23T05:00-04:00"],
  },
  forecast: {
    headline:
      "Generally fair, windy and slightly hazy with a few brief isolated showers; similar conditions through midweek.",
    periods: {
      // ── Tonight (6 pm – 6 am) ──────────────────────────────────────────────
      night: {
        label: "Tonight",
        validity_window_local: {
          from: "2026-02-23T18:00:00-04:00",
          to: "2026-02-24T06:00:00-04:00",
          validity_text: "Tonight (6 pm – 6 am)",
        },
        elements: {
          weather: {
            text: "Generally fair, windy and slightly hazy with a few brief isolated showers.",
          },
          wind: {
            direction_min: "ENE",
            direction_max: "ESE",
            speed_min: 14,
            speed_max: 24,
            speed_unit: "mph",
            speed_gusting: "gusting to 28 mph at times",
          },
          seas: {
            text: "Moderate with waves 5–7 feet in northeasterly swells.",
            wave_max: { value: 7, unit: "ft", context: "open_waters" },
          },
          visibility: {
            text: "Good; slight haze at times.",
            min: { value: 5, unit: "nm" },
          },
          temperature: {
            min_c: 25.0,
          },
          tides: {
            events: [
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
      },

      // ── Day 1 — Monday 24 Feb ──────────────────────────────────────────────
      day_1: {
        label: "Monday",
        date_local: "2026-02-24",
        elements: {
          weather: {
            text: "Generally fair and windy; partly cloudy at times during the morning with a few light showers.",
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
            text: "Moderate to slightly rough with waves 6–8 feet in easterly swells.",
            wave_max: { value: 8, unit: "ft", context: "open_waters" },
          },
          visibility: {
            text: "Good; haze at times.",
            min: { value: 5, unit: "nm" },
          },
          temperature: {
            max_c: 30.5,
            min_c: 25.5,
          },
          tides: {
            events: [
              { type: "high", time_local: "08:00" },
              { type: "low", time_local: "14:15" },
              { type: "high", time_local: "20:30" },
              { type: "low", time_local: "02:00" },
            ],
          },
          sun_moon: {
            sunrise_local: "06:25",
            sunset_local: "18:15",
            moon_phase_next: { phase: "First Quarter", date: "2026-02-24" },
          },
        },
      },

      // ── Day 2 — Tuesday 25 Feb ─────────────────────────────────────────────
      day_2: {
        label: "Tuesday",
        date_local: "2026-02-25",
        elements: {
          weather: {
            text: "Generally fair and windy; partly cloudy overnight with a few brief isolated showers.",
          },
          wind: {
            direction_min: "E",
            direction_max: "ESE",
            speed_min: 15,
            speed_max: 25,
            speed_unit: "mph",
            speed_gusting: "gusting to 30 mph at times",
          },
          seas: {
            text: "Moderate to slightly rough with waves 6–8 feet in easterly swells.",
            wave_max: { value: 8, unit: "ft", context: "open_waters" },
          },
          visibility: {
            text: "Good; occasional haze.",
            min: { value: 5, unit: "nm" },
          },
          temperature: {
            max_c: 30.5,
            min_c: 25.0,
          },
          tides: {
            events: [
              { type: "high", time_local: "08:45" },
              { type: "low", time_local: "15:00" },
              { type: "high", time_local: "21:15" },
              { type: "low", time_local: "02:45" },
            ],
          },
          sun_moon: {
            sunrise_local: "06:24",
            sunset_local: "18:16",
            moon_phase_last: { phase: "First Quarter", date: "2026-02-24" },
          },
        },
      },

      // ── Day 3 — Wednesday 26 Feb ───────────────────────────────────────────
      day_3: {
        label: "Wednesday",
        date_local: "2026-02-26",
        elements: {
          weather: {
            text: "Partly cloudy and windy with scattered showers; more active than previous days.",
          },
          wind: {
            direction_min: "E",
            direction_max: "NE",
            speed_min: 18,
            speed_max: 28,
            speed_unit: "mph",
            speed_gusting: "gusting to 35 mph",
          },
          seas: {
            text: "Slightly rough to rough with waves 7–9 feet in northeasterly swells.",
            wave_max: { value: 9, unit: "ft", context: "open_waters" },
          },
          visibility: {
            text: "Moderate to good; locally reduced in showers.",
            min: { value: 3, unit: "nm" },
          },
          temperature: {
            max_c: 29.5,
            min_c: 24.5,
          },
          tides: {
            events: [
              { type: "high", time_local: "09:30" },
              { type: "low", time_local: "15:45" },
              { type: "high", time_local: "22:00" },
              { type: "low", time_local: "03:30" },
            ],
          },
          sun_moon: {
            sunrise_local: "06:24",
            sunset_local: "18:16",
          },
        },
      },
    },
  },
};
