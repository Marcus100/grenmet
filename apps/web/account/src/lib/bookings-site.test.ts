import { describe, expect, it } from "vitest";
import { businessPageUrl } from "./bookings-site";

describe("businessPageUrl", () => {
  it("joins the bookings URL and the business slug", () => {
    expect(businessPageUrl("https://bookings.barrels.gd", "babydoll")).toBe(
      "https://bookings.barrels.gd/babydoll"
    );
  });

  it("does not double a trailing slash on the base", () => {
    expect(businessPageUrl("http://localhost:3015/", "babydoll")).toBe(
      "http://localhost:3015/babydoll"
    );
  });

  it("encodes the slug so it cannot add a path or query", () => {
    expect(businessPageUrl("https://bookings.barrels.gd", "a/b?c=1")).toBe(
      "https://bookings.barrels.gd/a%2Fb%3Fc%3D1"
    );
  });
});
