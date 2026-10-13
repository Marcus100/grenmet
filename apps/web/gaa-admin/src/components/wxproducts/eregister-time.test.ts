import { expect, it } from "vitest";
import { observationTime } from "./eregister-time";

const now = new Date("2026-10-12T21:30:00Z");

it("uses the keyed day and hour in the current UTC month", () => {
  expect(observationTime("10", "06", now).toISOString()).toBe(
    "2026-10-10T06:00:00.000Z"
  );
});

it("moves a day that is still ahead into the previous month", () => {
  expect(observationTime("30", "12", now).toISOString()).toBe(
    "2026-09-30T12:00:00.000Z"
  );
});

it("falls back to the current UTC hour when day or hour is blank", () => {
  expect(observationTime("", "06", now).toISOString()).toBe(
    "2026-10-12T21:00:00.000Z"
  );
  expect(observationTime("12", undefined, now).toISOString()).toBe(
    "2026-10-12T21:00:00.000Z"
  );
});
