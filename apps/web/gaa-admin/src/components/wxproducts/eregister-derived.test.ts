import { expect, it } from "vitest";
import {
  deriveCoded,
  humidityFromValues,
  hundredsOfFeet,
  pressureFields,
  pressures,
  qfe,
  qnh,
  settingsPending,
  temperatureGroup,
  visibilityCodeFromKm,
  withDerived,
} from "./eregister-derived";

// The same vectors as apps/api/fastapi/tests/test_eregister_derive.py: the grey
// cells on screen must match what the API stores.
it.each([
  ["0", "00"],
  ["0.05", "00"],
  ["0.1", "01"],
  ["0.8", "08"],
  ["1.1", "11"],
  ["4.9", "49"],
  ["5", "50"],
  ["5.9", "50"],
  ["6", "56"],
  ["18", "68"],
  ["18.9", "68"],
  ["30", "80"],
  ["34.9", "80"],
  ["35", "81"],
  ["39.9", "81"],
  ["70", "88"],
  ["70.1", "89"],
  ["99", "89"],
])("turns %s km into visibility code %s", (km, code) => {
  expect(visibilityCodeFromKm(km)).toBe(code);
});

it("leaves visibility blank while empty and refuses text that is not kilometres", () => {
  expect(visibilityCodeFromKm("")).toBe("");
  expect(visibilityCodeFromKm(undefined)).toBe("");
  for (const text of ["abc", "-1", "1,5", "1e3", "5 km"]) {
    expect(visibilityCodeFromKm(text)).toBeNull();
  }
});

const sources = {
  air_temp: "0280",
  station_pressure: "0153",
  wet_bulb: "0240",
};

it("calculates humidity from dry bulb, wet bulb and station pressure", () => {
  const humidity = humidityFromValues(sources);
  expect(humidity?.dewPoint).toBeCloseTo(22.4, 1);
  expect(humidity?.vapourPressure).toBeCloseTo(27, 0);
  expect(humidity?.relativeHumidity).toBe(72);
  expect(deriveCoded(sources)).toEqual({
    dew_point: "0224",
    relative_humidity: "72",
  });
});

it("reads a wet bulb equal to the dry bulb as saturated air", () => {
  const humidity = humidityFromValues({
    air_temp: "250",
    station_pressure: "0100",
    wet_bulb: "250",
  });
  expect(humidity?.dewPoint).toBeCloseTo(25, 1);
  expect(humidity?.relativeHumidity).toBe(100);
});

it("needs every source and a wet bulb that is not above the dry bulb", () => {
  for (const missing of Object.keys(sources)) {
    expect(humidityFromValues({ ...sources, [missing]: "" })).toBeNull();
  }
  expect(humidityFromValues({ ...sources, wet_bulb: "0300" })).toBeNull();
  expect(deriveCoded({ ...sources, air_temp: "" })).toEqual({});
});

it("keeps a keyed dew point when it cannot be calculated", () => {
  expect(withDerived({ dew_point: "0213" }).dew_point).toBe("0213");
  expect(withDerived({ ...sources, dew_point: "0100" }).dew_point).toBe("0224");
});

it("writes temperatures as snTTT with no negative zero", () => {
  expect(temperatureGroup(22.4)).toBe("0224");
  expect(temperatureGroup(-3.4)).toBe("1034");
  expect(temperatureGroup(-0.04)).toBe("0000");
});

// Owner confirmed for 78958 (2026-10-24); the same vectors as the API tests.
const STATION_78958 = {
  qfeOffsetHpa: 0.3,
  qnhOffsetHpa: 0.1,
  seaLevelOffsetHpa: 1,
  totalCorrectionHpa: 0,
};

it("works out the owner example: barometer 1012.8", () => {
  const values = { barometer_reading: "1012.8" };
  const found = pressures(values, STATION_78958);
  expect(found.station).toBe(10_128);
  expect(found.qfe).toBe(10_131);
  expect(found.seaLevel).toBe(10_138);
  expect(found.qnh).toBe(10_139);
  expect(pressureFields(values, STATION_78958)).toEqual({
    msl_pressure: "0138",
    station_pressure: "0128",
  });
  expect(qfe(values, STATION_78958)).toEqual({ hpa: 1013.1, state: "value" });
  expect(qnh(values, STATION_78958)).toEqual({ hpa: 1013.9, state: "value" });
});

it("follows the Excel register: group 3 0157 gives group 4 0167", () => {
  expect(pressureFields({ station_pressure: "0157" }, STATION_78958)).toEqual({
    msl_pressure: "0167",
  });
});

it.each([
  ["998.5", "9985", "9995"],
  ["999.5", "9995", "0005"],
  ["1000.0", "0000", "0010"],
])("drops the thousands across 1000 hPa (%s)", (reading, station, sea) => {
  expect(pressureFields({ barometer_reading: reading }, STATION_78958)).toEqual(
    { msl_pressure: sea, station_pressure: station }
  );
});

it.each(["1013.25", "1e3", "+1013", "1013."])(
  "works out no pressure groups from %s (not a plain reading)",
  (reading) => {
    expect(
      pressureFields({ barometer_reading: reading }, STATION_78958)
    ).toEqual({});
  }
);

it("keeps keyed groups 3 and 4 and works QFE and QNH from them", () => {
  const values = {
    barometer_reading: "1012.8",
    msl_pressure: "0150",
    station_pressure: "0130",
  };
  expect(pressureFields(values, STATION_78958)).toEqual({});
  expect(qfe(values, STATION_78958)).toEqual({ hpa: 1013.3, state: "value" });
  expect(qnh(values, STATION_78958)).toEqual({ hpa: 1015.1, state: "value" });
});

it("works the station pressure out before the humidity", () => {
  const derived = deriveCoded(
    { air_temp: "280", barometer_reading: "1015.3", wet_bulb: "240" },
    STATION_78958
  );
  expect(derived.station_pressure).toBe("0153");
  expect(derived.dew_point).toBe("0224");
  expect(derived.relative_humidity).toBe("72");
});

it("has nothing to show without a reading, and waits for missing amounts", () => {
  expect(qfe({}, STATION_78958)).toEqual({ state: "empty" });
  const values = { barometer_reading: "1012.8" };
  expect(qfe(values, null)).toEqual({ state: "pending" });
  expect(pressureFields(values, null)).toEqual({});
  expect(qnh(values, { ...STATION_78958, qnhOffsetHpa: null })).toEqual({
    state: "pending",
  });
});

it("reports amounts as pending until all four are set", () => {
  expect(settingsPending(null)).toBe(true);
  expect(settingsPending({ ...STATION_78958, qfeOffsetHpa: null })).toBe(true);
  // Zero is a real amount, not a missing one.
  expect(settingsPending(STATION_78958)).toBe(false);
});

it("converts a cloud base in metres to hundreds of feet", () => {
  expect(hundredsOfFeet(540)).toBe("018");
  expect(hundredsOfFeet(0)).toBe("000");
  expect(hundredsOfFeet(9000)).toBe("295");
});
