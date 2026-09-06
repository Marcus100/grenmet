import type {
  CalendarEventPublic,
  PublicHolidayPublic,
  RosterCalendarEntry,
} from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  needsEvents,
  needsRoster,
  rosterScope,
  shiftColor,
  toEventLayer,
  toHolidayLayer,
  toRosterLayer,
} from "./calendar-sources";

function entry(overrides: Partial<RosterCalendarEntry>): RosterCalendarEntry {
  return {
    user_id: "u1",
    display_name: "Jude Andre Charles",
    roster_name: "J. Charles",
    assignment_date: "2026-07-06",
    shift_code: "M",
    label: "Morning",
    category: "WORK",
    starts_at_local: "2026-07-06T05:30:00",
    ends_at_local: "2026-07-06T14:00:00",
    all_day: false,
    is_draft: false,
    ...overrides,
  };
}

function event(overrides: Partial<CalendarEventPublic>): CalendarEventPublic {
  return {
    id: "e1",
    department_id: "gms",
    title: "Monthly staff meeting",
    description: null,
    kind: "MEETING",
    starts_at_local: "2026-07-06T09:30:00",
    ends_at_local: "2026-07-06T10:30:00",
    all_day: false,
    location: "Conference room",
    is_cancelled: false,
    created_by_user_id: "u1",
    created_by_name: "Jude Andre Charles",
    created_at: "2026-07-01T00:00:00+0000",
    ...overrides,
  };
}

describe("toEventLayer — the department's own entries", () => {
  it("passes a timed entry through on its local wall clock", () => {
    const [mapped] = toEventLayer([event({})]);

    expect(mapped.start).toBe("2026-07-06T09:30:00");
    expect(mapped.end).toBe("2026-07-06T10:30:00");
    expect(mapped.allDay).toBe(false);
    expect(mapped.title).toBe("Monthly staff meeting");
    expect(mapped.extendedProps.kind).toBe("event");
    expect(mapped.extendedProps.eventId).toBe("e1");
  });

  it("drops the time part of an all-day entry", () => {
    const [mapped] = toEventLayer([
      event({
        all_day: true,
        starts_at_local: "2026-07-06T00:00:00",
        ends_at_local: "2026-07-06T00:00:00",
      }),
    ]);

    expect(mapped.start).toBe("2026-07-06");
    expect(mapped.end).toBeUndefined();
    expect(mapped.allDay).toBe(true);
  });

  it("keeps a cancelled entry on the calendar, marked and greyed", () => {
    const [mapped] = toEventLayer([event({ is_cancelled: true })]);

    expect(mapped.title).toBe("Monthly staff meeting (cancelled)");
    expect(mapped.color).toBe("var(--gm-risk-grey)");
  });

  it("colours each kind from a design token, never a literal", () => {
    expect(toEventLayer([event({ kind: "TRAINING" })])[0].color).toBe(
      "var(--gm-sky)"
    );
    expect(toEventLayer([event({ kind: "DEADLINE" })])[0].color).toBe(
      "var(--gm-risk-red)"
    );
  });
});

describe("toRosterLayer — the duty roster read onto the calendar", () => {
  it("keeps a timed shift on its own local wall clock", () => {
    const [mapped] = toRosterLayer([entry({})], "mine", { showPerson: false });

    expect(mapped.start).toBe("2026-07-06T05:30:00");
    expect(mapped.end).toBe("2026-07-06T14:00:00");
    expect(mapped.title).toBe("Morning");
  });

  it("runs the night shift into the following morning", () => {
    const [mapped] = toRosterLayer(
      [
        entry({
          shift_code: "N",
          label: "Night",
          starts_at_local: "2026-07-06T22:30:00",
          ends_at_local: "2026-07-07T06:00:00",
        }),
      ],
      "mine",
      { showPerson: false }
    );

    expect(mapped.start).toBe("2026-07-06T22:30:00");
    expect(mapped.end).toBe("2026-07-07T06:00:00");
  });

  it("renders codes with no clock time as all-day on the assignment date", () => {
    const [mapped] = toRosterLayer(
      [
        entry({
          shift_code: "V",
          label: "Vacation",
          category: "LEAVE",
          starts_at_local: null,
          ends_at_local: null,
          all_day: true,
        }),
      ],
      "mine",
      { showPerson: false }
    );

    expect(mapped.start).toBe("2026-07-06");
    expect(mapped.end).toBeUndefined();
    expect(mapped.allDay).toBe(true);
  });

  it("drops off-duty days, which would swamp a month view", () => {
    expect(
      toRosterLayer(
        [entry({ shift_code: "O", label: "Off Duty", category: "OFF" })],
        "department",
        { showPerson: true }
      )
    ).toEqual([]);
  });

  it("shows only leave on the leave view", () => {
    const mapped = toRosterLayer(
      [
        entry({}),
        entry({
          shift_code: "V",
          label: "Vacation",
          category: "LEAVE",
          all_day: true,
          starts_at_local: null,
          ends_at_local: null,
        }),
      ],
      "leave",
      { showPerson: true }
    );

    expect(mapped).toHaveLength(1);
    expect(mapped[0].title).toBe("Jude Andre Charles · Vacation");
  });

  it("names the person on department views and marks draft rosters", () => {
    const [mapped] = toRosterLayer([entry({ is_draft: true })], "department", {
      showPerson: true,
    });

    expect(mapped.title).toBe("Jude Andre Charles · Morning (draft)");
    expect(mapped.extendedProps.isDraft).toBe(true);
  });

  it("colours each shift from a design token, never a literal", () => {
    expect(shiftColor(entry({}))).toBe("var(--gm-sky)");
    expect(shiftColor(entry({ shift_code: "N" }))).toBe("var(--gm-navy)");
    expect(shiftColor(entry({ shift_code: "ZZ", category: "LEAVE" }))).toBe(
      "var(--gm-risk-green)"
    );
  });
});

describe("which layers a view needs", () => {
  it("shows department entries alongside the roster by default", () => {
    expect(needsEvents("department")).toBe(true);
    expect(needsRoster("department")).toBe(true);
  });

  it("skips the roster on the events-only and holidays views", () => {
    expect(needsRoster("events")).toBe(false);
    expect(needsRoster("holidays")).toBe(false);
  });

  it("skips department entries on the roster-derived views", () => {
    expect(needsEvents("leave")).toBe(false);
    expect(needsEvents("holidays")).toBe(false);
  });

  it("asks for only my shifts on my schedule, the department's elsewhere", () => {
    expect(rosterScope("mine")).toBe("me");
    expect(rosterScope("department")).toBe("department");
    expect(rosterScope("leave")).toBe("department");
  });
});

describe("toHolidayLayer", () => {
  it("renders holidays behind the day rather than as another chip", () => {
    const holiday: PublicHolidayPublic = {
      id: "h1",
      name: "Emancipation Day",
      holiday_date: "2026-08-03",
      is_recurring: true,
      country_code: "GD",
      created_by_user_id: "u1",
      created_at: "2026-07-01T00:00:00+0000",
    };

    const [mapped] = toHolidayLayer([holiday]);

    expect(mapped.display).toBe("background");
    expect(mapped.allDay).toBe(true);
    expect(mapped.start).toBe("2026-08-03");
  });
});
