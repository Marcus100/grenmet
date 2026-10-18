import { expect, it } from "vitest";
import {
  cloudGroups,
  heightGroup,
  metarFromCoded,
  pressureGroup,
  temperatureGroup,
  visibilityGroup,
  windGroup,
} from "./eregister-metar";

// Paper register, Thursday 30 March 2023, 12 UTC (station 78958).
const row: Record<string, string> = {
  wind_indicator: "4",
  visibility: "68",
  total_cloud: "1",
  wind_dir: "07",
  wind_speed: "15",
  air_temp: "0280",
  dew_point: "0213",
  msl_pressure: "0163",
  s3_layer1_amount: "1",
  s3_layer1_form: "8",
  s3_layer1_height: "18",
};

const wind = (dir: string, speed: string, indicator = "4", gust?: string) =>
  windGroup({
    wind_dir: dir,
    wind_speed: speed,
    wind_indicator: indicator,
    ...(gust ? { wind_gust: gust } : {}),
  });

it("builds a complete METAR line with the UTC time group", () => {
  // Regression: the time group used to read "3012:0Z".
  expect(metarFromCoded("2023-03-30T12:00:00.000Z", row)).toBe(
    "METAR TGPY 301200Z 07015KT 9999 FEW018 28/21 Q1016="
  );
  expect(metarFromCoded("2023-03-30T06:30:00.000Z", row)).toContain("300630Z");
});

it("shows missing data as placeholders, never as calm or Q1000", () => {
  expect(windGroup({})).toBe("/////KT");
  expect(pressureGroup("")).toBe("Q////");
  expect(visibilityGroup("")).toBe("////");
  expect(cloudGroups({})).toBe("//////");
  expect(temperatureGroup("")).toBe("//");
});

it("reports calm, variable, north and m/s wind", () => {
  expect(wind("00", "00")).toBe("00000KT");
  expect(wind("36", "10")).toBe("36010KT");
  expect(wind("99", "02")).toBe("VRB02KT");
  expect(wind("09", "05", "1")).toBe("09010KT");
  // dd 00 with a speed is invalid; do not invent a direction.
  expect(wind("00", "05")).toBe("/////KT");
});

it("adds a gust only when it exceeds the mean by 10 kt", () => {
  expect(wind("09", "12", "4", "22")).toBe("09012G22KT");
  expect(wind("09", "12", "4", "18")).toBe("09012KT");
});

it("maps visibility code table 4377 to METAR metres", () => {
  expect(visibilityGroup("00")).toBe("0000");
  expect(visibilityGroup("08")).toBe("0800");
  expect(visibilityGroup("33")).toBe("3300");
  expect(visibilityGroup("56")).toBe("6000");
  expect(visibilityGroup("60")).toBe("9999");
  expect(visibilityGroup("80")).toBe("9999");
  expect(visibilityGroup("52")).toBe("////");
  // Regression: codes 90 to 96 are poor visibility and used to print 9999.
  expect(visibilityGroup("92")).toBe("0200");
  expect(visibilityGroup("94")).toBe("1000");
  expect(visibilityGroup("96")).toBe("4000");
  expect(visibilityGroup("97")).toBe("9999");
});

it("rounds cloud bases to 100 ft, then 1000 ft above 10 000 ft", () => {
  expect(heightGroup(1)).toBe("001");
  expect(heightGroup(10)).toBe("010");
  expect(heightGroup(18)).toBe("018");
  expect(heightGroup(50)).toBe("049"); // 1500 m = 4921 ft
  expect(heightGroup(56)).toBe("059"); // 1800 m
  expect(heightGroup(80)).toBe("300"); // 9000 m = 29 528 ft -> 30 000 ft
  expect(heightGroup(81)).toBe("340"); // 10 500 m = 34 449 ft
  expect(heightGroup(53)).toBeNull();
});

it("builds cloud from the layers with CB, FEW/SCT/BKN/OVC and VV", () => {
  expect(
    cloudGroups({
      total_cloud: "6",
      s3_layer1_amount: "2",
      s3_layer1_form: "9",
      s3_layer1_height: "15",
      s3_layer2_amount: "5",
      s3_layer2_form: "6",
      s3_layer2_height: "40",
    })
  ).toBe("FEW015CB BKN039");
  expect(cloudGroups({ total_cloud: "0" })).toBe("NSC");
  expect(cloudGroups({ total_cloud: "9" })).toBe("VV///");
  expect(cloudGroups({ total_cloud: "8" })).toBe("OVC///");
});

it("keeps the sign of cold temperatures and the thousands of pressure", () => {
  expect(temperatureGroup("1034")).toBe("M03");
  expect(temperatureGroup("1004")).toBe("M00");
  expect(temperatureGroup("0254")).toBe("25");
  expect(pressureGroup("9985")).toBe("Q0999");
  expect(pressureGroup("0149")).toBe("Q1015");
});
