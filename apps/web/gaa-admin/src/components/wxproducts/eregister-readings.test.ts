import { expect, it } from "vitest";
import { READINGS, tenthsToCelsius } from "./eregister-readings";

// Paper register, Thursday 30 March 2023, 12 UTC (r1.jpg).
const row: Record<string, string> = {
  wind_indicator: "4",
  visibility: "68",
  total_cloud: "1",
  wind_dir: "07",
  wind_speed: "15",
  air_temp: "0280",
  dew_point: "0213",
  relative_humidity: "67",
  station_pressure: "0153",
  msl_pressure: "0163",
  s3_max_temp: "0295",
  s3_min_temp: "0240",
  s3_rainfall_24h: "0004",
  s3_layer1_amount: "2",
  s3_layer1_height: "18",
};

const read = (key: string, values = row) => READINGS[key]?.(values);

it("calculates the plain readings from the paper register codes", () => {
  expect(read("visibility")).toBe("18");
  expect(read("wind_dir")).toBe("070");
  expect(read("air_temp")).toBe("28.0");
  expect(read("dew_point")).toBe("21.3");
  // Vapour pressure above the RH cell, from the dew point of 21.3 °C.
  expect(read("relative_humidity")).toBe("25.3");
  expect(read("station_pressure")).toBe("1015.3");
  expect(read("msl_pressure")).toBe("1016.3");
  expect(read("s3_max_temp")).toBe("29.5");
  expect(read("s3_min_temp")).toBe("24.0");
  expect(read("s3_rainfall_24h")).toBe("0.4");
  // Cloud base in hundreds of feet (hshshs): code 18 is 540 m, 1772 ft.
  expect(read("s3_layer1_height")).toBe("018");
});

it("reads negative temperatures, variable wind and trace amounts", () => {
  expect(read("air_temp", { air_temp: "1034" })).toBe("-3.4");
  expect(read("wind_dir", { wind_dir: "99" })).toBe("VRB");
  expect(read("s3_rainfall_24h", { s3_rainfall_24h: "9999" })).toBe("Trace");
  expect(read("precip_amount", { precip_amount: "990" })).toBe("Trace");
});

it("is blank while empty and a dash-worthy null for an invalid code", () => {
  expect(read("air_temp", {})).toBe("");
  expect(read("visibility", { visibility: "52" })).toBeNull();
  expect(read("wind_dir", { wind_dir: "070" })).toBeNull();
  expect(read("s3_layer1_height", { s3_layer1_height: "53" })).toBeNull();
});

it("rejects a sign digit other than 0 or 1 and decodes high layer heights", () => {
  expect(tenthsToCelsius("2254")).toBeNull();
  expect(tenthsToCelsius("1034")).toBe(-3.4);
  expect(read("s3_layer1_height", { s3_layer1_height: "81" })).toBe("344");
  expect(read("s3_layer1_height", { s3_layer1_height: "88" })).toBe("689");
  expect(read("s3_layer1_height", { s3_layer1_height: "89" })).toBe(">689");
  expect(read("s3_layer1_height", { s3_layer1_height: "53" })).toBeNull();
});

it("reads the 24 h pressure change keyed as j1 8 (rise) or 9 (fall)", () => {
  const read24 = (value: string) =>
    read("s3_baro_change_24h", { s3_baro_change_24h: value });
  // Paper register columns 43-44: 58 004, 59 011, 59 010.
  expect(read24("8004")).toBe("+0.4");
  expect(read24("9011")).toBe("-1.1");
  expect(read24("9010")).toBe("-1.0");
  expect(read24("8000")).toBe("+0.0");
  expect(read24("9000")).toBe("0.0");
  // Legacy 0 (rise) and 1 (fall) still read; other digits and short entries do not.
  expect(read24("0004")).toBe("+0.4");
  expect(read24("1011")).toBe("-1.1");
  expect(read24("5011")).toBeNull();
  expect(read24("011")).toBeNull();
  expect(read24("")).toBe("");
});

it("shows cloud layer amounts in oktas and heights in hundreds of feet", () => {
  expect(read("s3_layer1_amount", { s3_layer1_amount: "5" })).toBe("5");
  expect(read("s3_layer2_amount", { s3_layer2_amount: "9" })).toBe("Obs");
  expect(read("s3_layer1_amount", {})).toBe("");
  const height = (code: string) =>
    read("s3_layer1_height", { s3_layer1_height: code });
  expect(height("00")).toBe("000");
  expect(height("10")).toBe("010"); // 300 m
  expect(height("50")).toBe("049"); // 1500 m
  expect(height("56")).toBe("059"); // 1800 m
  expect(height("80")).toBe("295"); // 9000 m
});

it("writes the word Nil in column 23 where nothing is reported", () => {
  const rain = (values: Record<string, string>) =>
    read("precip_amount", values);
  // An empty form shows nothing; a row that holds an observation shows Nil.
  expect(rain({})).toBe("");
  expect(rain({ air_temp: "0254" })).toBe("Nil");
  expect(rain({ air_temp: "0254", precip_amount: "000" })).toBe("Nil");
  expect(rain({ precip_amount: "005" })).toBe("5");
  expect(rain({ precip_amount: "993" })).toBe("0.3");
  expect(rain({ precip_amount: "990" })).toBe("Trace");
});

const settings = { barometerCorrectionHpa: 0.3, elevationM: 5 };
const baro = { ...row, barometer_reading: "1015.0" };

it("calculates QFE and QNH from the barometer, corrections and elevation", () => {
  const context = { station: settings };
  expect(READINGS.barometer_reading?.(baro, context)).toBe("+0.3");
  expect(READINGS.station_pressure?.(baro, context)).toBe("1015.3");
  // 5 m of standard atmosphere is about 0.6 hPa.
  expect(READINGS.msl_pressure?.(baro, context)).toBe("1015.9");
});

it("shows a dash, never a guess, while the station settings are pending", () => {
  const none = { barometerCorrectionHpa: null, elevationM: null };
  expect(READINGS.barometer_reading?.(baro, { station: none })).toBe("—");
  expect(READINGS.station_pressure?.(baro, { station: none })).toBe("—");
  expect(READINGS.msl_pressure?.(baro, { station: none })).toBe("—");
  // Corrections known, elevation not: QFE is shown, QNH waits.
  const partial = { barometerCorrectionHpa: 0.3, elevationM: null };
  expect(READINGS.station_pressure?.(baro, { station: partial })).toBe(
    "1015.3"
  );
  expect(READINGS.msl_pressure?.(baro, { station: partial })).toBe("—");
  expect(READINGS.barometer_reading?.(baro)).toBe("—");
});

it("keeps decoding the keyed pressure groups when no barometer was read", () => {
  expect(READINGS.station_pressure?.(row, { station: settings })).toBe(
    "1015.3"
  );
  expect(READINGS.msl_pressure?.(row, { station: settings })).toBe("1016.3");
});

it("takes vapour pressure from the wet bulb when it is keyed", () => {
  const wet = { ...row, wet_bulb: "0240" };
  // Dry 28.0, wet 24.0 at 1015.3 hPa: about 27.0 hPa.
  expect(Number(read("relative_humidity", wet))).toBeCloseTo(27, 0);
});
