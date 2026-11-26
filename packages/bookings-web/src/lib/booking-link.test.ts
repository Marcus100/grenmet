import { describe, expect, it } from "vitest";
import {
  dayParam,
  isLongDescription,
  timeParam,
  withChoices,
} from "./booking-link";

describe("dayParam", () => {
  it("accepts a real calendar day", () => {
    expect(dayParam("2027-01-05")).toBe("2027-01-05");
    expect(dayParam("2028-02-29")).toBe("2028-02-29");
  });

  it.each([
    ["an impossible day", "2027-02-30"],
    ["a day in another shape", "05/01/2027"],
    ["a time", "2027-01-05T10:00:00Z"],
    ["an empty value", ""],
    ["a repeated parameter", ["2027-01-05", "2027-01-06"]],
    ["nothing", undefined],
  ])("ignores %s", (_label, value) => {
    expect(dayParam(value)).toBeUndefined();
  });
});

describe("timeParam", () => {
  it("accepts an instant with a zone, as the API gives it", () => {
    expect(timeParam("2027-01-05T13:30:00Z")).toBe("2027-01-05T13:30:00Z");
    expect(timeParam("2027-01-05T09:30:00-04:00")).toBe(
      "2027-01-05T09:30:00-04:00"
    );
  });

  it.each([
    ["no zone", "2027-01-05T13:30:00"],
    ["a day only", "2027-01-05"],
    ["text", "tomorrow"],
    ["a repeated parameter", ["2027-01-05T13:30:00Z", "2027-01-05T14:30:00Z"]],
  ])("ignores %s", (_label, value) => {
    expect(timeParam(value)).toBeUndefined();
  });
});

describe("withChoices", () => {
  const base = "https://bookings.example/studio?utm=1#top";

  it("writes the choices and keeps other parameters and the hash", () => {
    const next = new URL(
      withChoices(base, {
        day: "2027-01-05",
        service: "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f0001",
        time: "2027-01-05T13:30:00Z",
      })
    );
    expect(next.searchParams.get("service")).toBe(
      "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f0001"
    );
    expect(next.searchParams.get("day")).toBe("2027-01-05");
    expect(next.searchParams.get("time")).toBe("2027-01-05T13:30:00Z");
    expect(next.searchParams.get("utm")).toBe("1");
    expect(next.hash).toBe("#top");
  });

  it("drops a parameter whose choice is cleared", () => {
    const linked = withChoices(base, { day: "2027-01-05", service: "x" });
    const cleared = new URL(withChoices(linked, { day: null, service: "x" }));
    expect(cleared.searchParams.has("day")).toBe(false);
    expect(cleared.searchParams.get("service")).toBe("x");
  });
});

describe("isLongDescription", () => {
  it("is false for a short or missing description", () => {
    expect(isLongDescription(null)).toBe(false);
    expect(isLongDescription("A short note.")).toBe(false);
  });

  it("is true past three lines of text or about 180 characters", () => {
    expect(isLongDescription("a".repeat(181))).toBe(true);
    expect(isLongDescription("one\ntwo\nthree\nfour")).toBe(true);
    expect(isLongDescription("one\ntwo\nthree")).toBe(false);
  });
});
