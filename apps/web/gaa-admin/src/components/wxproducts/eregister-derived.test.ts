import { expect, it } from "vitest";
import {
  deriveCoded,
  humidityFromValues,
  hundredsOfFeet,
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

const settings = { barometerCorrectionHpa: 0.3, elevationM: 5 };

it("adds the corrections to the barometer for QFE and reduces it for QNH", () => {
  const values = { barometer_reading: "1015.0" };
  expect(qfe(values, settings)).toEqual({ hpa: 1015.3, state: "value" });
  const reduced = qnh(values, settings);
  expect(reduced.state).toBe("value");
  if (reduced.state === "value") expect(reduced.hpa).toBeCloseTo(1015.9, 1);
});

it("has nothing to calculate without a reading, and waits for missing settings", () => {
  expect(qfe({}, settings)).toEqual({ state: "empty" });
  expect(qfe({ barometer_reading: "abc" }, settings)).toEqual({
    state: "empty",
  });
  const values = { barometer_reading: "1015.0" };
  expect(qfe(values, null)).toEqual({ state: "pending" });
  expect(qfe(values, { barometerCorrectionHpa: null, elevationM: 5 })).toEqual({
    state: "pending",
  });
  expect(
    qnh(values, { barometerCorrectionHpa: 0.3, elevationM: null })
  ).toEqual({ state: "pending" });
});

it("reports settings as pending until both are set", () => {
  expect(settingsPending(null)).toBe(true);
  expect(settingsPending({ barometerCorrectionHpa: 0, elevationM: null })).toBe(
    true
  );
  // Zero is a real value, not a missing one.
  expect(settingsPending({ barometerCorrectionHpa: 0, elevationM: 0 })).toBe(
    false
  );
});

it("converts a cloud base in metres to hundreds of feet", () => {
  expect(hundredsOfFeet(540)).toBe("018");
  expect(hundredsOfFeet(0)).toBe("000");
  expect(hundredsOfFeet(9000)).toBe("295");
});
