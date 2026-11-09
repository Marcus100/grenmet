import {
  displayProductFields,
  emptyProduct,
  fillableFields,
  MARINE_FORECAST_AREA,
  type ProductKind,
  presentationFields,
  productFields,
  proposeBulletinNumber,
} from "@barrelsgd/gms/products";
import {
  formatWeather,
  isValidWeather,
  parseWeather,
  weatherCodes,
  weatherSentence,
} from "@barrelsgd/gms/weather-types";
import { describe, expect, it } from "vitest";
import {
  feetHint,
  productCanonicalValue,
  productFieldLabel,
  productFieldValue,
  windHint,
} from "./units";

const keys = (kind: ProductKind) => productFields(kind).map((f) => f.key);

describe("weather types (#1197 decision 7)", () => {
  it("parses, formats and words several types with coverage", () => {
    const value = "thunderstorms:isolated,showers-light:scattered,haze";
    expect(parseWeather(value)).toEqual([
      { id: "haze" },
      { id: "showers-light", coverage: "scattered" },
      { id: "thunderstorms", coverage: "isolated" },
    ]);
    expect(formatWeather(parseWeather(value))).toBe(
      "haze,showers-light:scattered,thunderstorms:isolated"
    );
    expect(weatherSentence(value)).toBe(
      "Haze, scattered light showers and isolated thunderstorms."
    );
    expect(weatherCodes(value)).toEqual({
      ww: [5, 17, 80, 95, 97],
      metar: ["HZ", "-SHRA", "TS", "TSRA"],
    });
  });

  it("reads a single type saved before the multi-select", () => {
    expect(parseWeather("Moderate or heavy showers")).toEqual([
      { id: "showers-moderate" },
    ]);
    expect(isValidWeather("Light showers")).toBe(true);
    expect(isValidWeather("haze:scattered")).toBe(false);
    expect(isValidWeather("snow")).toBe(false);
  });

  it("makes weather type a multi-select with its own wording on every forecast", () => {
    for (const kind of ["morning", "midday", "marine-forecast"] as const) {
      const f = productFields(kind).find((g) => g.key === "weatherType");
      expect(f?.type).toBe("weather");
      expect(keys(kind)).toContain("weatherTypeText");
    }
    expect(keys("evening")).toContain("day2WeatherTypeText");
    // The public view shows the wording, not the stored codes.
    expect(presentationFields("morning").map((f) => f.key)).not.toContain(
      "weatherType"
    );
  });
});

describe("morning astronomy (#1197 decision 6)", () => {
  it("shows only sunset today and sunrise tomorrow, as times", () => {
    const astronomy = displayProductFields("morning").filter(
      (f) => f.section === "Astronomy"
    );
    expect(
      astronomy.filter((f) => f.type === "time").map((f) => [f.key, f.label])
    ).toEqual([
      ["sunsetToday", "Sunset today"],
      ["sunriseTomorrow", "Sunrise tomorrow"],
    ]);
    // Older free text stays in the schema so earlier issues still open.
    expect(keys("morning")).toEqual(
      expect.arrayContaining(["sunrise", "sunset"])
    );
    expect(astronomy.map((f) => f.key)).not.toContain("sunrise");
  });
});

describe("Conditions renamed Weather", () => {
  it("leaves no Conditions section", () => {
    for (const kind of [
      "marine",
      "cyclone",
      "flood",
      "dust",
      "tsunami",
    ] as const)
      expect(productFields(kind).some((f) => f.section === "Conditions")).toBe(
        false
      );
  });
});

describe("marine units (knots and metres)", () => {
  const field = (kind: ProductKind, key: string) => {
    const f = productFields(kind).find((g) => g.key === key);
    if (!f) throw new Error(`Missing ${key}`);
    return f;
  };
  it("keeps marine wind in knots and waves in metres, land in mph and feet", () => {
    const marineWind = field("marine-forecast", "windSpeedMin");
    expect(productFieldLabel(marineWind, "marine-forecast")).toBe(
      "Speed from (kt)"
    );
    expect(productFieldValue(marineWind, "15", "marine-forecast")).toBe("15");
    expect(productCanonicalValue(marineWind, "15", "marine-forecast")).toBe(
      "15"
    );
    expect(productFieldLabel(field("marine", "waveHeightMin"), "marine")).toBe(
      "Waves from (m)"
    );
    const landWind = field("morning", "windSpeedMin");
    expect(productFieldLabel(landWind, "morning")).toBe("Speed from (mph)");
    expect(productFieldValue(landWind, "10", "morning")).toBe("11.51");
  });
  it("hints mph for knots and feet for metres on marine products", () => {
    expect(windHint("15", "22", "28", true)).toBe(
      "≈ 17–25 mph · 28–41 km/h, gusts 32 mph"
    );
    expect(feetHint("1.5", "2.5")).toBe("≈ 5–8 ft");
  });
});

describe("marine forecast fields (#1197 decision 3)", () => {
  it("follows the decided order with tides and astronomy last", () => {
    const order = keys("marine-forecast");
    const sequence = [
      "synopsis",
      "windDirFrom",
      "seaStateFrom",
      "waveHeightMin",
      "swellDir",
      "swellHeight",
      "swellPeriod",
      "weatherType",
      "visibilityMin",
      "outlook",
      "tide1Type",
      "sunrise",
      "moonrise",
      "moonPhase",
      "moonPhaseDate",
    ];
    const positions = sequence.map((key) => order.indexOf(key));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
  it("marks sun, moon and tide fields for later auto-fill", () => {
    expect(
      fillableFields("marine-forecast", "almanac").map((f) => f.key)
    ).toEqual([
      "sunrise",
      "sunset",
      "moonrise",
      "moonset",
      "moonPhase",
      "moonPhaseDate",
    ]);
    expect(fillableFields("marine-forecast", "tides").length).toBe(12);
    expect(fillableFields("morning", "almanac").map((f) => f.key)).toEqual([
      "sunsetToday",
      "sunriseTomorrow",
    ]);
  });
});

describe("marine alert defaults and numbering (#1197 decisions 1 and 4)", () => {
  it("defaults the issue details, green level and 24-hour validity", () => {
    const values = emptyProduct("marine", "2026-11-09");
    expect(values.issuedAt).toBe("2026-11-09T05:00");
    expect(values.validFrom).toBe("2026-11-09T05:00");
    expect(values.validTo).toBe("2026-11-10T05:00");
    expect(values.area).toBe(MARINE_FORECAST_AREA);
    expect(values.level).toBe("Green");
    const notice = productFields("marine").find((f) => f.key === "notice");
    expect(notice?.label).toBe("Bulletin purpose");
  });

  const issued = (
    id: string,
    issuedAt: string,
    validTo: string,
    bulletinNumber: string,
    notice = "Advisory"
  ) => ({
    id,
    kind: "marine" as const,
    publishedRevision: 1,
    values: { issuedAt, validTo, bulletinNumber, notice },
  });

  it("continues the event while it is in force", () => {
    const products = [
      issued("a", "2026-11-08T05:00", "2026-11-09T05:00", "1"),
      issued("b", "2026-11-08T17:00", "2026-11-09T17:00", "2"),
    ];
    expect(proposeBulletinNumber("marine", "2026-11-09T05:00", products)).toBe(
      "3"
    );
  });

  it("starts again at 1 after an all clear, an expiry gap or another hazard", () => {
    const allClear = [
      issued("a", "2026-11-08T05:00", "2026-11-09T05:00", "4", "All clear"),
    ];
    expect(proposeBulletinNumber("marine", "2026-11-08T17:00", allClear)).toBe(
      "1"
    );
    const expired = [issued("a", "2026-11-01T05:00", "2026-11-02T05:00", "4")];
    expect(proposeBulletinNumber("marine", "2026-11-09T05:00", expired)).toBe(
      "1"
    );
    expect(proposeBulletinNumber("wind", "2026-11-01T06:00", expired)).toBe(
      "1"
    );
    expect(proposeBulletinNumber("marine", "2026-11-09T05:00", [])).toBe("1");
  });

  it("ignores issues whose issue or expiry time cannot be read", () => {
    const products = [
      issued("good", "2026-11-08T17:00", "2026-11-09T17:00", "2"),
      // Unreadable times would otherwise sort first or end the event.
      issued("bad-issue", "not a time", "2026-11-09T17:00", "7"),
      issued("bad-expiry", "2026-11-09T01:00", "", "9"),
    ];
    expect(proposeBulletinNumber("marine", "2026-11-09T05:00", products)).toBe(
      "3"
    );
    expect(proposeBulletinNumber("marine", "unreadable", products)).toBe("1");
  });
});
