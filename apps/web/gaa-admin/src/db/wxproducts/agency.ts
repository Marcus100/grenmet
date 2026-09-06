/**
 * The Grenada Meteorological Service as it identifies itself on published
 * products: the issuing agency block and the shared element standard that every
 * daily suite carries.
 *
 * Held in one place because these values reach the public — they appear on
 * bulletins and in the machine-readable payloads other agencies consume — so a
 * stale phone number or a drifting area name would be published, not just
 * stored.
 */

import type { Suite } from "@/db/wxproducts/schema/suite-types";

type SuiteMetadata = Suite["suite_metadata"];

export const GMS_AGENCY: SuiteMetadata["issuing_agency"] = {
  contacts: {
    email: "meteorology@gaa.gd",
    fax: "+1-473-444-1574",
    telephone: "+1-473-444-4142",
    telephone_alt: "+1-473-444-4101",
    website: "https://www.weather.gaa.gd",
  },
  country: "Grenada",
  department: "Meteorological Department, GAA",
  iso3: "GRD",
  name: "Grenada Meteorological Service",
  timezone: "America/Grenada",
};

export const GMS_GEOGRAPHY: SuiteMetadata["geography"] = {
  area_name: "State of Grenada",
  granularity: "national_only",
};

export const GMS_SCHEMA_FAMILY = "gms_product_suite_v2";
export const GMS_SCHEMA_VERSION = "2.0.0";

/**
 * Standards the service commits to on every product. These are assertions about
 * how GMS operates, not defaults: changing one is an operational decision.
 */
export const GMS_BEST_PRACTICE: SuiteMetadata["best_practice_flags"] = {
  cap_generated_for_warnings_advisories_only: true,
  ibf_required_for_all_products: true,
  icao_alignment_intent: true,
  wmo_alignment_intent: true,
};

export const GMS_SHARED_ELEMENTS: Suite["catalog"]["shared_elements_standard"] =
  {
    elements_block: [
      "weather",
      "wind",
      "seas",
      "temperature",
      "tides",
      "sun_moon",
      "visibility",
    ],
    units: {
      seas: ["ft", "m"],
      temperature: "degC",
      wind: ["mph", "kt"],
    },
  };

export const GMS_PRODUCT_CATALOG: Suite["catalog"]["product_types_supported"] =
  [
    {
      cap_schema: "cap_alert_bundle_v1",
      ibf_schema: "gms_ibf_assessment_v1",
      payload_schema: "gms_morning_forecast_payload_v2",
      product_type: "morning_forecast",
    },
    {
      cap_schema: "cap_alert_bundle_v1",
      ibf_schema: "gms_ibf_assessment_v1",
      payload_schema: "gms_midday_weather_report_payload_v2",
      product_type: "midday_weather_report",
    },
    {
      cap_schema: "cap_alert_bundle_v1",
      ibf_schema: "gms_ibf_assessment_v1",
      payload_schema: "gms_evening_forecast_payload_v2",
      product_type: "evening_forecast",
    },
    {
      cap_schema: "cap_alert_bundle_v1",
      ibf_schema: "gms_ibf_assessment_v1",
      payload_schema: "gms_marine_bulletin_payload_v2",
      product_type: "marine_bulletin",
    },
    {
      cap_schema: "cap_alert_bundle_v1",
      ibf_schema: "gms_ibf_assessment_v1",
      payload_schema: "gms_tropical_weather_outlook_payload_v2",
      product_type: "tropical_weather_outlook",
    },
  ];
