import type { BookingClosurePublic } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  affectedBookings,
  closureDays,
  closureFieldErrors,
  closureSpanLabel,
  closureWindow,
  upcomingClosures,
} from "./closures";

const CHRISTMAS: BookingClosurePublic = {
  id: "66666666-6666-4666-8666-666666666666",
  starts_on: "2026-12-25",
  ends_on: "2026-12-25",
  reason: "Christmas",
  created_at: "2026-11-01T12:00:00Z",
};
const NEW_YEAR_RUN: BookingClosurePublic = {
  id: "77777777-7777-4777-8777-777777777777",
  starts_on: "2026-12-30",
  ends_on: "2027-01-02",
  reason: null,
  created_at: "2026-11-02T12:00:00Z",
};
const PAST: BookingClosurePublic = {
  id: "88888888-8888-4888-8888-888888888888",
  starts_on: "2026-10-01",
  ends_on: "2026-10-02",
  reason: "Old",
  created_at: "2026-09-01T12:00:00Z",
};

describe("closureWindow", () => {
  it("accepts one day, and a run that ends after it starts", () => {
    expect(closureWindow("2026-12-25", "2026-12-25")).toEqual({
      ok: true,
      startsOn: "2026-12-25",
      endsOn: "2026-12-25",
    });
    expect(closureWindow("2026-12-30", "2027-01-02")).toMatchObject({
      ok: true,
      endsOn: "2027-01-02",
    });
  });

  it("refuses an end date before the start date, on the end field", () => {
    expect(closureWindow("2026-12-25", "2026-12-24")).toEqual({
      ok: false,
      message: "Check the closed days.",
      fields: { endsOn: "The end date can't be before the start date." },
    });
  });

  it("asks for each missing day on its own field", () => {
    expect(closureWindow("", "")).toMatchObject({
      ok: false,
      fields: {
        startsOn: "Choose the first closed day.",
        endsOn: "Choose the last closed day.",
      },
    });
    expect(closureWindow("2026-12-25", "")).toMatchObject({
      fields: { endsOn: "Choose the last closed day." },
    });
  });

  it("refuses a run longer than the API allows (366 days, both ends counted)", () => {
    expect(closureWindow("2026-01-01", "2026-12-31")).toMatchObject({
      ok: true,
    });
    expect(closureWindow("2026-01-01", "2027-01-01")).toMatchObject({
      ok: true,
    });
    expect(closureWindow("2026-01-01", "2027-01-02")).toMatchObject({
      ok: false,
      fields: { endsOn: "A closure can cover at most 366 days." },
    });
  });

  it("rejects a value that is not a real calendar day", () => {
    expect(closureWindow("2026-02-30", "2026-03-01")).toMatchObject({
      ok: false,
      fields: { startsOn: "Choose the first closed day." },
    });
  });
});

describe("closureDays", () => {
  it("counts both ends", () => {
    expect(closureDays("2026-12-25", "2026-12-25")).toBe(1);
    expect(closureDays("2026-12-30", "2027-01-02")).toBe(4);
  });
});

describe("closureFieldErrors", () => {
  it("maps the API's field locations to the form fields", () => {
    expect(
      closureFieldErrors({
        errors: [
          {
            type: "string_too_long",
            loc: ["body", "reason"],
            msg: "String should have at most 200 characters",
          },
        ],
      })
    ).toEqual({ reason: "String should have at most 200 characters." });
  });

  it("reads the model-level rules from the message, without pydantic's prefix", () => {
    expect(
      closureFieldErrors({
        errors: [
          {
            type: "value_error",
            loc: ["body"],
            msg: "Value error, ends_on must not be before starts_on",
          },
        ],
      })
    ).toEqual({ endsOn: "The end date can't be before the start date." });
    expect(
      closureFieldErrors({
        errors: [
          {
            type: "value_error",
            loc: ["body"],
            msg: "Value error, A closure covers at most 366 days",
          },
        ],
      })
    ).toEqual({ endsOn: "A closure can cover at most 366 days." });
  });

  it("leaves out an error it cannot point at, and returns nothing for other bodies", () => {
    expect(
      closureFieldErrors({
        errors: [{ type: "x", loc: ["body", "unknown"], msg: "Nope" }],
      })
    ).toBeUndefined();
    expect(closureFieldErrors({ detail: "Not found" })).toBeUndefined();
    expect(closureFieldErrors(null)).toBeUndefined();
  });
});

describe("upcomingClosures", () => {
  it("drops closures that ended before today and keeps the earliest first", () => {
    const list = upcomingClosures(
      [NEW_YEAR_RUN, PAST, CHRISTMAS],
      "2026-11-25"
    );
    expect(list.map((item) => item.id)).toEqual([
      CHRISTMAS.id,
      NEW_YEAR_RUN.id,
    ]);
  });

  it("keeps a closure that is running today", () => {
    expect(
      upcomingClosures([PAST], "2026-10-02").map((item) => item.id)
    ).toEqual([PAST.id]);
  });
});

describe("closureSpanLabel", () => {
  it("names one day, or the first and last day of a run", () => {
    expect(closureSpanLabel(CHRISTMAS)).toBe("Friday, 25 December 2026");
    expect(closureSpanLabel(NEW_YEAR_RUN)).toBe(
      "Wednesday, 30 December 2026 to Saturday, 2 January 2027"
    );
  });
});

describe("affectedBookings", () => {
  it("maps the API's bookings to the form's shape, with no name left as undefined", () => {
    expect(
      affectedBookings({
        affected_bookings: [
          {
            id: "99999999-9999-4999-8999-999999999999",
            starts_at: "2026-12-25T13:00:00Z",
            customer_first_name: "Ana",
          },
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            starts_at: "2026-12-26T14:00:00Z",
            customer_first_name: null,
          },
        ],
      })
    ).toEqual([
      {
        id: "99999999-9999-4999-8999-999999999999",
        startsAt: "2026-12-25T13:00:00Z",
        customerFirstName: "Ana",
      },
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        startsAt: "2026-12-26T14:00:00Z",
        customerFirstName: null,
      },
    ]);
    expect(affectedBookings({})).toEqual([]);
  });
});
