import { describe, expect, it } from "vitest";
import { formatBookingWhen } from "./booking-when";

// Built from local clock fields so the wall-clock assertions hold in any zone.
const at = (hour: number, minute = 0, day = 14) =>
  new Date(2026, 10, day, hour, minute).toISOString();

describe("formatBookingWhen", () => {
  it("gives the day and the start and end times on one line", () => {
    expect(formatBookingWhen(at(10), at(11, 30))).toBe(
      "Saturday, 14 November 2026, 10:00 am to 11:30 am"
    );
  });

  it("repeats the day for an end time on another day", () => {
    expect(formatBookingWhen(at(23, 0), at(0, 30, 15))).toBe(
      "Saturday, 14 November 2026, 11:00 pm to Sunday, 15 November 2026, 12:30 am"
    );
  });

  it("gives the same times in UTC with a UTC label for the fallback", () => {
    expect(
      formatBookingWhen("2030-01-10T14:00:00Z", "2030-01-10T15:30:00Z", "UTC")
    ).toBe("Thursday, 10 January 2030, 2:00 pm UTC to 3:30 pm UTC");
  });
});
