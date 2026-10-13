import { expect, it } from "vitest";
import { READINGS } from "./eregister-readings";

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
  expect(read("s3_layer1_height")).toBe("540");
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
