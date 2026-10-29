import { describe, expect, it } from "vitest";
import {
  NEWSLETTER_SIGNUP_SUBMITTED_EVENT,
  UNITS_SWITCHED_EVENT,
  unitsSwitchedProperties,
} from "@/lib/analytics-events";
import { UNIT_SYSTEMS } from "@/lib/units";

describe("analytics event names", () => {
  it("uses the reviewed snake_case names", () => {
    expect(UNITS_SWITCHED_EVENT).toBe("units_switched");
    expect(NEWSLETTER_SIGNUP_SUBMITTED_EVENT).toBe(
      "newsletter_signup_submitted"
    );
  });

  it("sends only the system switched to, never anything about the visitor", () => {
    for (const system of UNIT_SYSTEMS) {
      expect(unitsSwitchedProperties(system)).toEqual({ to: system });
    }
  });
});
