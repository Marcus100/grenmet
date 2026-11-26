import { describe, expect, it } from "vitest";
import { isPurchasable, purchaseKey } from "./purchasable";

describe("isPurchasable", () => {
  it("is true only for the plan in the listed currency", () => {
    expect(
      isPurchasable(["bookings-monthly:XCD"], "bookings-monthly", "XCD")
    ).toBe(true);
    expect(
      isPurchasable(["bookings-monthly:USD"], "bookings-monthly", "XCD")
    ).toBe(false);
    expect(
      isPurchasable(["events-monthly:XCD"], "bookings-monthly", "XCD")
    ).toBe(false);
  });

  it("treats a missing or empty list as not purchasable", () => {
    expect(isPurchasable(undefined, "bookings-monthly", "XCD")).toBe(false);
    expect(isPurchasable(null, "bookings-monthly", "XCD")).toBe(false);
    expect(isPurchasable([], "bookings-monthly", "XCD")).toBe(false);
  });

  it("builds the plan_key:currency key", () => {
    expect(purchaseKey("bookings-monthly", "XCD")).toBe("bookings-monthly:XCD");
  });
});
