import type { AstronomyResponse, TidesResponse } from "@barrelsgd/api-client";
import { type ProductField, productFields } from "@barrelsgd/gms/products";
import { describe, expect, it } from "vitest";
import {
  addDays,
  almanacFill,
  clockOf,
  emptyKeys,
  fillDate,
  tideFill,
  tideHeight,
} from "./almanac-fill";

type Day = AstronomyResponse["days"][number];

/** A day row in Grenada time: sunrise, sunset, moonrise (none when null). */
function day(
  date: string,
  options: {
    sunrise?: string;
    sunset?: string;
    moonrise?: string | null;
    moonset?: string | null;
    phase?: string;
  } = {}
): Day {
  const at = (clock: string | null | undefined) =>
    clock
      ? { utc: null, local: `${date}T${clock}:00-04:00` }
      : { utc: null, local: null };
  return {
    date,
    sunrise: at(options.sunrise ?? "06:02"),
    sunset: at(options.sunset ?? "17:41"),
    civil_dawn: at("05:38"),
    civil_dusk: at("18:05"),
    moonrise: at(options.moonrise === undefined ? "09:15" : options.moonrise),
    moonset: at(options.moonset === undefined ? "21:10" : options.moonset),
    moon_phase: options.phase ?? "Waxing Crescent",
  };
}

function astronomy(days: Day[], phases: AstronomyResponse["phases"] = []) {
  const response: AstronomyResponse = {
    location: {
      key: "mbia",
      name: "Grenada (MBIA)",
      latitude: 12.0,
      longitude: -61.8,
    },
    days,
    phases,
  };
  return response;
}

const MORNING = productFields("morning");
const MARINE = productFields("marine-forecast");
const fieldsWith = (all: readonly ProductField[], key: string) =>
  all.filter((f) => f.key === key);
const sunFields = MORNING.filter((f) => f.fillFrom === "almanac");
const marineSunFields = MARINE.filter((f) => f.fillFrom === "almanac");
const marineTideFields = MARINE.filter((f) => f.fillFrom === "tides");

describe("clock and date helpers", () => {
  it("reads the Grenada wall-clock time, not a converted instant", () => {
    expect(clockOf("2026-11-09T17:41:00-04:00")).toBe("17:41");
    expect(clockOf(null)).toBeNull();
  });

  it("adds days across a month end", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-11-09", 0)).toBe("2026-11-09");
  });

  it("dates a section by its issue date, or by its day on an evening", () => {
    expect(fillDate({ issuedAt: "2026-11-09T05:30" }, "2026-11-01", "")).toBe(
      "2026-11-09"
    );
    expect(fillDate({}, "2026-11-01", "")).toBe("2026-11-01");
    expect(fillDate({ day2Date: "2026-11-10" }, "2026-11-09", "day2")).toBe(
      "2026-11-10"
    );
    expect(fillDate({}, "2026-11-09", "day2")).toBeNull();
  });
});

describe("almanac fill (morning and marine)", () => {
  it("fills empty sunset today and sunrise tomorrow from the two day rows", () => {
    const table = astronomy([
      day("2026-11-09", { sunset: "17:41" }),
      day("2026-11-10", { sunrise: "06:03" }),
    ]);
    const result = almanacFill({
      date: "2026-11-09",
      fields: sunFields,
      astronomy: table,
    });
    expect(result.patch).toEqual({
      sunsetToday: "17:41",
      sunriseTomorrow: "06:03",
    });
    expect(result.notes).toEqual([]);
  });

  it("keeps a typed value: a non-empty field is never written", () => {
    const table = astronomy([
      day("2026-11-09", { sunset: "17:41" }),
      day("2026-11-10", { sunrise: "06:03" }),
    ]);
    const { patch } = almanacFill({
      date: "2026-11-09",
      fields: sunFields,
      astronomy: table,
    });
    const typed: Record<string, string> = {
      sunsetToday: "17:50",
      sunriseTomorrow: "",
    };
    expect(emptyKeys(patch, (key) => typed[key])).toEqual(["sunriseTomorrow"]);
  });

  it("says so and leaves the field empty when tomorrow has no row", () => {
    const table = astronomy([day("2026-11-09", { sunset: "17:41" })]);
    const result = almanacFill({
      date: "2026-11-09",
      fields: sunFields,
      astronomy: table,
    });
    expect(result.patch).toEqual({ sunsetToday: "17:41" });
    expect(result.notes).toEqual([
      "No almanac row for 10 Nov 2026. Left empty: Sunrise tomorrow.",
    ]);
  });

  it("says so for a date with no row at all and fills nothing", () => {
    const result = almanacFill({
      date: "2026-12-01",
      fields: sunFields,
      astronomy: astronomy([]),
    });
    expect(result.patch).toEqual({});
    // Tomorrow is a different day, so it gets its own sentence.
    expect(result.notes).toEqual([
      "No almanac row for 1 Dec 2026. Left empty: Sunset today.",
      "No almanac row for 2 Dec 2026. Left empty: Sunrise tomorrow.",
    ]);
  });

  it("fills the marine moon phase name and the next principal phase date", () => {
    const table = astronomy(
      [day("2026-11-09", { phase: "Waxing Crescent" })],
      [
        { phase: "last_quarter", date: "2026-11-05" },
        { phase: "new", date: "2026-11-12" },
        { phase: "first_quarter", date: "2026-11-20" },
      ]
    );
    const result = almanacFill({
      date: "2026-11-09",
      fields: marineSunFields,
      astronomy: table,
    });
    expect(result.patch.moonPhase).toBe("Waxing crescent");
    expect(result.patch.moonPhaseDate).toBe("2026-11-12");
    expect(result.patch.sunrise).toBe("06:02");
    expect(result.patch.moonrise).toBe("09:15");
  });

  it("leaves a moonrise empty on a day the moon does not rise", () => {
    const table = astronomy([day("2026-11-09", { moonrise: null })]);
    const result = almanacFill({
      date: "2026-11-09",
      fields: fieldsWith(marineSunFields, "moonrise"),
      astronomy: table,
    });
    expect(result.patch).toEqual({});
    expect(result.notes).toEqual(["No moonrise on 9 Nov 2026. Left empty."]);
  });

  it("says when no principal phase is on or after the date", () => {
    const result = almanacFill({
      date: "2026-11-09",
      fields: fieldsWith(marineSunFields, "moonPhaseDate"),
      astronomy: astronomy([day("2026-11-09")], []),
    });
    expect(result.patch).toEqual({});
    expect(result.notes).toEqual([
      "No principal moon phase on or after 9 Nov 2026 in the almanac. Left empty: Next principal phase date.",
    ]);
  });
});

const TIDE_FIELDS = marineTideFields;
const tides = (events: TidesResponse["events"]): TidesResponse => ({
  station: "pric",
  name: "Prickly Bay",
  events,
});
const event = (
  type: "HIGH" | "LOW",
  localTime: string,
  height: number
): TidesResponse["events"][number] => ({
  event_type: type,
  time_utc: "2026-11-09T12:00:00Z",
  time_local: `2026-11-09T${localTime}:00-04:00`,
  height_m_mllw: height,
  timing_quality: "predicted",
});

describe("tide fill", () => {
  const four = tides([
    event("LOW", "03:12", 0.2),
    event("HIGH", "09:26", 1.2),
    event("LOW", "15:40", 0.3),
    event("HIGH", "21:55", 1.1),
  ]);

  it("fills all empty tide slots in time order, heights in metres", () => {
    const result = tideFill({
      date: "2026-11-09",
      fields: TIDE_FIELDS,
      prefix: "",
      tides: four,
      marine: true,
      values: {},
    });
    expect(result.patch.tide1Type).toBe("Low");
    expect(result.patch.tide1Time).toBe("03:12");
    expect(result.patch.tide1Height).toBe("0.20");
    expect(result.patch.tide2Type).toBe("High");
    expect(result.patch.tide4Height).toBe("1.10");
    expect(result.rows).toBe(4);
    expect(result.summary[1]).toBe("High 09:26, 1.20 m (3.9 ft)");
    expect(result.notes).toEqual([]);
  });

  it("fills nothing when any tide slot already has a typed value", () => {
    const result = tideFill({
      date: "2026-11-09",
      fields: TIDE_FIELDS,
      prefix: "",
      tides: four,
      marine: false,
      values: { tide2Time: "10:00" },
    });
    expect(result.patch).toEqual({});
    expect(result.rows).toBe(0);
    expect(result.notes).toEqual([
      "Tide slots already have values. Clear them to fill from the almanac.",
    ]);
  });

  it("fills every slot in time order when all tide slots are empty", () => {
    const result = tideFill({
      date: "2026-11-09",
      fields: TIDE_FIELDS,
      prefix: "",
      tides: four,
      marine: false,
      values: { tide1Time: "", tide4Height: "" },
    });
    expect(result.patch.tide1Time).toBe("03:12");
    expect(result.patch.tide2Time).toBe("09:26");
    expect(result.patch.tide3Time).toBe("15:40");
    expect(result.patch.tide4Time).toBe("21:55");
    expect(result.rows).toBe(4);
  });

  it("says so when the table has no predictions for the date", () => {
    const result = tideFill({
      date: "2026-12-25",
      fields: TIDE_FIELDS,
      prefix: "",
      tides: four,
      marine: true,
      values: {},
    });
    expect(result.patch).toEqual({});
    expect(result.rows).toBe(0);
    expect(result.notes).toEqual([
      "No tide predictions for 25 Dec 2026 in the table. Tide fields left empty.",
    ]);
  });

  it("reports tides that do not fit when the slots are all used", () => {
    const values = {
      tide1Type: "Low",
      tide2Type: "High",
      tide3Type: "Low",
      tide4Type: "High",
    };
    const result = tideFill({
      date: "2026-11-09",
      fields: TIDE_FIELDS,
      prefix: "",
      tides: four,
      marine: true,
      values,
    });
    expect(result.patch).toEqual({});
    expect(result.notes).toEqual([
      "Tide slots already have values. Clear them to fill from the almanac.",
    ]);
  });

  it("formats heights in metres, with feet in brackets on marine products", () => {
    expect(tideHeight(1.2, true)).toBe("1.20 m (3.9 ft)");
    expect(tideHeight(1.2, false)).toBe("1.20 m");
  });
});
