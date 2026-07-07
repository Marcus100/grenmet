import { describe, expect, it } from "vitest";
import {
  formatDayType,
  formatDirection,
  formatTime,
  parseSpec,
  parseTime,
  slugify,
} from "./parse-spec";

const FIXTURE = [
  "kind,route,route_name,shift,direction,day_type,depart,arrive,group_time,stop",
  "trip,1,St. Patrick (Western Main Road),morning,inbound,daily,3:30 a.m.,5:30 a.m.,,",
  "stop,,,,,,,,3:30 a.m.,St. Patrick's Anglican Primary School",
  "stop,,,,,,,,3:30 a.m.,Gouyave",
  "stop,,,,,,,,4:45 a.m.,Melville Street",
  "stop,,,,,,,,5:30 a.m.,MBIA",
  "trip,1,St. Patrick (Western Main Road),morning,outbound,mon_sat,6:10 a.m.,,,",
  "stop,,,,,,,,,MBIA",
  "stop,,,,,,,,,Melville Street",
  "trip,2,Grand Bras via Grand Etang,night,inbound,daily,8:30 p.m.,10:30 p.m.,,",
  "stop,,,,,,,,8:30 p.m.,Grand Bras",
  "stop,,,,,,,,10:30 p.m.,MBIA",
].join("\n");

describe("parseTime", () => {
  it("parses a morning time", () => {
    expect(parseTime("3:30 a.m.")).toBe("03:30");
  });

  it("parses an evening time", () => {
    expect(parseTime("10:30 p.m.")).toBe("22:30");
  });

  it("treats noon as 12:00", () => {
    expect(parseTime("12:00 noon")).toBe("12:00");
  });

  it("treats 12 a.m. as midnight", () => {
    expect(parseTime("12:00 a.m.")).toBe("00:00");
  });

  it("tolerates compact meridiems and whitespace", () => {
    expect(parseTime("  6:10 am ")).toBe("06:10");
    expect(parseTime("2:15 pm")).toBe("14:15");
  });

  it("throws on an invalid time", () => {
    expect(() => parseTime("later")).toThrow("Invalid time");
  });
});

describe("formatTime", () => {
  it("formats 24h values (with or without seconds) to 12h", () => {
    expect(formatTime("05:30")).toBe("5:30 AM");
    expect(formatTime("22:30:00")).toBe("10:30 PM");
    expect(formatTime("12:00:00")).toBe("12:00 PM");
    expect(formatTime("00:00")).toBe("12:00 AM");
  });
});

describe("formatDirection / formatDayType", () => {
  it("labels directions and day-types", () => {
    expect(formatDirection("inbound")).toBe("To MBIA");
    expect(formatDirection("outbound")).toBe("From MBIA");
    expect(formatDayType("daily")).toBe("Daily");
    expect(formatDayType("sun_hol")).toBe("Sundays & public holidays");
    expect(formatDayType("mon_sat")).toBe("Mon–Sat");
  });
});

describe("slugify", () => {
  it("dedupes canonicalised place names, keeps distinct places distinct", () => {
    expect(slugify("Melville Street")).toBe("melville-street");
    expect(slugify("MBIA")).toBe("mbia");
    expect(slugify("St. Patrick's Anglican Primary School")).toBe(
      "st-patrick-s-anglican-primary-school"
    );
  });
});

describe("parseSpec", () => {
  const spec = parseSpec(FIXTURE);

  it("dedupes routes and shared stops", () => {
    expect(spec.routes.map((r) => r.number)).toEqual([1, 2]);
    // MBIA and Melville Street recur across trips/routes -> one stop each.
    expect(spec.stops.filter((s) => s.slug === "mbia")).toHaveLength(1);
    expect(spec.stops.filter((s) => s.slug === "melville-street")).toHaveLength(
      1
    );
  });

  it("keys trips by route/shift/direction/day-type", () => {
    expect(spec.trips.map((t) => t.key)).toEqual([
      "1::morning::inbound::daily",
      "1::morning::outbound::mon_sat",
      "2::night::inbound::daily",
    ]);
  });

  it("normalises trip departure/arrival times", () => {
    const nightInbound = spec.trips.find((t) => t.routeNumber === 2);
    expect(nightInbound?.departTime).toBe("20:30");
    expect(nightInbound?.arriveTime).toBe("22:30");
    const outbound = spec.trips.find((t) => t.direction === "outbound");
    expect(outbound?.arriveTime).toBeNull();
  });

  it("orders stops within a trip and captures group times", () => {
    const morningInbound = spec.tripStops
      .filter((s) => s.tripKey === "1::morning::inbound::daily")
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(morningInbound.map((s) => s.sortOrder)).toEqual([0, 1, 2, 3]);
    expect(morningInbound.map((s) => s.groupTime)).toEqual([
      "03:30",
      "03:30",
      "04:45",
      "05:30",
    ]);
  });

  it("leaves group time null when the document omits it", () => {
    const outboundStops = spec.tripStops.filter(
      (s) => s.tripKey === "1::morning::outbound::mon_sat"
    );
    expect(outboundStops.every((s) => s.groupTime === null)).toBe(true);
  });

  it("resets the per-trip stop counter for each trip", () => {
    const perTrip = new Map<string, number[]>();
    for (const s of spec.tripStops) {
      const list = perTrip.get(s.tripKey) ?? [];
      list.push(s.sortOrder);
      perTrip.set(s.tripKey, list);
    }
    for (const list of perTrip.values()) {
      expect(list[0]).toBe(0);
    }
  });

  it("rejects a stop that appears before any trip", () => {
    const bad = [
      "kind,route,route_name,shift,direction,day_type,depart,arrive,group_time,stop",
      "stop,,,,,,,,,Orphan Stop",
    ].join("\n");
    expect(() => parseSpec(bad)).toThrow("before any trip");
  });
});
