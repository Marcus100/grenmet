/**
 * Example SYNOP surface observations for Grenada (WMO station 78954 — TGPY).
 * Encoded using the GMS canonical SynopObservation model (BUFR TM 307080).
 * Import from @/data/gms-synop.example.
 */

import type { SynopObservation } from "@/db/schema/synop";

/**
 * Full SYNOP at 1200 UTC — fair weather trade-wind observation.
 * Corresponds to FM-12 synoptic code: 12954 84/54 10271 20234 38009 40130 52008 ...
 */
export const gmsSynopFullExample: SynopObservation = {
  station: {
    wmoBlock: 78,
    wmoStation: 954,
    stationName: "TGPY / Maurice Bishop International Airport",
    stationType: 0, // 0 = automatic
  },
  observedAtUtc: "2026-02-23T12:00:00Z",

  // ── Coordinates ───────────────────────────────────────────────────────────
  latitudeDeg: 12.0042,
  longitudeDeg: -61.7862,
  stationGroundMslM: 13,

  // ── Pressure ──────────────────────────────────────────────────────────────
  stationPressurePa: 101_280, // 1012.8 hPa
  mslPressurePa: 101_320, // 1013.2 hPa
  pressureTendencyChar: 0, // 0 = increasing steadily (code table 0-10-63)
  pressureChange3hPa: -0.2,
  pressureChange24hPa: 0.8,

  // ── Temperature & humidity ────────────────────────────────────────────────
  airTemperatureK: 300.25, // 27.1 °C
  dewpointTemperatureK: 296.55, // 23.4 °C
  relativeHumidityPct: 79,
  sensorHeightTM: 1.5,

  // ── Wind ──────────────────────────────────────────────────────────────────
  windDirDegTrue: 80,
  windSpeedMps: 4.1, // ≈ 8 kt
  sensorHeightWindM: 10,
  windInstrumentType: 0, // 0 = cup anemometer
  windGusts: [
    { speedMps: 8.2, periodMinutes: -10, directionDegTrue: null }, // max gust in last 10 min
  ],

  // ── Visibility ────────────────────────────────────────────────────────────
  horizontalVisibilityM: 9000,

  // ── Present / past weather ────────────────────────────────────────────────
  presentWeather: 61, // 61 = light rain (WMO code table 0-20-3)
  pastWeather1: 10, // 10 = mist (WMO code table 0-20-4)
  pastWeather2: 60, // 60 = rain (not further specified)
  pastWeatherPeriodHours: -6,

  // ── Cloud ─────────────────────────────────────────────────────────────────
  cloudCoverTotalPct: 62, // ≈ 5 oktas
  cloudVerticalSignificance: 7, // 7 = low cloud (code table 0-8-2)
  cloudAmountLowMid: 3, // Nh = 3 oktas
  cloudBaseHeightM: 600,
  cloudTypeLow: 2, // CL = 2 (Cu of moderate/strong vertical extent)
  cloudTypeMid: 0, // CM = 0 (none)
  cloudTypeHigh: 0, // CH = 0 (none)
  cloudLayers: [
    {
      verticalSignificance: 1, // 1 = significant cloud (code table 0-8-2)
      cloudAmount: 3, // 3 oktas = SCT
      baseHeightM: 600,
      cloudType: null,
    },
    {
      verticalSignificance: 1,
      cloudAmount: 5, // 5 oktas ≈ BKN
      baseHeightM: 1500,
      cloudType: 9, // 9 = CB (WMO code table 0-20-12)
    },
  ],

  // ── Extreme temperatures ──────────────────────────────────────────────────
  maxTemperatureK: 303.65, // 30.5 °C
  maxTempPeriodHours1: -12,
  maxTempPeriodHours2: 0,
  minTemperatureK: 298.65, // 25.5 °C
  minTempPeriodHours1: -12,
  minTempPeriodHours2: 0,

  // ── Precipitation ─────────────────────────────────────────────────────────
  precip24hKgM2: 2.4, // 2.4 mm in last 24 h
  precipMeasurements: [
    { amountKgM2: 0.6, periodHours: -6 },
    { amountKgM2: 2.4, periodHours: -24 },
  ],

  // ── Sunshine ──────────────────────────────────────────────────────────────
  sunshine: [
    { durationMinutes: 48, periodHours: -1 },
    { durationMinutes: 390, periodHours: -24 },
  ],
};

/**
 * Minimal SYNOP — only mandatory fields populated.
 * Models a report where most sensors are missing or not applicable.
 */
export const gmsSynopMinimalExample: SynopObservation = {
  station: {
    wmoBlock: 78,
    wmoStation: 954,
    stationName: "TGPY",
    stationType: 0,
  },
  observedAtUtc: "2026-02-23T00:00:00Z",
  latitudeDeg: 12.0042,
  longitudeDeg: -61.7862,
  stationGroundMslM: 13,
  airTemperatureK: 298.95, // 25.8 °C
  dewpointTemperatureK: 295.05, // 21.9 °C
  mslPressurePa: 101_340,
  windDirDegTrue: 70,
  windSpeedMps: 3.6,
  horizontalVisibilityM: null, // not observed
  presentWeather: null,
  cloudCoverTotalPct: 25, // ≈ 2 oktas
  cloudBaseHeightM: null,
};

/**
 * SYNOP during a heavy shower event.
 * Demonstrates storm-related fields.
 */
export const gmsSynopShowerExample: SynopObservation = {
  station: {
    wmoBlock: 78,
    wmoStation: 954,
    stationName: "TGPY / Maurice Bishop International Airport",
    stationType: 0,
  },
  observedAtUtc: "2026-02-23T15:00:00Z",
  latitudeDeg: 12.0042,
  longitudeDeg: -61.7862,
  stationGroundMslM: 13,

  // Pressure dropped with convective activity
  stationPressurePa: 101_080,
  mslPressurePa: 101_100,
  pressureTendencyChar: 5, // 5 = decreasing then steady
  pressureChange3hPa: -2.0,

  airTemperatureK: 301.15, // 28 °C
  dewpointTemperatureK: 297.15, // 24 °C
  relativeHumidityPct: 82,
  sensorHeightTM: 1.5,

  windDirDegTrue: 120,
  windSpeedMps: 7.7, // ≈ 15 kt
  sensorHeightWindM: 10,
  windGusts: [
    { speedMps: 14.4, periodMinutes: -10, directionDegTrue: null }, // ≈ 28 kt
  ],

  horizontalVisibilityM: 4000,

  presentWeather: 95, // 95 = thunderstorm, slight or moderate (WMO 0-20-3)
  pastWeather1: 17, // 17 = thunderstorm
  pastWeatherPeriodHours: -3,

  cloudCoverTotalPct: 88, // ≈ 7 oktas
  cloudAmountLowMid: 5,
  cloudBaseHeightM: 300,
  cloudTypeLow: 9, // CL = 9 = CB
  cloudLayers: [
    {
      verticalSignificance: 1,
      cloudAmount: 2,
      baseHeightM: 300,
      cloudType: null,
    },
    { verticalSignificance: 1, cloudAmount: 3, baseHeightM: 750, cloudType: 9 },
    {
      verticalSignificance: 1,
      cloudAmount: 5,
      baseHeightM: 1800,
      cloudType: null,
    },
  ],

  precipMeasurements: [
    { amountKgM2: 8.4, periodHours: -6 },
    { amountKgM2: 11.2, periodHours: -24 },
  ],
};
