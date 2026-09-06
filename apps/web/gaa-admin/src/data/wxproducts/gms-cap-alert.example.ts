/**
 * Example CAP v1.2 alerts and bundle for GMS.
 * Import from @/data/wxproducts/gms-cap-alert.example.
 */

import type { CAPAlert, CAPBundle } from "@/db/wxproducts/schema/cap";

/**
 * CAP alert for the marine bulletin — small craft advisory.
 * Scope: Public; no IBF prerequisite in the message itself (linked via bundle).
 */
export const gmsCapMarineAdvisoryExample: CAPAlert = {
  identifier: "GMS-CAP-2026-02-23-MARINE-ADV-001",
  sender: "meteorology@gaa.gd",
  sent: "2026-02-23T09:00:00-00:00",
  status: "Actual",
  msgType: "Alert",
  source: "Grenada Meteorological Service — Duty Forecaster",
  scope: "Public",
  note: "Issued as part of the GMS Daily Product Suite GMS-DAILY-SUITE-2026-02-23.",
  info: [
    {
      language: "en-US",
      category: ["Met", "Transport"],
      event: "Small Craft Advisory",
      responseType: ["Monitor"],
      urgency: "Expected",
      severity: "Moderate",
      certainty: "Likely",
      audience: "Mariners, small craft operators, coastal communities",
      senderName: "Grenada Meteorological Service",
      headline:
        "Small Craft Advisory in effect for State of Grenada coastal waters",
      description:
        "The central Atlantic high-pressure system will be the dominant feature bringing sustained ENE to ESE winds of 14 to 24 knots with seas moderate to slightly rough. Waves up to 8 feet expected in northeasterly swells in open waters. Visibility may be reduced at times by haze and dust.",
      instruction:
        "Small and vulnerable craft are advised to remain in harbour or proceed with extreme caution. All mariners should be aware of tidal conditions — sea state will be worse at high tide.",
      effective: "2026-02-23T09:00:00-00:00",
      onset: "2026-02-23T09:00:00-00:00",
      expires: "2026-02-24T09:00:00-00:00",
      web: "https://www.weather.gaa.gd",
      contact: "Grenada Meteorological Service: +1-473-444-4142",
      eventCode: [
        {
          valueName: "GMS_PRODUCT_ID",
          value: "GMS-MARINE-2026-02-23T05:00-04:00",
        },
      ],
      parameter: [
        { valueName: "WIND_SPEED_KT_MIN", value: "14" },
        { valueName: "WIND_SPEED_KT_MAX", value: "24" },
        { valueName: "WAVE_HEIGHT_FT_MAX", value: "8" },
        { valueName: "COLOR_CODE", value: "YELLOW" },
      ],
      area: [
        {
          areaDesc: "State of Grenada — Coastal Waters",
          geocode: [
            { valueName: "ISO3166-1", value: "GRD" },
            { valueName: "GMS_ZONE", value: "coastal_waters" },
          ],
          circle: ["12.1162,-61.6789 50"],
        },
      ],
    },
  ],
};

/**
 * CAP alert updating a previous marine advisory — intensity upgrade.
 * Demonstrates Update msgType and references.
 */
export const gmsCapMarineAdvisoryUpdateExample: CAPAlert = {
  identifier: "GMS-CAP-2026-02-23-MARINE-ADV-002",
  sender: "meteorology@gaa.gd",
  sent: "2026-02-23T15:00:00-00:00",
  status: "Actual",
  msgType: "Update",
  source: "Grenada Meteorological Service — Duty Forecaster",
  scope: "Public",
  references:
    "meteorology@gaa.gd,GMS-CAP-2026-02-23-MARINE-ADV-001,2026-02-23T09:00:00-00:00",
  note: "Updated to reflect upgraded sea state observed on 15Z analysis.",
  info: [
    {
      language: "en-US",
      category: ["Met", "Transport"],
      event: "Small Craft Advisory",
      responseType: ["Monitor", "Avoid"],
      urgency: "Immediate",
      severity: "Severe",
      certainty: "Observed",
      audience: "Mariners, small craft operators, coastal communities",
      senderName: "Grenada Meteorological Service",
      headline:
        "UPDATED: Small Craft Advisory upgraded — seas rougher than forecast",
      description:
        "Conditions have deteriorated beyond the morning forecast. Waves observed at 9–10 feet in open waters with gusty ENE winds to 28 kt. All small craft operations are strongly discouraged.",
      instruction:
        "All small craft should return to harbour immediately. Mariners already at sea should seek the nearest safe harbour. Do not attempt to cross open waters.",
      effective: "2026-02-23T15:00:00-00:00",
      onset: "2026-02-23T15:00:00-00:00",
      expires: "2026-02-24T09:00:00-00:00",
      web: "https://www.weather.gaa.gd",
      contact: "Grenada Meteorological Service: +1-473-444-4142",
      parameter: [
        { valueName: "WIND_SPEED_KT_MAX", value: "28" },
        { valueName: "WAVE_HEIGHT_FT_MAX", value: "10" },
        { valueName: "COLOR_CODE", value: "ORANGE" },
      ],
      area: [
        {
          areaDesc: "State of Grenada — Coastal Waters",
          geocode: [
            { valueName: "ISO3166-1", value: "GRD" },
            { valueName: "GMS_ZONE", value: "coastal_waters" },
          ],
          circle: ["12.1162,-61.6789 50"],
        },
      ],
    },
  ],
};

/**
 * CAP cancellation message — cancels the original advisory once conditions improve.
 */
export const gmsCapMarineAdvisoryCancelExample: CAPAlert = {
  identifier: "GMS-CAP-2026-02-24-MARINE-CANCEL-001",
  sender: "meteorology@gaa.gd",
  sent: "2026-02-24T09:00:00-00:00",
  status: "Actual",
  msgType: "Cancel",
  scope: "Public",
  references: [
    "meteorology@gaa.gd,GMS-CAP-2026-02-23-MARINE-ADV-001,2026-02-23T09:00:00-00:00",
    "meteorology@gaa.gd,GMS-CAP-2026-02-23-MARINE-ADV-002,2026-02-23T15:00:00-00:00",
  ].join(" "),
  note: "Small Craft Advisory cancelled. Seas have improved to within normal limits.",
  info: [
    {
      language: "en-US",
      category: ["Met"],
      event: "Small Craft Advisory",
      urgency: "Past",
      severity: "Minor",
      certainty: "Observed",
      senderName: "Grenada Meteorological Service",
      headline: "Small Craft Advisory has been cancelled",
      description:
        "Seas and winds have subsided to within acceptable limits. The Small Craft Advisory is hereby cancelled effective 0500 LT 24 February 2026.",
      instruction:
        "Normal marine operations may resume with usual precautions.",
      effective: "2026-02-24T09:00:00-00:00",
      expires: "2026-02-24T12:00:00-00:00",
      web: "https://www.weather.gaa.gd",
      area: [
        {
          areaDesc: "State of Grenada — Coastal Waters",
          geocode: [{ valueName: "ISO3166-1", value: "GRD" }],
        },
      ],
    },
  ],
};

/**
 * CAP alert for the tropical disturbance outlook.
 * Demonstrates category CBRNE-adjacent and multi-sector impact.
 */
export const gmsCapTropicalDisturbanceExample: CAPAlert = {
  identifier: "GMS-CAP-2023-07-15-TWO-ADV-001",
  sender: "meteorology@gaa.gd",
  sent: "2023-07-15T12:00:00-00:00",
  status: "Actual",
  msgType: "Alert",
  source: "Grenada Meteorological Service — Duty Forecaster",
  scope: "Public",
  info: [
    {
      language: "en-US",
      category: ["Met"],
      event: "Tropical Weather Outlook — Disturbance",
      responseType: ["Prepare", "Monitor"],
      urgency: "Future",
      severity: "Moderate",
      certainty: "Possible",
      audience: "General public, mariners, farmers, emergency managers",
      senderName: "Grenada Meteorological Service",
      headline:
        "Flash flooding and landslides possible this weekend — Tropical disturbance approaching",
      description:
        "A tropical disturbance is located several hundred miles east-southeast of the Lesser Antilles and is moving WNW at 10–15 mph. The National Hurricane Center places a 10% probability of tropical cyclone development at 48 hours. Regardless of development, showery activity and thunderstorms associated with this system may affect Grenada over the weekend. Flash flooding and landslides are possible in vulnerable areas.",
      instruction:
        "Residents should: clear drains and gutters before the weekend; avoid crossing flooded rivers or roads; ensure emergency supplies are stocked; follow updates from the Grenada Meteorological Service and National Disaster Management Agency (NaDMA). Small craft operators should avoid open water near thunderstorm activity.",
      effective: "2023-07-15T12:00:00-00:00",
      onset: "2023-07-15T18:00:00-00:00",
      expires: "2023-07-17T18:00:00-00:00",
      web: "https://www.weather.gaa.gd",
      contact: "GMS: +1-473-444-4142 | NaDMA: +1-473-440-0838",
      eventCode: [
        {
          valueName: "NHC_DISTURBANCE_ID",
          value: "NHC-ATL-DISTURBANCE-PLACEHOLDER",
        },
        { valueName: "GMS_SYSTEM_ID", value: "TWO-SYS-01" },
        {
          valueName: "GMS_PRODUCT_ID",
          value: "GMS-TWO-2023-07-15T08:00-04:00",
        },
      ],
      parameter: [
        { valueName: "NHC_DEVELOPMENT_PROB_48H_PCT", value: "10" },
        { valueName: "SYSTEM_TYPE", value: "tropical_disturbance" },
        { valueName: "COLOR_CODE", value: "YELLOW" },
      ],
      area: [
        {
          areaDesc: "State of Grenada — all parishes",
          geocode: [
            { valueName: "ISO3166-1", value: "GRD" },
            { valueName: "GMS_ZONE", value: "national" },
          ],
          circle: ["12.1162,-61.6789 35"],
        },
      ],
    },
  ],
};

/**
 * CAP bundle grouping the marine alerts for 2026-02-23.
 */
export const gmsCapBundleMarineExample: CAPBundle = {
  cap_bundle_id: "CAPB-2026-02-23-MARINE-ADV-01",
  linked_product_ids: ["GMS-MARINE-2026-02-23T05:00-04:00"],
  linked_ibf_assessment_ids: ["IBF-2026-02-23-MARINE"],
  cap_alerts: [gmsCapMarineAdvisoryExample],
};

/**
 * CAP bundle for the tropical disturbance TWO.
 */
export const gmsCapBundleTropicalExample: CAPBundle = {
  cap_bundle_id: "CAPB-2023-07-15-TWO-ADV-01",
  linked_product_ids: ["GMS-TWO-2023-07-15T08:00-04:00"],
  linked_ibf_assessment_ids: ["IBF-2023-07-15-TWO-SYS-01"],
  cap_alerts: [gmsCapTropicalDisturbanceExample],
};
