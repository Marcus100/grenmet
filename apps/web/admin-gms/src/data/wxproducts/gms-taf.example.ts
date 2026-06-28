/**
 * Example TAF reports for TGPY (Maurice Bishop International Airport, Grenada).
 * Encoded as flattened IWXXM JSON per the GMS schema.
 * Import from @/data/wxproducts/gms-taf.example.
 */

import type { TAFReport } from "@/db/wxproducts/schema/taf";

/**
 * Routine 24-hour TAF — trade-wind conditions with afternoon CB activity.
 * TAC equivalent:
 *   TAF TGPY 231200Z 2312/2412 07010KT 9999 SCT020 TX30/2320Z TN23/2410Z
 *       TEMPO 2314/2318 4000 TSRA FEW010 SCT025CB BKN060
 *       FM232000Z 07008KT CAVOK
 *       PROB30 TEMPO 2322/2402 5000 -SHRA SCT015=
 */
export const gmsTAFExample: TAFReport = {
  type: "TAF",
  issueTime: "2026-02-23T12:00:00Z",
  aerodrome: {
    designator: "TGPY",
    name: "Maurice Bishop International Airport",
    position: { lat: 12.0042, lon: -61.7862, elevM: 13 },
  },
  validPeriod: {
    from: "2026-02-23T12:00:00Z",
    until: "2026-02-24T12:00:00Z",
  },
  baseForecast: {
    phenomenonTime: {
      from: "2026-02-23T12:00:00Z",
      until: "2026-02-24T12:00:00Z",
    },
    cloudAndVisibilityOK: false,
    prevailingVisibility: { value: 9999, uom: "m" },
    prevailingVisibilityOperator: "above",
    surfaceWind: {
      meanWindDirection: { value: 70, uom: "deg" },
      meanWindSpeed: { value: 10, uom: "[kn_i]" },
    },
    cloud: {
      layer: [{ amount: "SCT", baseHeight: { value: 600, uom: "m" } }],
    },
    temperature: [
      {
        maximumAirTemperature: { value: 30, uom: "Cel" },
        maximumAirTemperatureTime: "2026-02-23T20:00:00Z",
        minimumAirTemperature: { value: 23, uom: "Cel" },
        minimumAirTemperatureTime: "2026-02-24T10:00:00Z",
      },
    ],
  },
  changeForecast: [
    {
      // TEMPO 2314/2318 — afternoon CB activity
      changeIndicator: "TEMPORARY_FLUCTUATIONS",
      phenomenonTime: {
        from: "2026-02-23T14:00:00Z",
        until: "2026-02-23T18:00:00Z",
      },
      cloudAndVisibilityOK: false,
      prevailingVisibility: { value: 4000, uom: "m" },
      weather: [
        {
          href: "http://codes.wmo.int/49-2/AerodromePresentOrForecastWeather/TSRA",
          title: "Thunderstorm with Rain",
        },
      ],
      cloud: {
        layer: [
          { amount: "FEW", baseHeight: { value: 300, uom: "m" } },
          {
            amount: "SCT",
            baseHeight: { value: 750, uom: "m" },
            cloudType: "CB",
          },
          { amount: "BKN", baseHeight: { value: 1800, uom: "m" } },
        ],
      },
    },
    {
      // FM232000Z — conditions improve in the evening
      changeIndicator: "FROM",
      phenomenonTime: {
        from: "2026-02-23T20:00:00Z",
        until: "2026-02-24T12:00:00Z",
      },
      cloudAndVisibilityOK: true,
      surfaceWind: {
        meanWindDirection: { value: 70, uom: "deg" },
        meanWindSpeed: { value: 8, uom: "[kn_i]" },
      },
    },
    {
      // PROB30 TEMPO 2322/2402 — overnight shower risk
      changeIndicator: "PROBABILITY_30_TEMPORARY_FLUCTUATIONS",
      phenomenonTime: {
        from: "2026-02-23T22:00:00Z",
        until: "2026-02-24T02:00:00Z",
      },
      cloudAndVisibilityOK: false,
      prevailingVisibility: { value: 5000, uom: "m" },
      weather: [
        {
          href: "http://codes.wmo.int/49-2/AerodromePresentOrForecastWeather/-SHRA",
          title: "Light Showers of Rain",
        },
      ],
      cloud: {
        layer: [{ amount: "SCT", baseHeight: { value: 450, uom: "m" } }],
      },
    },
  ],
  raw: {
    tac: "TAF TGPY 231200Z 2312/2412 07010KT 9999 SCT020 TX30/2320Z TN23/2410Z TEMPO 2314/2318 4000 TSRA FEW010 SCT025CB BKN060 FM232000Z 07008KT CAVOK PROB30 TEMPO 2322/2402 5000 -SHRA SCT015=",
    source: "GMS-OPS",
  },
};

/**
 * Short TAF (9-hour) — CAVOK throughout; no change groups.
 * Issued at 06Z for morning operations.
 * TAC equivalent: TAF TGPY 230600Z 2306/2315 06008KT CAVOK TX28/2314Z TN22/2306Z NOSIG=
 */
export const gmsTAFCavokExample: TAFReport = {
  type: "TAF",
  issueTime: "2026-02-23T06:00:00Z",
  aerodrome: {
    designator: "TGPY",
    name: "Maurice Bishop International Airport",
    position: { lat: 12.0042, lon: -61.7862, elevM: 13 },
  },
  validPeriod: {
    from: "2026-02-23T06:00:00Z",
    until: "2026-02-23T15:00:00Z",
  },
  baseForecast: {
    phenomenonTime: {
      from: "2026-02-23T06:00:00Z",
      until: "2026-02-23T15:00:00Z",
    },
    cloudAndVisibilityOK: true,
    surfaceWind: {
      meanWindDirection: { value: 60, uom: "deg" },
      meanWindSpeed: { value: 8, uom: "[kn_i]" },
    },
    temperature: [
      {
        maximumAirTemperature: { value: 28, uom: "Cel" },
        maximumAirTemperatureTime: "2026-02-23T14:00:00Z",
        minimumAirTemperature: { value: 22, uom: "Cel" },
        minimumAirTemperatureTime: "2026-02-23T06:00:00Z",
      },
    ],
  },
  raw: {
    tac: "TAF TGPY 230600Z 2306/2315 06008KT CAVOK TX28/2314Z TN22/2306Z NOSIG=",
    source: "GMS-OPS",
  },
};

/**
 * Cancellation TAF — cancels a previously-issued routine TAF.
 */
export const gmsTAFCancelExample: TAFReport = {
  type: "TAF",
  issueTime: "2026-02-23T09:30:00Z",
  isCancelReport: true,
  aerodrome: {
    designator: "TGPY",
    name: "Maurice Bishop International Airport",
    position: { lat: 12.0042, lon: -61.7862, elevM: 13 },
  },
  cancelledReportValidPeriod: {
    from: "2026-02-23T06:00:00Z",
    until: "2026-02-23T15:00:00Z",
  },
  raw: {
    tac: "TAF AMD TGPY 230930Z CNL TAF 2306/2315=",
    source: "GMS-OPS",
  },
};
