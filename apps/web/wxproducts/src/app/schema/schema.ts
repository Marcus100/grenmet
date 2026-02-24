/**
 * Legacy: example suite data. Prefer importing from @/app/schema/suite-example.
 */
import type { Suite } from "./suite-types";

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
    geography: { area_name: "State of Grenada", granularity: "national_only" },
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

  cross_cutting: {
    ibf: {
      ibf_framework: {
        name: "GMS Impact-Based Forecasting",
        version: "1.0",
        required_components_for_all_products: [
          "likelihood",
          "impact",
          "response",
        ],
        scales: {
          likelihood_levels: ["Very Low", "Low", "Medium", "High", "Very High"],
          impact_severity_levels: [
            "None",
            "Minor",
            "Moderate",
            "Major",
            "Extreme",
          ],
          response_levels: [
            "Monitor",
            "Be Aware",
            "Be Prepared",
            "Take Action",
            "Avoid / Evacuate",
          ],
        },
        sectors: [
          "general_public",
          "aviation",
          "marine",
          "agriculture",
          "health",
          "transport",
          "tourism",
          "utilities",
        ],
      },
      assessments: [
        {
          ibf_assessment_id: "IBF-2026-02-23-MARINE",
          applies_to: {
            type: "product",
            product_id: "GMS-MARINE-2026-02-23T05:00-04:00",
          },
          hazards: [
            {
              hazard_type: "hazardous_seas",
              qualifiers: ["choppy_seas", "moderate_to_slightly_rough"],
            },
            { hazard_type: "reduced_visibility", qualifiers: ["haze_or_dust"] },
          ],
          likelihood: {
            level: "Medium",
            rationale:
              "Trade-wind regime and swell support continued choppy sea state; haze likely intermittent.",
          },
          impact: {
            severity: "Minor",
            summary:
              "Choppy seas may affect small craft; haze may temporarily reduce horizontal visibility.",
            sector_impacts: [
              {
                sector: "marine",
                severity: "Minor",
                details:
                  "Small craft handling hazards; discomfort; increased risk near high tide and exposed waters.",
              },
              {
                sector: "general_public",
                severity: "None",
                details:
                  "Primary concern is for mariners; minimal general public disruption expected.",
              },
              {
                sector: "tourism",
                severity: "Minor",
                details:
                  "Potential minor disruption to small-boat excursions depending on operator thresholds.",
              },
            ],
          },
          response: {
            level: "Be Aware",
            recommended_actions: [
              "Small craft operators should exercise caution, especially near high tide and in exposed waters.",
              "Maintain proper lookout; visibility may be reduced at times by haze/dust.",
              "Ensure life jackets and communications equipment are available and functional.",
            ],
          },
          confidence: {
            level: "Medium",
            notes:
              "Sea state and trades are consistent; haze intensity may vary locally.",
          },
          timing: {
            onset_local: "2026-02-23T05:00:00-04:00",
            end_local: "2026-02-24T05:00:00-04:00",
          },
        },

        {
          ibf_assessment_id: "IBF-2026-02-23-MORNING",
          applies_to: {
            type: "product",
            product_id: "GMS-MORNING-2026-02-23T05:00-04:00",
          },
          hazards: [
            { hazard_type: "reduced_visibility", qualifiers: ["haze_or_dust"] },
          ],
          likelihood: {
            level: "Medium",
            rationale:
              "Moderate haze possible during the day with variable intensity.",
          },
          impact: {
            severity: "Minor",
            summary:
              "Haze may affect visibility for sensitive users; marine conditions are covered by the marine bulletin.",
            sector_impacts: [
              {
                sector: "general_public",
                severity: "Minor",
                details:
                  "Haze may reduce visibility for drivers and outdoor activities; sensitive individuals may notice degraded air quality.",
              },
              {
                sector: "transport",
                severity: "Minor",
                details:
                  "Localized visibility reduction possible; no widespread disruption expected.",
              },
              {
                sector: "marine",
                severity: "Minor",
                details:
                  "Marine impacts covered in marine bulletin; small craft caution remains relevant.",
              },
            ],
          },
          response: {
            level: "Be Aware",
            recommended_actions: [
              "Use caution if traveling in hazy conditions; allow more stopping distance.",
              "Boaters should also consult the Marine Bulletin for sea state guidance.",
            ],
          },
          confidence: {
            level: "Medium",
            notes:
              "Haze intensity depends on upstream aerosol loading and local mixing.",
          },
          timing: {
            onset_local: "2026-02-23T06:00:00-04:00",
            end_local: "2026-02-23T18:00:00-04:00",
          },
        },

        {
          ibf_assessment_id: "IBF-2026-02-23-MIDDAY",
          applies_to: {
            type: "product",
            product_id: "GMS-MIDDAY-2026-02-23T12:00-04:00",
          },
          hazards: [
            { hazard_type: "reduced_visibility", qualifiers: ["haze_or_dust"] },
            {
              hazard_type: "hazardous_seas",
              qualifiers: ["moderate_to_slightly_rough"],
            },
          ],
          likelihood: {
            level: "Medium",
            rationale: "Haze and choppy seas persist into afternoon and night.",
          },
          impact: {
            severity: "Minor",
            summary:
              "Haze may temporarily reduce visibility; small craft may experience hazardous handling conditions.",
            sector_impacts: [
              {
                sector: "general_public",
                severity: "Minor",
                details: "Haze may reduce visibility intermittently.",
              },
              {
                sector: "marine",
                severity: "Minor",
                details:
                  "Small craft impacts persist; see Marine Bulletin for details.",
              },
            ],
          },
          response: {
            level: "Be Aware",
            recommended_actions: [
              "Exercise caution if visibility is reduced by haze.",
              "Small craft operators should use caution and consult marine guidance.",
            ],
          },
          confidence: {
            level: "Medium",
            notes: "Conditions consistent with stable synoptic regime.",
          },
          timing: {
            onset_local: "2026-02-23T12:00:00-04:00",
            end_local: "2026-02-24T06:00:00-04:00",
          },
        },

        {
          ibf_assessment_id: "IBF-2026-02-22-EVENING",
          applies_to: {
            type: "product",
            product_id: "GMS-EVENING-2026-02-22T18:00-04:00",
          },
          hazards: [
            { hazard_type: "hazardous_seas", qualifiers: ["choppy_seas"] },
            { hazard_type: "reduced_visibility", qualifiers: ["slight_haze"] },
          ],
          likelihood: {
            level: "Medium",
            rationale:
              "Sea state and haze expected to persist through the multi-day outlook.",
          },
          impact: {
            severity: "Minor",
            summary:
              "Minor impacts mainly to small craft; slight haze may reduce visibility at times.",
            sector_impacts: [
              {
                sector: "marine",
                severity: "Minor",
                details:
                  "Small craft conditions remain a concern during the outlook window.",
              },
              {
                sector: "general_public",
                severity: "None",
                details: "No widespread disruption expected.",
              },
            ],
          },
          response: {
            level: "Be Aware",
            recommended_actions: [
              "Small craft operators should remain cautious during periods of rougher seas.",
            ],
          },
          confidence: {
            level: "Medium",
            notes:
              "Outlook confidence moderate; day-to-day variations possible.",
          },
          timing: {
            onset_local: "2026-02-22T18:00:00-04:00",
            end_local: "2026-02-25T18:00:00-04:00",
          },
        },

        {
          ibf_assessment_id: "IBF-2023-07-15-TWO-SYS-01",
          applies_to: {
            type: "tropical_system",
            product_id: "GMS-TWO-2023-07-15T08:00-04:00",
            system_id: "TWO-SYS-01",
          },
          hazards: [
            { hazard_type: "heavy_rain", qualifiers: ["flash_flood_risk"] },
            {
              hazard_type: "landslide",
              qualifiers: ["saturated_slopes_possible"],
            },
            {
              hazard_type: "thunderstorms",
              qualifiers: ["gusty_winds_possible"],
            },
          ],
          likelihood: {
            level: "Medium",
            rationale:
              "Moisture and convective activity may increase as the system approaches.",
          },
          impact: {
            severity: "Moderate",
            summary:
              "Potential for flash flooding and landslides in susceptible areas during periods of heavier showers/thunderstorms.",
            sector_impacts: [
              {
                sector: "general_public",
                severity: "Moderate",
                details:
                  "Localized flooding/landslides possible; short-notice hazards in vulnerable locations.",
              },
              {
                sector: "transport",
                severity: "Moderate",
                details: "Temporary road flooding/obstructions possible.",
              },
              {
                sector: "agriculture",
                severity: "Minor",
                details: "Localized field flooding possible.",
              },
            ],
          },
          response: {
            level: "Be Prepared",
            recommended_actions: [
              "Monitor official updates and be prepared to avoid flood-prone and landslide-prone areas during heavy rainfall.",
              "Secure loose outdoor items where gusty winds occur in thunderstorms.",
            ],
          },
          confidence: {
            level: "Low",
            notes:
              "Track and rainfall distribution uncertain at this lead time.",
          },
          timing: {
            onset_local: "2023-07-15T12:00:00-04:00",
            end_local: "2023-07-17T12:00:00-04:00",
          },
        },
      ],
    },

    cap: {
      cap_generation_policy: {
        generate_for: ["warning", "watch", "advisory"],
        do_not_generate_for: [
          "routine_forecast",
          "informational_outlook_without_hazard_product",
        ],
        relationship_to_ibf:
          "IBF assessment informs CAP severity/urgency/certainty mapping but CAP remains a distinct alert layer.",
      },
      alert_bundles: [
        {
          cap_bundle_id: "CAPB-2026-02-23-MARINE-ADV-01",
          linked_product_ids: ["GMS-MARINE-2026-02-23T05:00-04:00"],
          linked_ibf_assessment_ids: ["IBF-2026-02-23-MARINE"],
          cap_alerts: [
            {
              cap_alert_id: "CAP-2026-02-23-MARINE-ADV-01",
              cap_profile: "CAP 1.2",
              message_type: "Alert",
              scope: "Public",
              status: "Actual",
              category: ["Met"],
              event: "Small Craft Advisory",
              urgency: "Expected",
              severity: "Minor",
              certainty: "Likely",
              effective_utc: "2026-02-23T09:00:00Z",
              onset_utc: "2026-02-23T09:00:00Z",
              expires_utc: "2026-02-24T09:00:00Z",
              headline:
                "Small Craft Advisory in effect for Grenada Coastal Waters",
              description:
                "Choppy seas and moderate to slightly rough conditions may affect small craft. Visibility may be reduced at times due to haze/dust.",
              instruction:
                "Small craft operators should exercise caution, especially near high tide and in exposed waters. Maintain proper lookout in haze.",
              area_description: "State of Grenada coastal waters",
              references: [],
              sender: "Grenada Meteorological Service",
            },
          ],
        },
      ],
    },
  },

  products: [
    {
      product_metadata: {
        product_id: "GMS-MARINE-2026-02-23T05:00-04:00",
        product_type: "marine_bulletin",
        issue_datetime_local: "2026-02-23T05:00:00-04:00",
        issue_datetime_utc: "2026-02-23T09:00:00Z",
        validity: {
          valid_from_local: "2026-02-23T05:00:00-04:00",
          valid_to_local: "2026-02-24T05:00:00-04:00",
          valid_duration_hours: 24,
          validity_text: "Valid 24 hours",
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
        geography: { area_name: "State of Grenada (Coastal Waters)" },
        product_channel: ["website", "social_media", "email", "api"],
        forecaster: { name: "Duty Forecaster", role: "Forecaster" },
      },
      links: {
        ibf_assessment_id: "IBF-2026-02-23-MARINE",
        cap_bundle_id: "CAPB-2026-02-23-MARINE-ADV-01",
      },
      payload: {
        color_code: "YELLOW",
        synopsis: {
          summary:
            "The central Atlantic high-pressure system will be the dominant feature.",
        },
        elements: {
          weather: {
            text: "Fair to partly cloudy, windy and hazy with a few isolated showers mainly overnight.",
          },
          wind: {
            direction_text: "ENE'ly to ESE'ly",
            speed_range: { min: 14, max: 24, unit: "kt" },
            gusts_text: "Gusting higher at times",
          },
          seas: {
            text: "Moderate to slightly rough with waves up to 8 feet in N'ly to NE'ly swells.",
            wave_max: { value: 8, unit: "ft", context: "open_waters" },
          },
          visibility: {
            text: "Good (greater than 5 nautical miles); may be reduced at times by haze/dust.",
            min: { value: 5, unit: "nm" },
          },
          tides: {
            events: [
              { type: "high", time_local: "07:00" },
              { type: "low", time_local: "14:15" },
              { type: "high", time_local: "20:00" },
            ],
          },
          sun_moon: {
            sunrise_local: "06:25",
            sunset_local: "18:15",
            moon_phase_last: { phase: "New Moon", date: "2026-02-17" },
            moon_phase_next: { phase: "First Quarter", date: "2026-02-24" },
          },
        },
        coastal_wave_notes: {
          west: "Moderate waves taking longer form, many whitecaps, some spray.",
          east: "Moderate waves taking longer form, many whitecaps, some spray.",
        },
        response_summary_text:
          "Be aware of vulnerable small watercraft especially during high tide.",
      },
    },

    {
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
      payload: {
        headline:
          "Generally fair, windy and hazy; partly cloudy at times with a few light showers.",
        elements: {
          weather: {
            text: "Generally fair, windy and hazy, becoming partly cloudy at times with a few light showers.",
          },
          wind: {
            direction_text: "E'ly to SE'ly",
            speed_range: { min: 15, max: 25, unit: "mph" },
            gusts_text: "gusting higher at times",
          },
          seas: {
            text: "Moderate with waves 5–7 feet in open waters.",
            wave_max: { value: 7, unit: "ft", context: "open_waters" },
          },
          visibility: {
            text: "Good overall; may be reduced at times by haze.",
          },
          temperature: { max_c: 30.5, min_c: 25.5 },
          tides: {
            events: [
              { type: "high", time_local: "07:00" },
              { type: "low", time_local: "14:00" },
            ],
          },
          sun_moon: { sunrise_local: "06:25", sunset_local: "18:15" },
        },
        product_notes: {
          advisories_text: [
            "Small craft operators should consult the Marine Bulletin.",
          ],
        },
      },
    },

    {
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
      payload: {
        station_observation: {
          station_name: "Maurice Bishop International Airport",
          observation_time_local: "2026-02-23T12:00:00-04:00",
          air_temperature_c: 29.1,
        },
        headline:
          "Fair, windy & hazy; increasing cloudiness by evening with a few light showers.",
        elements: {
          weather: {
            text: "Fair, windy & hazy; increasing cloudiness by evening with a few light showers.",
          },
          wind: {
            direction_text: "E'ly to SE'ly",
            speed_range: { min: 14, max: 24, unit: "mph" },
            gusts_text: "gusting higher at times",
          },
          seas: {
            text: "Moderate to slightly rough with waves up to 8 feet in open water.",
            wave_max: { value: 8, unit: "ft", context: "open_waters" },
          },
          visibility: {
            text: "Good overall; may be reduced at times by haze.",
          },
          tides: {
            events: [
              { type: "low", time_local: "14:15" },
              { type: "high", time_local: "20:00" },
              { type: "low", time_local: "01:45" },
            ],
          },
          sun_moon: { sunset_local: "18:15", sunrise_next_local: "06:25" },
        },
        education: {
          word_of_the_day: {
            term: "Shower",
            definition:
              "Precipitation from a convective cloud characterized by sudden beginning and ending, changes in intensity, and rapid changes in the appearance of the sky.",
          },
        },
      },
    },

    {
      product_metadata: {
        product_id: "GMS-EVENING-2026-02-22T18:00-04:00",
        product_type: "evening_forecast",
        issue_datetime_local: "2026-02-22T18:00:00-04:00",
        issue_datetime_utc: "2026-02-22T22:00:00Z",
        validity: {
          valid_from_local: "2026-02-22T18:00:00-04:00",
          valid_to_local: "2026-02-25T18:00:00-04:00",
          valid_duration_hours: 72,
          validity_text: "6:00 pm until 6:00 am & the following three (3) days",
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
      payload: {
        headline:
          "Generally fair, windy, and slightly hazy with a few brief isolated showers.",
        periods: {
          night: {
            label: "Tonight",
            validity_window_local: {
              from: "2026-02-22T18:00:00-04:00",
              to: "2026-02-23T06:00:00-04:00",
              validity_text: "Tonight (6pm–6am)",
            },
            elements: {
              weather: {
                text: "Generally fair, windy, and slightly hazy with a few brief isolated showers.",
              },
              wind: {
                direction_text: "ENE'ly to ESE'ly",
                speed_range: { min: 14, max: 24, unit: "mph" },
              },
              seas: {
                text: "Moderate with waves 5–7 feet in open waters",
                wave_max: { value: 7, unit: "ft", context: "open_waters" },
              },
              visibility: { text: "Slight haze at times." },
              temperature: { min_c: 25.0 },
              tides: {
                events: [
                  { type: "high", time_local: "19:00" },
                  { type: "low", time_local: "01:00" },
                ],
              },
              sun_moon: { sunset_local: "18:15", sunrise_next_local: "06:25" },
            },
          },
          day_1: {
            label: "Day 1",
            date_local: "2026-02-23",
            elements: {
              weather: {
                text: "Generally fair, windy and hazy; partly cloudy at times with a few light showers.",
              },
              wind: {
                direction_text: "E'ly to SE'ly",
                speed_range: { min: 15, max: 25, unit: "mph" },
              },
              seas: {
                text: "Moderate with waves 5–7 feet in open waters",
                wave_max: { value: 7, unit: "ft", context: "open_waters" },
              },
              visibility: { text: "Haze at times." },
              temperature: { max_c: 30.5, min_c: 25.5 },
              tides: {
                events: [
                  { type: "high", time_local: "07:00" },
                  { type: "low", time_local: "14:00" },
                ],
              },
              sun_moon: { sunrise_local: "06:25", sunset_local: "18:15" },
            },
          },
          day_2: {
            label: "Day 2",
            date_local: "2026-02-24",
            elements: {
              weather: {
                text: "Generally fair and windy; partly cloudy at times during the morning.",
              },
              wind: {
                direction_text: "E'ly to ESE'ly",
                speed_range: { min: 15, max: 25, unit: "mph" },
              },
              seas: {
                text: "Moderate to slightly rough with waves 6–8 feet in E'ly swells",
                wave_max: { value: 8, unit: "ft", context: "open_waters" },
              },
              visibility: { text: "Haze at times." },
              temperature: { max_c: 30.5, min_c: 25.0 },
              tides: { events: [] },
              sun_moon: { sunrise_local: "06:25", sunset_local: "18:15" },
            },
          },
          day_3: {
            label: "Day 3",
            date_local: "2026-02-25",
            elements: {
              weather: {
                text: "Generally fair and windy; partly cloudy overnight with a few brief isolated showers.",
              },
              wind: {
                direction_text: "E'ly to ESE'ly",
                speed_range: { min: 15, max: 25, unit: "mph" },
              },
              seas: {
                text: "Moderate to slightly rough with waves 6–8 feet in E'ly swells",
                wave_max: { value: 8, unit: "ft", context: "open_waters" },
              },
              visibility: { text: "Occasional haze." },
              temperature: { max_c: 30.5, min_c: 25.0 },
              tides: { events: [] },
              sun_moon: { sunrise_local: "06:24", sunset_local: "18:16" },
            },
          },
        },
      },
    },

    {
      product_metadata: {
        product_id: "GMS-TWO-2023-07-15T08:00-04:00",
        product_type: "tropical_weather_outlook",
        issue_datetime_local: "2023-07-15T08:00:00-04:00",
        issue_datetime_utc: "2023-07-15T12:00:00Z",
        validity: {
          valid_from_local: "2023-07-15T08:00:00-04:00",
          valid_to_local: "2023-07-16T08:00:00-04:00",
          valid_duration_hours: 24,
          validity_text: "Tropical Weather Outlook (next update time included)",
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
        geography: {
          area_name:
            "Eastern Caribbean / Lesser Antilles outlook area (with Grenada focus)",
        },
        product_channel: ["website", "social_media", "email", "api"],
        forecaster: { name: "Duty Forecaster", role: "Forecaster" },
      },
      links: {
        ibf_assessment_id: null,
        cap_bundle_id: null,
      },
      payload: {
        outlook_type: "tropical_weather_outlook",
        area_of_special_interest: {
          description:
            "Area of interest described in outlook narrative (polygon optional in future).",
          geojson: null,
        },
        sources: [
          {
            source_name: "National Hurricane Center",
            source_type: "official",
            attribution_required: true,
            notes: "Courtesy attribution retained where applicable.",
          },
        ],
        systems: [
          {
            system_id: "TWO-SYS-01",
            system_type: "tropical_disturbance",
            source_system_id: "NHC-ATL-DISTURBANCE-PLACEHOLDER",
            title: "Disturbance / elongated trough",
            current_position_text:
              "Several hundred miles E-SE of the Lesser Antilles (per outlook narrative).",
            motion: {
              direction_text: "WNW",
              speed: { min: 10, max: 15, unit: "mph" },
            },
            development_probability: {
              horizon_hours: 48,
              probability_percent: 10,
              classification: "low",
            },
            expected_weather_text:
              "Regardless of development, showery activity and thunderstorms may affect Grenada over the weekend.",
            hazards_text: [
              "Flash flooding possible",
              "Landslides possible",
              "Gusty winds possible in thunderstorms",
            ],
            ibf_assessment_id: "IBF-2023-07-15-TWO-SYS-01",
          },
        ],
        next_update_time_local: "2023-07-15T14:00:00-04:00",
        public_message_plain_language:
          "A low-probability disturbance could increase showers and thunderstorms. Monitor updates; localized flooding and landslides are possible in vulnerable areas.",
      },
    },
  ],
};
