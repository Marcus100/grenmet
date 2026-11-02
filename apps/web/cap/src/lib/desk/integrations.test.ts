import { describe, expect, it } from "vitest";
import { fieldValue, groupRecords, statusLabel } from "./integrations";

describe("integrations wording", () => {
  it("never describes a not-configured channel as working", () => {
    expect(statusLabel("not_configured")).toBe("Not configured");
    expect(fieldValue({ delivery: "not_configured" }, "delivery")).toBe(
      "Not configured"
    );
  });

  it("says when a value is missing rather than leaving it blank", () => {
    expect(statusLabel(null)).toBe("Not reported");
    expect(fieldValue({}, "reason")).toBe("Not reported");
  });

  it("joins list values for display", () => {
    expect(
      fieldValue({ event_types: ["Alert", "Update"] }, "event_types")
    ).toBe("Alert, Update");
  });

  it("returns no rows when the API omits a group", () => {
    expect(groupRecords({}, "webhooks")).toEqual([]);
  });
});
