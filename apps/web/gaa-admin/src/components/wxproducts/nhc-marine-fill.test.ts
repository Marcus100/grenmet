import type { NhcMarinePeriod } from "@barrelsgd/api-client";
import { fillableFields } from "@barrelsgd/gms/products";
import { describe, expect, it } from "vitest";
import {
  formatNhcIssue,
  nhcFillValues,
  nhcPeriodSummary,
} from "./nhc-marine-fill";

const ISSUED_UTC = /9 Nov 2026.*19:52 UTC/u;
const FIELDS = fillableFields("marine-forecast", "nhc");

const tonight: NhcMarinePeriod = {
  label: "TONIGHT",
  text: "E winds 15 to 20 kt in the Caribbean. Seas 3 to 5 ft.",
  wind_direction_from: "E",
  wind_direction_to: null,
  wind_min_kt: 15,
  wind_max_kt: 20,
  gust_kt: null,
  sea_min_ft: 3,
  sea_max_ft: 5,
  weather: ["scattered showers"],
};

describe("NHC marine fill", () => {
  it("marks exactly the marine wind and wave fields as NHC-fillable on both marine products", () => {
    const keys = ["marine", "marine-forecast"].map((kind) =>
      fillableFields(kind as "marine", "nhc")
        .map((field) => field.key)
        .sort()
    );
    const expected = [
      "waveHeightMax",
      "waveHeightMin",
      "windDirFrom",
      "windDirTo",
      "windGust",
      "windSpeedMax",
      "windSpeedMin",
    ];
    expect(keys).toEqual([expected, expected]);
  });

  it("fills empty wind and sea fields in knots and metres", () => {
    const result = nhcFillValues(
      { windDirFrom: "", windSpeedMin: "", synopsis: "Typed synopsis" },
      tonight,
      FIELDS
    );
    expect(result.patch).toEqual({
      windDirFrom: "E",
      windSpeedMin: "15",
      windSpeedMax: "20",
      waveHeightMin: "0.91",
      waveHeightMax: "1.52",
    });
    expect(result.filled).toEqual([
      "windDirFrom",
      "windSpeedMin",
      "windSpeedMax",
      "waveHeightMin",
      "waveHeightMax",
    ]);
  });

  it("never overwrites a typed or saved value, and treats blanks as empty", () => {
    const result = nhcFillValues(
      {
        windDirFrom: "NW",
        windSpeedMin: "12",
        windSpeedMax: "",
        waveHeightMin: " ",
        waveHeightMax: "2.5",
      },
      tonight,
      FIELDS
    );
    expect(result.patch).toEqual({ windSpeedMax: "20", waveHeightMin: "0.91" });
    expect(result.filled).toEqual(["windSpeedMax", "waveHeightMin"]);
  });

  it("fills nothing when no period or no AMZ058 wording is available", () => {
    expect(nhcFillValues({}, undefined, FIELDS)).toEqual({
      patch: {},
      filled: [],
    });
  });

  it("fills only the upper limit of 'less than 5 kt' and '3 ft or less', never an invented zero", () => {
    const variable: NhcMarinePeriod = {
      ...tonight,
      wind_direction_from: "Variable",
      wind_min_kt: null,
      wind_max_kt: 5,
      sea_min_ft: null,
      sea_max_ft: 3,
    };
    expect(nhcFillValues({}, variable, FIELDS).patch).toEqual({
      windDirFrom: "Variable",
      windSpeedMax: "5",
      waveHeightMax: "0.91",
    });
  });

  it("summarises an upper limit as 'up to'", () => {
    expect(
      nhcPeriodSummary({
        ...tonight,
        weather: [],
        wind_direction_from: "Variable",
        wind_min_kt: null,
        wind_max_kt: 5,
        sea_min_ft: null,
        sea_max_ft: 3,
      })
    ).toBe("Variable winds up to 5 kt. Seas up to 3 ft (up to 0.91 m)");
  });

  it("shows the period's own text when NHC gives two areas and no single wind", () => {
    const twoAreas: NhcMarinePeriod = {
      ...tonight,
      text: "E winds 15 to 20 kt in the Caribbean, and E 10 to 15 kt in the Atlc. Seas 3 to 5 ft.",
      wind_direction_from: null,
      wind_min_kt: null,
      wind_max_kt: null,
    };
    expect(nhcPeriodSummary(twoAreas)).toBe(twoAreas.text);
    expect(nhcFillValues({}, twoAreas, FIELDS).patch).toEqual({
      waveHeightMin: "0.91",
      waveHeightMax: "1.52",
    });
  });

  it("summarises a period in the units NHC states, with metres in brackets", () => {
    expect(nhcPeriodSummary(tonight)).toBe(
      "E winds 15 to 20 kt. Seas 3 to 5 ft (0.91 to 1.52 m). scattered showers"
    );
  });

  it("states an unknown issue time rather than inventing one", () => {
    expect(formatNhcIssue(null)).toBe("time unknown");
    expect(formatNhcIssue("not a time")).toBe("time unknown");
    expect(formatNhcIssue("2026-11-09T19:52:00Z")).toMatch(ISSUED_UTC);
  });
});
