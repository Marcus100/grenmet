import { describe, expect, it } from "vitest";
import {
  buildSunMoon,
  buildTemperature,
  buildTides,
  parseCelsius,
  parseDirections,
  parseLocalTime,
  parseWind,
} from "@/db/wxproducts/forecast-parsing";

describe("parseWind", () => {
  it("reads a hyphenated range with its unit", () => {
    expect(parseWind("10-20 mph", "E")).toEqual({
      direction_max: "E",
      direction_min: "E",
      speed_max: 20,
      speed_min: 10,
      speed_unit: "mph",
    });
  });

  it("reads an en dash, which is what typing produces", () => {
    expect(parseWind("15–25 mph", "NE to E")?.speed_max).toBe(25);
  });

  it("recognises knots", () => {
    expect(parseWind("12 kt", "N")?.speed_unit).toBe("kt");
  });

  it("treats a single speed as both bounds", () => {
    const wind = parseWind("15 mph", "SE");
    expect(wind?.speed_min).toBe(15);
    expect(wind?.speed_max).toBe(15);
  });

  it("orders the bounds even when typed backwards", () => {
    const wind = parseWind("25-10 mph", "E");
    expect(wind?.speed_min).toBe(10);
    expect(wind?.speed_max).toBe(25);
  });

  it("returns null rather than inventing a speed", () => {
    expect(parseWind("light and variable", "E")).toBeNull();
  });

  it("returns null when the direction is unreadable", () => {
    expect(parseWind("10-20 mph", "variable")).toBeNull();
  });
});

describe("parseDirections", () => {
  it("reads a range", () => {
    expect(parseDirections("NE to E")).toEqual({ max: "E", min: "NE" });
  });

  it("reads a hyphenated range", () => {
    expect(parseDirections("E-SE")).toEqual({ max: "SE", min: "E" });
  });

  it("uses a single direction for both bounds", () => {
    expect(parseDirections("SSW")).toEqual({ max: "SSW", min: "SSW" });
  });

  it("is case insensitive", () => {
    expect(parseDirections("ne")).toEqual({ max: "NE", min: "NE" });
  });

  it("rejects anything not on the compass", () => {
    expect(parseDirections("offshore")).toBeNull();
  });
});

describe("parseLocalTime", () => {
  it("converts pm to 24-hour", () => {
    expect(parseLocalTime("6:25 pm")).toBe("18:25");
  });

  it("keeps am as-is and pads the hour", () => {
    expect(parseLocalTime("5:42 am")).toBe("05:42");
  });

  it("handles midnight and noon, where a naive conversion is wrong", () => {
    expect(parseLocalTime("12:30 am")).toBe("00:30");
    expect(parseLocalTime("12:30 pm")).toBe("12:30");
  });

  it("accepts a.m. with dots", () => {
    expect(parseLocalTime("5:42 a.m.")).toBe("05:42");
  });

  it("passes 24-hour input straight through", () => {
    expect(parseLocalTime("18:25")).toBe("18:25");
  });

  it("rejects an impossible time", () => {
    expect(parseLocalTime("25:99")).toBeNull();
  });

  it("returns null for free text", () => {
    expect(parseLocalTime("around dawn")).toBeNull();
  });
});

describe("parseCelsius", () => {
  it("reads a bare number and a degree-marked one alike", () => {
    expect(parseCelsius("31")).toBe(31);
    expect(parseCelsius("31°C")).toBe(31);
  });

  it("reads a negative value", () => {
    expect(parseCelsius("-2")).toBe(-2);
  });

  it("returns null for free text", () => {
    expect(parseCelsius("warm")).toBeNull();
  });
});

describe("buildTemperature", () => {
  it("keeps a partial reading rather than discarding it", () => {
    expect(buildTemperature("31", "")).toEqual({ max_c: 31, min_c: null });
  });

  it("omits the element when neither value is readable", () => {
    expect(buildTemperature("", "")).toBeNull();
  });
});

describe("buildTides", () => {
  it("records both events with their type", () => {
    expect(buildTides("4:45 pm", "10:30 am")).toEqual({
      events: [
        { time_local: "16:45", type: "high" },
        { time_local: "10:30", type: "low" },
      ],
    });
  });

  it("omits the element when no tide is readable", () => {
    expect(buildTides("", "unknown")).toBeNull();
  });
});

describe("buildSunMoon", () => {
  it("records sunrise and sunset", () => {
    expect(buildSunMoon("5:42 am", "6:25 pm")).toEqual({
      sunrise_local: "05:42",
      sunset_local: "18:25",
    });
  });

  it("omits the element when neither is readable", () => {
    expect(buildSunMoon("", "")).toBeNull();
  });
});
