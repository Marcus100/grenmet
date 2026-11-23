import { describe, expect, it } from "vitest";
import { absoluteBookingUrl } from "./booking-url";

describe("absoluteBookingUrl", () => {
  it("joins an origin without a trailing slash", () => {
    expect(
      absoluteBookingUrl("/babydoll-beauty-bar", "https://bookings.barrels.gd")
    ).toBe("https://bookings.barrels.gd/babydoll-beauty-bar");
  });

  it("never doubles the slash when the origin ends in one", () => {
    expect(
      absoluteBookingUrl("/babydoll-beauty-bar", "https://bookings.barrels.gd/")
    ).toBe("https://bookings.barrels.gd/babydoll-beauty-bar");
  });

  it("keeps the origin's port and drops any path it was given", () => {
    expect(
      absoluteBookingUrl("/sea-salt", "http://localhost:3015/anything/")
    ).toBe("http://localhost:3015/sea-salt");
  });
});
