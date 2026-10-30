import { describe, expect, it } from "vitest";
import { sanitizeEvent } from "./analytics-policy";

describe("gms counts-only events", () => {
  it("accepts units_switched with metric or imperial only", () => {
    expect(sanitizeEvent("gms", "units_switched", { to: "metric" })).toEqual({
      to: "metric",
    });
    expect(sanitizeEvent("gms", "units_switched", { to: "imperial" })).toEqual({
      to: "imperial",
    });
    expect(sanitizeEvent("gms", "units_switched", { to: "kelvin" })).toBeNull();
  });

  it("rejects units_switched properties it does not list", () => {
    expect(
      sanitizeEvent("gms", "units_switched", { to: "metric", extra: "x" })
    ).toBeNull();
    expect(sanitizeEvent("gms", "units_switched", {})).toBeNull();
  });

  it("accepts newsletter_signup_submitted with no properties", () => {
    expect(sanitizeEvent("gms", "newsletter_signup_submitted", {})).toEqual({});
    expect(
      sanitizeEvent("gms", "newsletter_signup_submitted", { email: "a@b.c" })
    ).toBeNull();
  });

  it("keeps the new events to gms only", () => {
    expect(
      sanitizeEvent("elections", "units_switched", { to: "metric" })
    ).toBeNull();
    expect(sanitizeEvent("mbia", "newsletter_signup_submitted", {})).toBeNull();
  });
});
