/**
 * Example IBF assessments for GMS products.
 * Import from @/data/gms-ibf-assessment.example.
 */

import type { IBFAssessment } from "@/db/schema/ibf";

/** IBF assessment for the morning forecast — no significant hazard. */
export const gmsIbfMorningExample: IBFAssessment = {
  ibf_assessment_id: "IBF-2026-02-23-MORNING",
  applies_to: {
    type: "product",
    product_id: "GMS-MORNING-2026-02-23T05:00-04:00",
  },
  hazards: [
    {
      hazard_type: "Heavy Shower",
      qualifiers: ["isolated", "brief"],
    },
  ],
  likelihood: {
    level: "Low",
    rationale:
      "Trade-wind regime dominant. Moisture profiles indicate only isolated convective development possible during afternoon heating.",
  },
  impact: {
    severity: "Minor",
    summary:
      "Isolated brief showers may cause minor surface water accumulation in low-lying areas. No significant disruption expected.",
    sector_impacts: [
      {
        sector: "general_public",
        severity: "Minor",
        details: "Brief showers possible; no significant disruption expected.",
      },
      {
        sector: "agriculture",
        severity: "None",
        details: "Light shower activity beneficial for dry ground conditions.",
      },
      {
        sector: "transport",
        severity: "Minor",
        details: "Reduced visibility possible briefly during showers on roads.",
      },
    ],
  },
  response: {
    level: "Monitor",
    recommended_actions: [
      "Monitor updated forecasts throughout the day.",
      "Small craft operators should consult the Marine Bulletin before departure.",
    ],
  },
  confidence: {
    level: "High",
    notes:
      "Synoptic pattern well-established; model agreement good for trade-wind regime.",
  },
  timing: {
    onset_local: "2026-02-23T06:00:00-04:00",
    end_local: "2026-02-23T18:00:00-04:00",
  },
};

/** IBF assessment for the marine bulletin — elevated sea state advisory. */
export const gmsIbfMarineExample: IBFAssessment = {
  ibf_assessment_id: "IBF-2026-02-23-MARINE",
  applies_to: {
    type: "product",
    product_id: "GMS-MARINE-2026-02-23T05:00-04:00",
  },
  hazards: [
    {
      hazard_type: "Rough Seas",
      qualifiers: ["NE swell", "open waters"],
    },
    {
      hazard_type: "Strong Winds",
      qualifiers: ["ENE-ESE", "trades"],
    },
  ],
  likelihood: {
    level: "High",
    rationale:
      "Active Atlantic high driving sustained ENE trades 14–24 kt with northeasterly swell up to 8 ft in open waters. Conditions confirmed on 06Z synoptic analysis.",
  },
  impact: {
    severity: "Moderate",
    summary:
      "Rough seas and strong trade winds present hazardous conditions for small craft. Reduced freeboard vessels at high risk in open waters and during high tide.",
    sector_impacts: [
      {
        sector: "marine",
        severity: "Moderate",
        details:
          "Waves up to 8 ft in open waters with 14–24 kt winds. Small and vulnerable craft advised to remain in harbour or proceed with extreme caution.",
      },
      {
        sector: "tourism",
        severity: "Minor",
        details:
          "Water sports and beach activities may be disrupted by surf and haze.",
      },
      {
        sector: "transport",
        severity: "Moderate",
        details:
          "Inter-island ferry and water taxi operators should monitor conditions closely and consider schedule adjustments.",
      },
    ],
  },
  response: {
    level: "Be Aware",
    recommended_actions: [
      "Small craft operators should exercise extreme caution in open waters.",
      "Vulnerable and low-freeboard vessels should remain in harbour.",
      "Be aware of current tide levels; sea conditions will be worse at high tide.",
      "Monitor updated Marine Bulletins every 6 hours.",
    ],
  },
  confidence: {
    level: "High",
    notes:
      "Sea state confirmed by multiple model runs and 06Z buoy data. Swell period and height consistent across ECMWF and GFS.",
  },
  timing: {
    onset_local: "2026-02-23T05:00:00-04:00",
    end_local: "2026-02-24T05:00:00-04:00",
  },
};

/** IBF assessment for the midday weather report. */
export const gmsIbfMiddayExample: IBFAssessment = {
  ibf_assessment_id: "IBF-2026-02-23-MIDDAY",
  applies_to: {
    type: "product",
    product_id: "GMS-MIDDAY-2026-02-23T12:00-04:00",
  },
  hazards: [
    {
      hazard_type: "Evening Shower",
      qualifiers: ["light", "isolated"],
    },
  ],
  likelihood: {
    level: "Low",
    rationale:
      "Increasing cloudiness noted on 12Z satellite. Weak convergence possible along windward slopes by evening but moisture insufficient for heavy rainfall.",
  },
  impact: {
    severity: "Minor",
    summary:
      "Light isolated showers possible by evening. No significant impacts anticipated.",
    sector_impacts: [
      {
        sector: "general_public",
        severity: "Minor",
        details: "Light evening showers; carry an umbrella if venturing out.",
      },
      {
        sector: "transport",
        severity: "None",
        details:
          "Light shower activity unlikely to affect road conditions significantly.",
      },
    ],
  },
  response: {
    level: "Monitor",
    recommended_actions: ["Monitor updated evening forecast for any changes."],
  },
  confidence: {
    level: "Medium",
    notes:
      "Cloudiness trend evident but convective initiation uncertain. Low-to-medium confidence on evening shower timing.",
  },
  timing: {
    onset_local: "2026-02-23T16:00:00-04:00",
    end_local: "2026-02-24T06:00:00-04:00",
  },
};

/** IBF assessment for the evening forecast. */
export const gmsIbfEveningExample: IBFAssessment = {
  ibf_assessment_id: "IBF-2026-02-22-EVENING",
  applies_to: {
    type: "product",
    product_id: "GMS-EVENING-2026-02-22T18:00-04:00",
  },
  hazards: [
    {
      hazard_type: "Isolated Shower",
      qualifiers: ["brief", "overnight"],
    },
  ],
  likelihood: {
    level: "Low",
    rationale:
      "Synoptic pattern stable. Brief overnight showers possible along windward slopes of Grenada. Three-day outlook shows continued trade-wind regime with gradual decrease in swell.",
  },
  impact: {
    severity: "None",
    summary:
      "No significant weather impacts expected over the three-day outlook period.",
    sector_impacts: [
      {
        sector: "general_public",
        severity: "None",
        details: "No significant impacts over the three-day forecast period.",
      },
    ],
  },
  response: {
    level: "Monitor",
    recommended_actions: [
      "Continue to monitor the daily morning forecast for updates.",
    ],
  },
  confidence: {
    level: "High",
    notes:
      "Strong model consensus on synoptic pattern. Three-day outlook carries medium-to-high confidence.",
  },
  timing: {
    onset_local: "2026-02-22T18:00:00-04:00",
    end_local: "2026-02-25T18:00:00-04:00",
  },
};

/** IBF assessment linked to a tropical disturbance in the TWO. */
export const gmsIbfTropicalExample: IBFAssessment = {
  ibf_assessment_id: "IBF-2023-07-15-TWO-SYS-01",
  applies_to: {
    type: "tropical_system",
    product_id: "GMS-TWO-2023-07-15T08:00-04:00",
    system_id: "TWO-SYS-01",
  },
  hazards: [
    {
      hazard_type: "Heavy Shower",
      qualifiers: ["convective", "possibly prolonged"],
    },
    {
      hazard_type: "Flash Flood",
      qualifiers: ["low-lying areas", "river valleys"],
    },
    {
      hazard_type: "Landslide",
      qualifiers: ["saturated soils", "steep terrain"],
    },
    {
      hazard_type: "Gusty Wind",
      qualifiers: ["in thunderstorms"],
    },
  ],
  likelihood: {
    level: "Medium",
    rationale:
      "NHC places 10% development probability on this disturbance at 48 h. Regardless of development, the associated shower and thunderstorm activity is likely to affect Grenada over the weekend.",
  },
  impact: {
    severity: "Moderate",
    summary:
      "Increased shower and thunderstorm activity over the weekend. Flash flooding in low-lying and river valley areas possible. Landslides possible on steep terrain especially where soils are already saturated.",
    sector_impacts: [
      {
        sector: "general_public",
        severity: "Moderate",
        details:
          "Flash flooding possible in low-lying areas. Landslides possible on steep terrain. Gusty winds in thunderstorms.",
      },
      {
        sector: "agriculture",
        severity: "Moderate",
        details:
          "Heavy rainfall could damage crops and erode topsoil on exposed slopes.",
      },
      {
        sector: "transport",
        severity: "Moderate",
        details:
          "Road flooding and landslides possible, particularly in interior and windward areas.",
      },
      {
        sector: "marine",
        severity: "Minor",
        details:
          "Rough seas and gusty winds near thunderstorms. Small craft operators should monitor conditions.",
      },
      {
        sector: "health",
        severity: "Minor",
        details:
          "Potential for water-borne illness if drainage systems become overwhelmed.",
      },
    ],
  },
  response: {
    level: "Be Prepared",
    recommended_actions: [
      "Monitor NHC Tropical Weather Outlook and GMS updates closely.",
      "Clear drains and gutters before weekend.",
      "Avoid crossing flooded rivers and roads.",
      "Residents in flood-prone or landslide-prone areas should have evacuation plans ready.",
      "Small craft operators should avoid open water during thunderstorm activity.",
    ],
  },
  confidence: {
    level: "Medium",
    notes:
      "Development probability low (10% at 48h) but shower activity is expected regardless. Confidence on timing and extent is medium given early-stage disturbance.",
  },
  timing: {
    onset_local: "2023-07-15T18:00:00-04:00",
    end_local: "2023-07-17T18:00:00-04:00",
  },
};
