/**
 * Example METAR and SPECI reports for TGPY (Maurice Bishop International Airport, Grenada).
 * Encoded as flattened IWXXM JSON per the GMS schema.
 * Import from @/data/gms-metar-speci.example.
 */

import type { METARReport, SPECIReport } from "@/db/schema/metarSpeci";

/**
 * Routine METAR — fair-weather trade-wind observation.
 * TAC equivalent: METAR TGPY 231200Z 08008G16KT 9000 -RA SCT020 BKN050CB 27/23 Q1013 BECMG TL1400 CAVOK=
 */
export const gmsMETARExample: METARReport = {
  type: "METAR",
  issueTime: "2026-02-23T12:00:00Z",
  observationTime: "2026-02-23T12:00:00Z",
  aerodrome: {
    designator: "TGPY",
    name: "Maurice Bishop International Airport",
    position: { lat: 12.0042, lon: -61.7862, elevM: 13 },
  },
  automatedStation: false,
  observation: {
    cloudAndVisibilityOK: false,
    airTemperature: { value: 27.1, uom: "Cel" },
    dewpointTemperature: { value: 23.4, uom: "Cel" },
    qnh: { value: 1013.2, uom: "hPa" },
    surfaceWind: {
      meanWindDirection: { value: 80, uom: "deg" },
      meanWindSpeed: { value: 8, uom: "[kn_i]" },
      windGustSpeed: { value: 16, uom: "[kn_i]" },
      variableWindDirection: false,
    },
    visibility: {
      prevailingVisibility: { value: 9000, uom: "m" },
    },
    presentWeather: [
      {
        href: "http://codes.wmo.int/49-2/AerodromePresentOrForecastWeather/-RA",
        title: "Light Rain",
      },
    ],
    cloud: {
      layer: [
        {
          amount: "SCT",
          baseHeight: { value: 600, uom: "m" },
        },
        {
          amount: "BKN",
          baseHeight: { value: 1500, uom: "m" },
          cloudType: "CB",
        },
      ],
    },
  },
  trendForecast: [
    {
      changeIndicator: "BECOMING",
      phenomenonTime: {
        kind: "period",
        from: "2026-02-23T12:00:00Z",
        until: "2026-02-23T14:00:00Z",
      },
      timeIndicator: "FROM_UNTIL",
      prevailingVisibility: { value: 10_000, uom: "m" },
      prevailingVisibilityOperator: "above",
      cloudAndVisibilityOK: true,
    },
  ],
  raw: {
    tac: "METAR TGPY 231200Z 08008G16KT 9000 -RA SCT020 BKN050CB 27/23 Q1013 BECMG TL1400 CAVOK=",
    source: "GMS-TGPY-AUTO",
  },
};

/**
 * METAR — CAVOK with NOSIG trend.
 * TAC equivalent: METAR TGPY 230600Z 07010KT CAVOK 26/22 Q1014 NOSIG=
 */
export const gmsMETARCavokExample: METARReport = {
  type: "METAR",
  issueTime: "2026-02-23T06:00:00Z",
  observationTime: "2026-02-23T06:00:00Z",
  aerodrome: {
    designator: "TGPY",
    name: "Maurice Bishop International Airport",
    position: { lat: 12.0042, lon: -61.7862, elevM: 13 },
  },
  automatedStation: false,
  observation: {
    cloudAndVisibilityOK: true,
    airTemperature: { value: 26.0, uom: "Cel" },
    dewpointTemperature: { value: 22.1, uom: "Cel" },
    qnh: { value: 1014.0, uom: "hPa" },
    surfaceWind: {
      meanWindDirection: { value: 70, uom: "deg" },
      meanWindSpeed: { value: 10, uom: "[kn_i]" },
    },
    visibility: {
      prevailingVisibility: { value: 10_000, uom: "m" },
      prevailingVisibilityOperator: "above",
    },
    cloud: { layer: [] },
  },
  // NOSIG: nil trend forecast with noSignificantChange reason
  trendForecast: [{ nilReason: "noSignificantChange" }],
  raw: {
    tac: "METAR TGPY 230600Z 07010KT CAVOK 26/22 Q1014 NOSIG=",
    source: "GMS-TGPY-AUTO",
  },
};

/**
 * SPECI — significant observation change; CB development with thunderstorm.
 * TAC equivalent: SPECI TGPY 231525Z 12015G28KT 4000 TSRA FEW010 SCT025CB BKN060 28/24 Q1010=
 */
export const gmsSPECIThunderstormExample: SPECIReport = {
  type: "SPECI",
  issueTime: "2026-02-23T15:25:00Z",
  observationTime: "2026-02-23T15:20:00Z",
  aerodrome: {
    designator: "TGPY",
    name: "Maurice Bishop International Airport",
    position: { lat: 12.0042, lon: -61.7862, elevM: 13 },
  },
  automatedStation: false,
  observation: {
    cloudAndVisibilityOK: false,
    airTemperature: { value: 28.0, uom: "Cel" },
    dewpointTemperature: { value: 24.0, uom: "Cel" },
    qnh: { value: 1010.0, uom: "hPa" },
    surfaceWind: {
      meanWindDirection: { value: 120, uom: "deg" },
      meanWindSpeed: { value: 15, uom: "[kn_i]" },
      windGustSpeed: { value: 28, uom: "[kn_i]" },
    },
    visibility: {
      prevailingVisibility: { value: 4000, uom: "m" },
    },
    presentWeather: [
      {
        href: "http://codes.wmo.int/49-2/AerodromePresentOrForecastWeather/TSRA",
        title: "Thunderstorm with Rain",
      },
    ],
    recentWeather: [
      {
        href: "http://codes.wmo.int/49-2/AerodromePresentOrForecastWeather/TS",
        title: "Thunderstorm",
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
  raw: {
    tac: "SPECI TGPY 231525Z 12015G28KT 4000 TSRA FEW010 SCT025CB BKN060 28/24 Q1010=",
    source: "GMS-TGPY-AUTO",
  },
};

/**
 * SPECI — wind shear reported.
 * TAC equivalent: SPECI TGPY 231045Z 06012G22KT 9999 SCT020 27/23 Q1012 WS R10=
 */
export const gmsSPECIWindShearExample: SPECIReport = {
  type: "SPECI",
  issueTime: "2026-02-23T10:45:00Z",
  observationTime: "2026-02-23T10:45:00Z",
  aerodrome: {
    designator: "TGPY",
    name: "Maurice Bishop International Airport",
    position: { lat: 12.0042, lon: -61.7862, elevM: 13 },
  },
  automatedStation: false,
  observation: {
    cloudAndVisibilityOK: false,
    airTemperature: { value: 27.0, uom: "Cel" },
    dewpointTemperature: { value: 23.0, uom: "Cel" },
    qnh: { value: 1012.0, uom: "hPa" },
    surfaceWind: {
      meanWindDirection: { value: 60, uom: "deg" },
      meanWindSpeed: { value: 12, uom: "[kn_i]" },
      windGustSpeed: { value: 22, uom: "[kn_i]" },
    },
    visibility: {
      prevailingVisibility: { value: 10_000, uom: "m" },
      prevailingVisibilityOperator: "above",
    },
    cloud: {
      layer: [{ amount: "SCT", baseHeight: { value: 600, uom: "m" } }],
    },
    windShear: {
      runway: [
        {
          href: "urn:icao:aerodrome:TGPY:runway:10",
          title: "Runway 10",
        },
      ],
    },
  },
  raw: {
    tac: "SPECI TGPY 231045Z 06012G22KT 9999 SCT020 27/23 Q1012 WS R10=",
    source: "GMS-TGPY-AUTO",
  },
};
