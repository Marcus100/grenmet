import { describe, expect, it } from "vitest";
import { webcalUrl } from "./calendar-feed";

describe("webcalUrl", () => {
  it("turns the https subscribe address into webcal for calendar apps", () => {
    expect(
      webcalUrl(
        "https://api.barrels.gd/api/v1/bookings/public/calendar/abc.ics"
      )
    ).toBe("webcal://api.barrels.gd/api/v1/bookings/public/calendar/abc.ics");
  });

  it("also converts a local http address", () => {
    expect(webcalUrl("http://localhost:8000/api/v1/x.ics")).toBe(
      "webcal://localhost:8000/api/v1/x.ics"
    );
  });

  it("leaves anything else untouched", () => {
    expect(webcalUrl("webcal://already/x.ics")).toBe("webcal://already/x.ics");
  });
});
