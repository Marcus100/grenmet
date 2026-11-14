import { describe, expect, it } from "vitest";
import {
  kindLabel,
  parseLocal,
  spanLabel,
  timeOffFieldErrors,
  timeOffWindow,
} from "./time-off";

const ZONE = "America/Grenada";
const WRITTEN_SPAN = /9:00.* to .*5:00/u;

describe("timeOffWindow", () => {
  it("turns the business clock into UTC instants", () => {
    expect(timeOffWindow("2026-11-20T09:00", "2026-11-20T17:30", ZONE)).toEqual(
      {
        ok: true,
        startsAt: "2026-11-20T13:00:00.000Z",
        endsAt: "2026-11-20T21:30:00.000Z",
      }
    );
  });

  it("accepts a range that spans several days", () => {
    expect(
      timeOffWindow("2026-12-22T00:00", "2027-01-02T00:00", ZONE)
    ).toMatchObject({ ok: true });
  });

  it("refuses an end that is not after the start", () => {
    expect(timeOffWindow("2026-11-20T09:00", "2026-11-20T09:00", ZONE)).toEqual(
      {
        ok: false,
        message: "Check the start and end times.",
        fields: { endsAt: "The end must be after the start." },
      }
    );
    expect(
      timeOffWindow("2026-11-20T17:00", "2026-11-20T09:00", ZONE)
    ).toMatchObject({ ok: false, fields: { endsAt: expect.any(String) } });
  });

  it("names each missing or malformed end", () => {
    expect(timeOffWindow("", "", ZONE)).toMatchObject({
      ok: false,
      fields: {
        startsAt: "Enter the start as a date and time.",
        endsAt: "Enter the end as a date and time.",
      },
    });
    expect(
      timeOffWindow("2026-02-30T09:00", "2026-03-01T09:00", ZONE)
    ).toMatchObject({
      ok: false,
      fields: { startsAt: "Enter the start as a date and time." },
    });
  });
});

describe("parseLocal", () => {
  it("reads a datetime-local value with or without seconds", () => {
    expect(parseLocal("2026-11-20T09:05")).toEqual({
      day: "2026-11-20",
      time: "09:05",
    });
    expect(parseLocal("2026-11-20T09:05:30")).toEqual({
      day: "2026-11-20",
      time: "09:05",
    });
    expect(parseLocal("2026-11-20 09:05")).toBeNull();
    expect(parseLocal("2026-11-20T24:00")).toBeNull();
  });
});

describe("timeOffFieldErrors", () => {
  it("maps each validation item to its field, in plain words", () => {
    expect(
      timeOffFieldErrors({
        detail: "Validation error",
        errors: [
          {
            type: "value_error",
            loc: ["body", "ends_at"],
            msg: "Value error, ends_at must be after starts_at",
          },
          {
            type: "string_too_long",
            loc: ["body", "reason"],
            msg: "String should have at most 200 characters",
          },
        ],
      })
    ).toEqual({
      endsAt: "The end must be after the start.",
      reason: "String should have at most 200 characters.",
    });
  });

  it("leaves out items that name no field we show", () => {
    expect(
      timeOffFieldErrors({
        errors: [{ type: "x", loc: ["body", "other"], msg: "Nope" }],
      })
    ).toBeUndefined();
    expect(timeOffFieldErrors({ detail: "Not found" })).toBeUndefined();
    expect(timeOffFieldErrors(null)).toBeUndefined();
    expect(timeOffFieldErrors("text")).toBeUndefined();
  });

  it("keeps the first message for a field", () => {
    expect(
      timeOffFieldErrors({
        errors: [
          { type: "a", loc: ["body", "starts_at"], msg: "First" },
          { type: "b", loc: ["body", "starts_at"], msg: "Second" },
        ],
      })
    ).toEqual({ startsAt: "First." });
  });
});

describe("row wording", () => {
  it("names the kind", () => {
    expect(kindLabel("time_off")).toBe("Time off");
    expect(kindLabel("extra_hours")).toBe("Extra hours");
  });

  it("writes the span on the business clock", () => {
    const span = spanLabel(
      {
        starts_at: "2026-11-20T13:00:00Z",
        ends_at: "2026-11-20T21:00:00Z",
      },
      ZONE
    );
    expect(span).toMatch(WRITTEN_SPAN);
  });
});
