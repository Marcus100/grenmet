/**
 * Example GMS daily product suite (full aggregate payload).
 * Composes individual product examples into a Suite.
 * Import from @/data/gms-suite.example.
 */

import { gmsEveningForecastExample } from "@/data/gms-evening-forecast.example";
import { gmsMarineBulletinExample } from "@/data/gms-marine-bulletin.example";
import { gmsMiddayWeatherReportExample } from "@/data/gms-midday-weather-report.example";
import { gmsMorningForecastExample } from "@/data/gms-morning-forecast.example";
import { gmsTropicalOutlookExample } from "@/data/gms-tropical-outlook.example";
import type { Suite } from "@/db/schema/suite-types";

export const gmsDailySuiteExample: Suite = {
  suite_metadata: {
    suite_id: "GMS-DAILY-SUITE-2026-02-23",
    suite_type: "daily_product_suite",
    schema_family: "gms_product_suite_v2",
    schema_version: "2.0.0",
    issuing_agency: {
      name: "Grenada Meteorological Service",
      department: "Meteorological Department, GAA",
      country: "Grenada",
      iso3: "GRD",
      timezone: "America/Grenada",
      contacts: {
        email: "meteorology@gaa.gd",
        telephone: "+1-473-444-4142",
        telephone_alt: "+1-473-444-4101",
        fax: "+1-473-444-1574",
        website: "https://www.weather.gaa.gd",
      },
    },
    suite_issue_datetime_local: "2026-02-23T05:00:00-04:00",
    suite_issue_datetime_utc: "2026-02-23T09:00:00Z",
    geography: {
      area_name: "State of Grenada",
      granularity: "national_only",
    },
    update_policy: {
      next_update_time_local: "2026-02-23T14:00:00-04:00",
      next_update_time_utc: "2026-02-23T18:00:00Z",
      notes:
        "Some products specify next update times; suite also carries an operational next update time.",
    },
    best_practice_flags: {
      wmo_alignment_intent: true,
      icao_alignment_intent: true,
      ibf_required_for_all_products: true,
      cap_generated_for_warnings_advisories_only: true,
    },
  },

  catalog: {
    product_types_supported: [
      {
        product_type: "marine_bulletin",
        payload_schema: "gms_marine_bulletin_payload_v2",
        ibf_schema: "gms_ibf_assessment_v1",
        cap_schema: "cap_alert_bundle_v1",
      },
      {
        product_type: "morning_forecast",
        payload_schema: "gms_public_forecast_payload_v2",
        ibf_schema: "gms_ibf_assessment_v1",
        cap_schema: "cap_alert_bundle_v1",
      },
      {
        product_type: "midday_weather_report",
        payload_schema: "gms_midday_report_payload_v2",
        ibf_schema: "gms_ibf_assessment_v1",
        cap_schema: "cap_alert_bundle_v1",
      },
      {
        product_type: "evening_forecast",
        payload_schema: "gms_evening_forecast_payload_v2",
        ibf_schema: "gms_ibf_assessment_v1",
        cap_schema: "cap_alert_bundle_v1",
      },
      {
        product_type: "tropical_weather_outlook",
        payload_schema: "gms_tropical_outlook_payload_v2",
        ibf_schema: "gms_ibf_assessment_v1",
        cap_schema: "cap_alert_bundle_v1",
      },
    ],
    shared_elements_standard: {
      elements_block: [
        "weather",
        "wind",
        "seas",
        "visibility",
        "temperature",
        "tides",
        "sun_moon",
      ],
      units: {
        temperature: ["C"],
        wind_speed: ["mph", "kt"],
        wave_height: ["ft", "m"],
        visibility: ["nm", "km"],
        time_local_format: "HH:MM",
        date_format: "YYYY-MM-DD",
        timezone: "America/Grenada",
      },
    },
  },

  products: [
    gmsMarineBulletinExample,
    gmsMorningForecastExample,
    gmsMiddayWeatherReportExample,
    gmsEveningForecastExample,
    gmsTropicalOutlookExample,
  ],
};
