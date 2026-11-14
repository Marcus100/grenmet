import { describe, expect, it } from "vitest";
import { bookingStatusLabel } from "./booking-status";

describe("bookingStatusLabel", () => {
  it.each([
    ["pending_payment", "Waiting for payment"],
    ["pending", "Waiting to be confirmed"],
    ["confirmed", "Confirmed"],
    ["cancelled", "Cancelled"],
    ["no_show", "Marked as no-show"],
    ["completed", "Completed"],
  ])("labels %s in plain words", (status, label) => {
    expect(bookingStatusLabel(status)).toBe(label);
  });

  it("shows an unknown status as the API sent it", () => {
    expect(bookingStatusLabel("refunded_partly")).toBe("refunded_partly");
  });

  it("does not treat inherited object keys as statuses", () => {
    expect(bookingStatusLabel("toString")).toBe("toString");
  });
});
