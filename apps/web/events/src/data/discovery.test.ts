import { describe, expect, it } from "vitest";
import type { Profile, PublicEvent } from "@/domain/types";
import {
  buildDemoEvents,
  demoConnections,
  demoProfiles,
} from "./community-fixtures";
import {
  canMessage,
  connectionState,
  filterEvents,
  groupByDay,
  isTonight,
  parseFilters,
  peopleYouMightMeet,
  weekendWindow,
} from "./discovery";

// Saturday 3 October 2026, noon in Grenada.
const saturdayNoon = new Date("2026-10-03T12:00:00-04:00");
const events = buildDemoEvents(saturdayNoon);

const profile = (id: string): Profile => {
  const found = demoProfiles.find((candidate) => candidate.id === id);
  if (!found) {
    throw new Error(`missing profile ${id}`);
  }
  return found;
};

const bySlug = (slug: string): PublicEvent => {
  const found = events.find((event) => event.slug === slug);
  if (!found) {
    throw new Error(`missing event ${slug}`);
  }
  return found;
};

describe("weekendWindow", () => {
  it("starts today on a Saturday", () => {
    expect(weekendWindow(saturdayNoon)).toEqual({
      start: "2026-10-03",
      end: "2026-10-04",
    });
  });

  it("looks ahead to Friday from a Wednesday", () => {
    expect(weekendWindow(new Date("2026-09-30T09:00:00-04:00"))).toEqual({
      start: "2026-10-02",
      end: "2026-10-04",
    });
  });

  it("uses the Grenada date, not UTC, late in the evening", () => {
    // 11 PM Sunday in Grenada is already Monday in UTC.
    expect(weekendWindow(new Date("2026-10-04T23:00:00-04:00"))).toEqual({
      start: "2026-10-04",
      end: "2026-10-04",
    });
  });
});

describe("isTonight", () => {
  it("includes an event later today", () => {
    expect(isTonight(bySlug("feel-free-sunset"), saturdayNoon)).toBe(true);
  });

  it("excludes an event that has already ended today", () => {
    expect(isTonight(bySlug("anse-runners-saturday-5k"), saturdayNoon)).toBe(
      false
    );
  });
});

describe("filterEvents", () => {
  it("drops past events and sorts soonest first", () => {
    const result = filterEvents(events, {}, saturdayNoon);
    expect(result.map((event) => event.slug)).not.toContain(
      "anse-runners-saturday-5k"
    );
    const starts = result.map((event) => event.startsAt);
    expect(starts).toEqual(starts.toSorted());
  });

  it("combines category, parish and price filters", () => {
    const result = filterEvents(
      events,
      { category: "food", parish: "st-george", price: "free" },
      saturdayNoon
    );
    expect(result.map((event) => event.slug)).toEqual(["nutmeg-night-market"]);
  });

  it("treats RSVP events as free", () => {
    const result = filterEvents(
      events,
      { price: "free", category: "tech" },
      saturdayNoon
    );
    expect(result).toHaveLength(1);
  });

  it("limits the weekend to Saturday and Sunday on a Saturday", () => {
    const keys = filterEvents(events, { when: "weekend" }, saturdayNoon).map(
      (event) => event.slug
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        "feel-free-sunset",
        "sunday-jazz-brunch",
        "spice-supper-club-october",
      ])
    );
    expect(keys).not.toContain("spice-isle-tech-october");
  });

  it("matches free-text search on title and venue", () => {
    expect(
      filterEvents(events, { query: "carenage" }, saturdayNoon).map(
        (event) => event.slug
      )
    ).toEqual(["nutmeg-night-market"]);
  });
});

describe("groupByDay", () => {
  it("groups by Grenada date in order", () => {
    const groups = groupByDay(
      filterEvents(events, { when: "weekend" }, saturdayNoon)
    );
    expect(groups.map((group) => group.key)).toEqual([
      "2026-10-03",
      "2026-10-04",
    ]);
  });
});

describe("parseFilters", () => {
  it("keeps known values and drops unknown ones", () => {
    expect(
      parseFilters({
        category: "fete",
        parish: "nowhere",
        when: ["weekend"],
        price: "x",
      })
    ).toEqual({ category: "fete", when: "weekend" });
  });
});

describe("social rules", () => {
  const viewer = profile("p_viewer");

  it("reports each side of a connection request", () => {
    expect(connectionState("p_viewer", "p_dana", demoConnections)).toBe(
      "connected"
    );
    expect(connectionState("p_viewer", "p_devon", demoConnections)).toBe(
      "received"
    );
    expect(connectionState("p_viewer", "p_simone", demoConnections)).toBe(
      "sent"
    );
    expect(connectionState("p_viewer", "p_renee", demoConnections)).toBe(
      "none"
    );
  });

  it("allows messages between connections or shared group members only", () => {
    expect(canMessage(viewer, profile("p_dana"), demoConnections)).toBe(true);
    // Not connected, but both in Anse Runners.
    expect(canMessage(viewer, profile("p_kayla"), demoConnections)).toBe(true);
    // Pending request and no shared group.
    expect(canMessage(viewer, profile("p_simone"), demoConnections)).toBe(
      false
    );
    expect(canMessage(viewer, viewer, demoConnections)).toBe(false);
  });

  it("ranks people going by shared groups and interests", () => {
    const people = peopleYouMightMeet(
      bySlug("spice-isle-tech-october"),
      viewer,
      demoProfiles
    );
    expect(people.map((person) => person.id)).not.toContain("p_viewer");
    expect(people[0]?.id).toBe("p_dana");
  });
});
